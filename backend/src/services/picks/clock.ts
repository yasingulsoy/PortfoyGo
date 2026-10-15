/**
 * Haftalık Seçim saati. Servis zamanı YALNIZCA buradan okur.
 *
 * Yerel geliştirme için (POST /api/dev/picks/clock — yalnızca isDevLoginEnabled() iken) saat bellek içinde
 * kaydırılabilir: verilen an ile gerçek saat arasındaki fark saklanır, zaman akmaya devam eder
 * (geri sayımlar canlı kalır). null → gerçek saat. Süreç yeniden başlarsa sıfırlanır.
 *
 * Testler `picksClock.set(date)` / `picksClock.reset()` ile doğrudan kullanır.
 */

let offsetMs: number | null = null;

export const picksClock = {
  now(): Date {
    return new Date(Date.now() + (offsetMs ?? 0));
  },
  /** Saati verilen ana kaydır (null → gerçek saat) */
  set(at: Date | null): void {
    offsetMs = at === null ? null : at.getTime() - Date.now();
  },
  reset(): void {
    offsetMs = null;
  },
  isOverridden(): boolean {
    return offsetMs !== null;
  },
};
