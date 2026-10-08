import { MarketCacheService } from '../services/marketCache';

// Herkese açık uçların tetiklediği arka plan yenilemelerini sınırlamak için throttle.
const MIN_BACKGROUND_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let lastBackgroundRefresh = 0;

/**
 * Cache eksik/boşsa en fazla 5 dakikada bir yenileme başlatır.
 * awaitIfEmpty=true ise (cache tamamen boş) yenilemenin bitmesini bekler.
 * Bir yenileme beklendiyse true döner.
 */
export async function maybeBackgroundRefresh(awaitIfEmpty: boolean, needsRefresh: boolean): Promise<boolean> {
  if (!needsRefresh && !awaitIfEmpty) return false;
  if (process.env.ENABLE_BACKGROUND_STOCK_REFRESH === 'false') return false;

  const now = Date.now();
  if (now - lastBackgroundRefresh < MIN_BACKGROUND_REFRESH_INTERVAL_MS) return false;
  lastBackgroundRefresh = now;

  const p = MarketCacheService.refreshCache().catch((err) => {
    console.error('[market-cache] Arka plan yenileme hatası:', err?.message);
  });
  if (awaitIfEmpty) {
    await p;
    return true;
  }
  return false;
}
