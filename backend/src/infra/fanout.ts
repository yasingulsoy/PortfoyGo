import { logger } from '../utils/logger';
import { busMessages } from '../observability/metrics';
import { createRedisSubscriber, getRedis, isRedisEnabled, isRedisUsable, redisKey, type RedisClient } from './redis';
import { INSTANCE_ID } from './runtime';

/**
 * Süreç içi olay yollarının (SSE) örnekler arası dağıtımı.
 *
 * REDIS_URL yoksa: publish() yalnızca yerel dinleyicilere iletir — bugünkü davranışın aynısı.
 * REDIS_URL varsa:
 *   1) publish() olayı ÖNCE yerel dinleyicilere iletir (gecikme yok; Redis kesintisinde de yerel istemciler alır),
 *   2) sonra {o: örnek kimliği, t: konu, e: olay} zarfını Redis kanalına PUBLISH eder,
 *   3) diğer örnekler mesajı alıp kendi yerel dinleyicilerine iletir; yayınlayan örnek kendi mesajını
 *      (o === INSTANCE_ID) yok sayar → çift teslim olmaz.
 *
 * Kanal başına tek Redis kanalı (ör. "portfoygo:bus:notifications"); konu (kullanıcı / tur kimliği) zarfın içindedir.
 * Abonelik tembeldir: bir örnek ilk yerel dinleyici eklendiğinde abone olur (yalnızca yayın yapan worker abone olmaz).
 * Teslim "en fazla bir kez"dir (Redis pub/sub kalıcı değildir); SSE istemcileri yeniden bağlanınca güncel durumu
 * zaten veritabanından çeker.
 */

export interface FanoutTransport {
  /** Ateşle ve unut; hata yayıncıya yansımaz */
  publish(channel: string, payload: string): void;
  /** Kanal başına bir kez çağrılır */
  subscribe(channel: string, onMessage: (payload: string) => void): void;
}

interface Envelope {
  o: string;
  t: string;
  e: unknown;
}

export class RedisFanoutTransport implements FanoutTransport {
  private subscriber: RedisClient | null = null;
  private readonly handlers = new Map<string, (payload: string) => void>();

  publish(channel: string, payload: string): void {
    const client = getRedis();
    if (!isRedisUsable(client)) {
      busMessages.inc({ bus: channelName(channel), direction: 'dropped' });
      return;
    }
    client.publish(channel, payload).catch((err: Error) => {
      busMessages.inc({ bus: channelName(channel), direction: 'dropped' });
      logger.debug({ err: err?.message }, '[fanout] Redis PUBLISH başarısız');
    });
  }

  subscribe(channel: string, onMessage: (payload: string) => void): void {
    if (this.handlers.has(channel)) return;
    this.handlers.set(channel, onMessage);
    if (!this.subscriber) {
      this.subscriber = createRedisSubscriber();
      this.subscriber.on('message', (ch: string, msg: string) => this.handlers.get(ch)?.(msg));
    }
    // ioredis yeniden bağlanınca abonelikleri kendiliğinden yeniler (autoResubscribe)
    this.subscriber.subscribe(channel).catch((err: Error) => {
      logger.warn({ err: err?.message }, `[fanout] Redis SUBSCRIBE başarısız (${channel}); yeniden bağlanınca denenecek`);
    });
  }
}

/** "portfoygo:bus:notifications" → "notifications" (metrik etiketi) */
function channelName(channel: string): string {
  return channel.slice(channel.lastIndexOf(':') + 1);
}

let redisTransport: RedisFanoutTransport | null = null;
let transportOverride: FanoutTransport | null | undefined;

function resolveTransport(): FanoutTransport | null {
  if (transportOverride !== undefined) return transportOverride;
  if (!isRedisEnabled()) return null;
  if (!redisTransport) redisTransport = new RedisFanoutTransport();
  return redisTransport;
}

/** YALNIZCA TESTLER: taşıyıcıyı değiştirir (null → kapalı, undefined → ortama göre). */
export function setFanoutTransportForTests(t: FanoutTransport | null | undefined): void {
  transportOverride = t;
  redisTransport = null;
}

export interface FanoutOptions<E> {
  /** JSON'dan dönen olayı tekrar uygulama tipine çevirir (ör. tarih alanları) */
  revive?: (raw: unknown) => E;
  /** Testlerde iki "örnek"i aynı süreçte taklit etmek için */
  instanceId?: string;
  /** Testler: sabit taşıyıcı (verilmezse ortama göre: REDIS_URL → Redis, yoksa yalnızca yerel) */
  transport?: FanoutTransport;
}

export class FanoutChannel<E> {
  private subscribed = false;
  private readonly revive: (raw: unknown) => E;
  private readonly instanceId: string;
  private readonly fixedTransport: FanoutTransport | undefined;

  constructor(
    readonly name: string,
    private readonly deliver: (topic: string, event: E) => void,
    opts: FanoutOptions<E> = {}
  ) {
    this.revive = opts.revive ?? ((raw) => raw as E);
    this.instanceId = opts.instanceId ?? INSTANCE_ID;
    this.fixedTransport = opts.transport;
  }

  private transport(): FanoutTransport | null {
    return this.fixedTransport ?? resolveTransport();
  }

  get channel(): string {
    return redisKey('bus', this.name);
  }

  publish(topic: string, event: E): void {
    this.deliver(topic, event);
    const transport = this.transport();
    if (!transport) return;
    let payload: string;
    try {
      payload = JSON.stringify({ o: this.instanceId, t: topic, e: event } satisfies Envelope);
    } catch (err) {
      logger.warn({ err }, `[fanout] ${this.name} olayı serileştirilemedi; yalnızca yerel iletildi`);
      return;
    }
    busMessages.inc({ bus: this.name, direction: 'out' });
    transport.publish(this.channel, payload);
  }

  /** İlk yerel dinleyici eklenirken çağrılır; Redis yoksa no-op. */
  ensureSubscribed(): void {
    if (this.subscribed) return;
    const transport = this.transport();
    if (!transport) return;
    this.subscribed = true;
    transport.subscribe(this.channel, (raw) => this.onRemote(raw));
  }

  private onRemote(raw: string): void {
    let env: Envelope;
    try {
      env = JSON.parse(raw) as Envelope;
    } catch {
      return;
    }
    if (!env || typeof env.t !== 'string' || env.o === this.instanceId) return;
    let event: E;
    try {
      event = this.revive(env.e);
    } catch (err) {
      logger.warn({ err }, `[fanout] ${this.name} uzak olayı çözümlenemedi`);
      return;
    }
    busMessages.inc({ bus: this.name, direction: 'in' });
    this.deliver(env.t, event);
  }
}
