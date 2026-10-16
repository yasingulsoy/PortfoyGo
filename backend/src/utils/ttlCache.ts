/**
 * Küçük süreç içi TTL önbelleği + "single-flight": aynı anahtar için süren bir yükleme varsa eşzamanlı
 * istekler onu bekler (yük altında N istek → 1 sorgu). Hata önbelleklenmez.
 *
 * Çoklu örnekte her örnek kendi kopyasını tutar (tutarlılık penceresi = TTL). TTL ≤ 0 → önbellek kapalı
 * (her çağrı yükler; testler bunu kullanır).
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { at: number; value: V }>();
  private readonly inflight = new Map<string, Promise<V>>();

  constructor(
    private readonly ttlMs: () => number,
    private readonly maxEntries = 64
  ) {}

  async get(key: string, load: () => Promise<V>, now: number = Date.now()): Promise<V> {
    const ttl = this.ttlMs();
    if (ttl <= 0) return load();
    const hit = this.entries.get(key);
    if (hit && now - hit.at < ttl) return hit.value;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = (async () => {
      try {
        const value = await load();
        if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
          const oldest = this.entries.keys().next().value;
          if (oldest !== undefined) this.entries.delete(oldest);
        }
        this.entries.set(key, { at: Date.now(), value });
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  /** Önbelleği boşaltır (ör. veri bu süreçte yeniden yazıldığında). */
  clear(): void {
    this.entries.clear();
  }
}

/** Ortamdan TTL (ms): tanımsız → varsayılan; NODE_ENV=test iken varsayılan 0 (testler taze veri görür). */
export function ttlFromEnv(name: string, defaultMs: number): () => number {
  return () => {
    const raw = process.env[name]?.trim();
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    return process.env.NODE_ENV === 'test' ? 0 : defaultMs;
  };
}
