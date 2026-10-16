import { createHash } from 'crypto';
import RedisMock from 'ioredis-mock';
import type { RedisClient } from '../src/infra/redis';

/**
 * Testler için Redis: ioredis-mock (gerçek Redis GEREKMEZ). Aynı süreçteki tüm örnekler aynı veriyi ve
 * pub/sub kanallarını paylaşır → "iki API örneği" tek testte taklit edilebilir.
 *
 * ioredis-mock `call()` ve `SCRIPT LOAD` desteklemez; rate-limit-redis bunları kullandığı için
 * `mockSendCommand` SCRIPT LOAD / EVALSHA'yı mock'un `eval`'ına çevirir.
 */
export function createMockRedis(): RedisClient {
  return new RedisMock() as unknown as RedisClient;
}

let shared: RedisClient | null = null;
/** Paylaşılan komut bağlantısı (her testte yeni mock açmamak için; abone bağlantıları ayrı olmalı) */
export function sharedMockRedis(): RedisClient {
  if (!shared) shared = createMockRedis();
  return shared;
}

/** setRedisFactoryForTests için: komut bağlantısı paylaşılır, abone bağlantıları yeni */
export const mockRedisFactory = (kind: 'command' | 'subscriber'): RedisClient =>
  kind === 'command' ? sharedMockRedis() : createMockRedis();

type Reply = boolean | number | string | (boolean | number | string)[];

export function mockSendCommand(client: RedisClient = sharedMockRedis()) {
  const scripts = new Map<string, string>();
  const anyClient = client as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  return async (...args: string[]): Promise<Reply> => {
    const [cmd, ...rest] = args;
    const c = cmd.toUpperCase();
    if (c === 'SCRIPT' && rest[0]?.toUpperCase() === 'LOAD') {
      const sha = createHash('sha1').update(rest[1]).digest('hex');
      scripts.set(sha, rest[1]);
      return sha;
    }
    if (c === 'EVALSHA') {
      const [sha, numKeys, ...more] = rest;
      const script = scripts.get(sha);
      if (!script) throw new Error('NOSCRIPT No matching script');
      return (await anyClient.eval(script, Number(numKeys), ...more)) as Reply;
    }
    const fn = anyClient[cmd.toLowerCase()];
    if (typeof fn !== 'function') throw new Error(`mock: desteklenmeyen komut ${cmd}`);
    return (await fn.apply(client, rest)) as Reply;
  };
}

/** Tüm mock verisini siler (testler arası) */
export async function flushMockRedis(): Promise<void> {
  await (sharedMockRedis() as unknown as { flushall: () => Promise<unknown> }).flushall();
}
