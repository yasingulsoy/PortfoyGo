import { describe, expect, it } from 'vitest';
import { TtlCache, ttlFromEnv } from '../src/utils/ttlCache';

describe('TtlCache (sıralama / piyasa listesi önbelleği)', () => {
  it('TTL içinde tek yükleme; eşzamanlı istekler aynı yüklemeyi bekler (single-flight)', async () => {
    let loads = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const cache = new TtlCache<number>(() => 10_000);
    const load = async () => {
      loads += 1;
      await gate;
      return 42;
    };
    const all = Promise.all([cache.get('k', load), cache.get('k', load), cache.get('k', load)]);
    release();
    expect(await all).toEqual([42, 42, 42]);
    expect(await cache.get('k', load)).toBe(42);
    expect(loads).toBe(1);
  });

  it('süre dolunca / clear sonrası yeniden yükler; hata önbelleklenmez; TTL 0 → kapalı', async () => {
    let n = 0;
    const cache = new TtlCache<number>(() => 1000);
    const load = async () => ++n;
    expect(await cache.get('a', load, 0)).toBe(1);
    expect(await cache.get('a', load, 500)).toBe(1);
    expect(await cache.get('a', load, Date.now() + 5000)).toBe(2);
    cache.clear();
    expect(await cache.get('a', load)).toBe(3);
    await expect(cache.get('b', async () => Promise.reject(new Error('db')))).rejects.toThrow('db');
    expect(await cache.get('b', load)).toBe(4);
    const off = new TtlCache<number>(() => 0);
    expect(await off.get('x', load)).toBe(5);
    expect(await off.get('x', load)).toBe(6);
  });

  it('ttlFromEnv: test ortamında varsayılan 0, değişkenle açılabilir', () => {
    expect(ttlFromEnv('TTL_TEST_UNSET', 15_000)()).toBe(0);
    process.env.TTL_TEST_SET = '2500';
    try {
      expect(ttlFromEnv('TTL_TEST_SET', 15_000)()).toBe(2500);
    } finally {
      delete process.env.TTL_TEST_SET;
    }
  });
});
