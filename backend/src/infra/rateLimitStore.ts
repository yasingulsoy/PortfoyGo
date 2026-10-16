import { createHash } from 'crypto';
import rateLimit, { type Options, type RateLimitRequestHandler, type Store } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { getRedis, isRedisEnabled, isRedisUsable, redisKey } from './redis';

/**
 * express-rate-limit sayaçları için paylaşılan depo.
 *
 * REDIS_URL yoksa: depo verilmez → express-rate-limit'in varsayılan MemoryStore'u (bugünkü gibi, örnek başına).
 * REDIS_URL varsa: her sınırlayıcı kendi ön ekiyle (portfoygo:rl:<ad>:) Redis'te sayar → tüm API örnekleri ortak.
 *
 * Kesinti politikası: Redis kopukken komut gönderilmez, hata döner ve `passOnStoreError: true` ile istek
 * sınırlanmadan geçer (Redis kesintisi API'yi durdurmaz). Bağlantı gelince betikler yeniden yüklenir.
 */

type SendCommand = (...args: string[]) => Promise<RedisReply>;

/**
 * rate-limit-redis deposu + iki dayanıklılık eki:
 *  - init betik yüklemesini bekletmez (hata sessizce yutulur; ilk istekte yeniden denenir),
 *  - bir komut başarısız olursa (ör. Redis yeniden başladı) betik SHA'ları yeniden yüklenir
 *    (kütüphane yalnızca NOSCRIPT hatasında yeniler; reddedilmiş SHA promise'i aksi halde kalıcı olur).
 */
class ResilientRedisStore extends RedisStore {
  private reloadScripts(): void {
    this.incrementScriptSha = this.loadIncrementScript();
    this.getScriptSha = this.loadGetScript();
    this.incrementScriptSha.catch(() => undefined);
    this.getScriptSha.catch(() => undefined);
  }

  override async init(options: Options): Promise<void> {
    this.windowMs = options.windowMs;
    this.reloadScripts();
  }

  override async increment(key: string) {
    try {
      return await super.increment(key);
    } catch (err) {
      this.reloadScripts();
      throw err;
    }
  }

  override async get(key: string) {
    try {
      return await super.get(key);
    } catch (err) {
      this.reloadScripts();
      throw err;
    }
  }
}

function defaultSendCommand(): SendCommand {
  return async (...args: string[]) => {
    const client = getRedis();
    if (!isRedisUsable(client)) throw new Error('Redis bağlantısı hazır değil');
    const [command, ...rest] = args;
    return (await client.call(command, ...rest)) as RedisReply;
  };
}

let sendCommandOverride: SendCommand | null = null;

/** YALNIZCA TESTLER: Redis komut gönderimini değiştirir (ör. ioredis-mock üstünde SCRIPT/EVALSHA taklidi). */
export function setRateLimitSendCommandForTests(fn: SendCommand | null): void {
  sendCommandOverride = fn;
}

const usedNames = new Set<string>();

/** Sınırlayıcı adı → depo. Redis yoksa undefined (MemoryStore). Aynı ad iki kez kullanılamaz. */
export function sharedRateLimitStore(name: string): Store | undefined {
  if (!isRedisEnabled() && !sendCommandOverride) return undefined;
  if (usedNames.has(name)) throw new Error(`[rate-limit] "${name}" adı birden fazla sınırlayıcıda kullanılıyor`);
  usedNames.add(name);
  return new ResilientRedisStore({
    prefix: `${redisKey('rl', name)}:`,
    sendCommand: sendCommandOverride ?? defaultSendCommand(),
  });
}

const signatureCounts = new Map<string, number>();

/**
 * Adsız sınırlayıcılar (middleware/rateLimits.ts → make()) için kararlı ad: mesaj + pencere + limit özeti ve
 * aynı imzanın kaçıncı kez kullanıldığı. Başka yerlere sınırlayıcı eklenince değişmez (sıra sayacından iyidir).
 */
export function autoLimiterName(windowMs: number, limit: number, message: string): string {
  const sig = createHash('sha1').update(`${windowMs}|${limit}|${message}`).digest('hex').slice(0, 10);
  const n = signatureCounts.get(sig) ?? 0;
  signatureCounts.set(sig, n + 1);
  return n === 0 ? `m-${sig}` : `m-${sig}-${n}`;
}

/**
 * express-rate-limit sarmalayıcısı: standart başlıklar + (Redis varsa) paylaşılan depo + depo hatasında açık geçiş.
 * Rota dosyalarındaki `rateLimit({...})` yerine `createRateLimiter('ad', {...})` kullanın; ad Redis ön ekidir.
 */
export function createRateLimiter(name: string, options: Partial<Options>): RateLimitRequestHandler {
  const store = sharedRateLimitStore(name);
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...options,
    ...(store ? { store, passOnStoreError: true } : {}),
  });
}
