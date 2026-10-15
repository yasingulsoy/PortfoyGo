import { TAP } from './config';

/**
 * Kullanıcı başına dokunuş sınırı (bellek içi; tek süreç):
 *  - jeton kovası: saniyede `perSecond` dolar, en fazla `burst` birikir (toplu 20'lik gönderim için)
 *  - kayan 60 sn penceresi: en fazla `perMinute` dokunuş
 * İstenenden azı kabul edilebilir (fazlası düşer); hiç kabul edilmezse 0 döner (→ 429).
 */
export class TapLimiter {
  private readonly buckets = new Map<string, { tokens: number; last: number; window: { at: number; n: number }[] }>();

  constructor(
    private readonly opts: { perSecond: number; burst: number; perMinute: number } = {
      perSecond: TAP.perSecond,
      burst: TAP.burst,
      perMinute: TAP.perMinute,
    }
  ) {}

  /** count adet dokunuş ister; kabul edilen adedi döndürür */
  take(key: string, count: number, nowMs: number = Date.now()): number {
    this.sweep(nowMs);
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.opts.burst, last: nowMs, window: [] };
      this.buckets.set(key, b);
    }
    const elapsed = Math.max(0, nowMs - b.last) / 1000;
    b.tokens = Math.min(this.opts.burst, b.tokens + elapsed * this.opts.perSecond);
    b.last = Math.max(b.last, nowMs);

    b.window = b.window.filter((w) => nowMs - w.at < 60_000);
    const usedMinute = b.window.reduce((s, w) => s + w.n, 0);

    const want = Math.max(0, Math.floor(count));
    const granted = Math.max(0, Math.min(want, Math.floor(b.tokens + 1e-9), this.opts.perMinute - usedMinute));
    if (granted > 0) {
      b.tokens -= granted;
      b.window.push({ at: nowMs, n: granted });
    }
    return granted;
  }

  reset(): void {
    this.buckets.clear();
  }

  private lastSweep = 0;

  /** Bir dakikadır dokunmayan kullanıcıları siler (en fazla dakikada bir) */
  private sweep(nowMs: number): void {
    if (nowMs - this.lastSweep < 60_000) return;
    this.lastSweep = nowMs;
    for (const [key, b] of this.buckets) {
      if (nowMs - b.last >= 60_000) this.buckets.delete(key);
    }
  }
}
