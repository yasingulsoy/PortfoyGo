import Redis, { type RedisOptions } from 'ioredis';
import { logger } from '../utils/logger';
import { appRole } from './runtime';

/**
 * İsteğe bağlı Redis (REDIS_URL). Tanımsızsa HİÇBİR bağlantı açılmaz ve her şey bugünkü gibi süreç içinde kalır:
 *   - SSE olay yolları (bildirim, Arena)  → infra/fanout.ts
 *   - HTTP rate limit sayaçları            → middleware/rateLimits.ts (rate-limit-redis)
 *   - Zamanlanmış iş durumları (admin)    → jobs/sharedStatus.ts
 *
 * Ortam:
 *   REDIS_URL     redis://[:şifre@]host:6379/0  veya  rediss://… (TLS)
 *   REDIS_PREFIX  anahtar/kanal ön eki (varsayılan "portfoygo"); aynı Redis'i paylaşan ortamları ayırır
 *
 * Hata politikası: Redis erişilemezse istekler BEKLETİLMEZ — rate limit "açık" geçer (passOnStoreError),
 * olaylar yalnızca yerel istemcilere iletilir, iş durumu yazılmaz. Bağlantı arka planda yeniden kurulur.
 */

export type RedisClient = Redis;
type ConnectionKind = 'command' | 'subscriber';
type RedisFactory = (kind: ConnectionKind) => RedisClient;

let commandClient: RedisClient | null = null;
const extraClients = new Set<RedisClient>();
let testFactory: RedisFactory | null = null;

export function redisUrl(): string | null {
  const url = process.env.REDIS_URL?.trim();
  return url ? url : null;
}

/** Redis kullanılıyor mu? (REDIS_URL tanımlı veya testte sahte istemci enjekte edilmiş) */
export function isRedisEnabled(): boolean {
  return testFactory !== null || redisUrl() !== null;
}

export function redisPrefix(): string {
  const p = process.env.REDIS_PREFIX?.trim();
  return `${p && /^[A-Za-z0-9_.:-]{1,40}$/.test(p) ? p : 'portfoygo'}:`;
}

/** Ön ekli anahtar / kanal adı: redisKey('rl', 'login') → "portfoygo:rl:login" */
export function redisKey(...parts: string[]): string {
  return redisPrefix() + parts.join(':');
}

/** Bağlantı hazır değilse komut göndermek yerine hemen vazgeçilir (istekler Redis kesintisinde beklemesin). */
export function isRedisUsable(client: RedisClient): boolean {
  const status = (client as { status?: string }).status;
  // ioredis: wait | connecting | connect | ready | reconnecting | close | end. 'connecting/connect' sırasında
  // komutlar çevrimdışı kuyruğa girer (açılışta tek seferlik); kopukken (reconnecting/close/end) reddedilir.
  return status !== 'reconnecting' && status !== 'close' && status !== 'end';
}

function errorLogger(kind: ConnectionKind) {
  let lastLoggedAt = 0;
  let suppressed = 0;
  return (err: Error) => {
    const now = Date.now();
    if (now - lastLoggedAt < 30_000) {
      suppressed += 1;
      return;
    }
    lastLoggedAt = now;
    logger.warn(
      { err: err?.message || String(err), suppressed },
      `[redis] ${kind} bağlantı hatası (istekler Redis'siz devam ediyor)`
    );
    suppressed = 0;
  };
}

function options(kind: ConnectionKind): RedisOptions {
  return {
    connectionName: `portfoygo-${appRole()}-${kind}`,
    // Kopukken komutlar en fazla bir yeniden bağlanma denemesi bekler, sonra hata döner
    maxRetriesPerRequest: kind === 'subscriber' ? null : 1,
    // Komut başına üst sınır: yavaş/askıda Redis HTTP isteklerini bekletmesin (abone bağlantısında yok)
    ...(kind === 'command' ? { commandTimeout: 1500 } : {}),
    enableOfflineQueue: true,
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
    keepAlive: 30_000,
  };
}

function create(kind: ConnectionKind): RedisClient {
  if (testFactory) return testFactory(kind);
  const url = redisUrl();
  if (!url) throw new Error('[redis] REDIS_URL tanımlı değil');
  const client = new Redis(url, options(kind));
  client.on('error', errorLogger(kind));
  return client;
}

/** Paylaşılan komut bağlantısı (GET/SET/EVALSHA/PUBLISH …). Yalnızca isRedisEnabled() iken çağırın. */
export function getRedis(): RedisClient {
  if (!commandClient) commandClient = create('command');
  return commandClient;
}

/** Abone (SUBSCRIBE) modu için ayrı bağlantı — abone moddaki bağlantı başka komut çalıştıramaz. */
export function createRedisSubscriber(): RedisClient {
  const client = create('subscriber');
  extraClients.add(client);
  return client;
}

/** Kapanışta tüm bağlantıları kapatır (worker / testler). */
export async function closeRedis(): Promise<void> {
  const all = [...extraClients, ...(commandClient ? [commandClient] : [])];
  extraClients.clear();
  commandClient = null;
  await Promise.all(
    all.map(async (c) => {
      try {
        await c.quit();
      } catch {
        c.disconnect();
      }
    })
  );
}

/**
 * YALNIZCA TESTLER: gerçek Redis yerine sahte istemci (ör. ioredis-mock) üretir. null → varsayılana dön.
 * Önceki bağlantılar unutulur (kapatılmaz).
 */
export function setRedisFactoryForTests(factory: RedisFactory | null): void {
  testFactory = factory;
  commandClient = null;
  extraClients.clear();
}
