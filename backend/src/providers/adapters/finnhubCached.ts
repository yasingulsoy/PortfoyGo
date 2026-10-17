/**
 * Finnhub, kota dostu → StockProvider ('finnhub-cached').
 *
 * Varsayılan 'finnhub' adaptörü her yenilemede hisse başına 2 çağrı yapar (quote + profil). Bu adaptör yalnızca
 * mevcut FinnhubService'in genel metotlarını (getQuote, getProfile) kullanır (services/finnhub.ts DEĞİŞTİRİLMEDİ):
 *   - fiyat: her yenilemede hisse başına 1 çağrı (/quote),
 *   - şirket profili (ad, logo, sektör, piyasa değeri): bellekte 24 saat; her yenilemede en fazla
 *     `FINNHUB_PROFILE_BATCH` (varsayılan 8) yeni profil — ilk yükleme birkaç tura yayılır,
 *   - eşzamanlılık 4; çağrılar FinnhubService içindeki RateLimiter'dan geçer (ücretsiz katman 60/dk, tampon 10).
 * 48 hisse × 1 çağrı / 2 dk ≈ 24 çağrı/dk (+ ilk turlarda profil) → ücretsiz katman içinde kalır.
 * Profil alınamamışsa ad/sektör varsayılan evrenden (stockUniverse.ts) gelir.
 *
 * Anahtar zorunlu (FINNHUB_API_KEY / FINNHUB_API_KEYS); anahtarsız ücretsiz bir ABD hisse kaynağı yok.
 */
import { FinnhubService, type FinnhubProfile } from '../../services/finnhub';
import type { StockProvider, StockQuote } from '../types';
import { trackedStockSymbols, universeInfo } from '../stockUniverse';

const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

export interface FinnhubCachedDeps {
  getQuote?: (symbol: string) => Promise<{ c: number; d: number; dp: number; h: number; l: number; o: number; pc: number }>;
  getProfile?: (symbol: string) => Promise<Partial<FinnhubProfile>>;
  isConfigured?: () => boolean;
  symbols?: () => string[];
  profileBatch?: number;
  concurrency?: number;
  now?: () => number;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export function createFinnhubCachedProvider(deps: FinnhubCachedDeps = {}): StockProvider & { profileCount(): number } {
  const getQuote = deps.getQuote ?? ((sym: string) => FinnhubService.getQuote(sym));
  const getProfile = deps.getProfile ?? ((sym: string) => FinnhubService.getProfile(sym));
  const isConfigured = deps.isConfigured ?? (() => FinnhubService.isConfigured());
  const symbols = deps.symbols ?? (() => trackedStockSymbols());
  const profileBatch = deps.profileBatch ?? (Number(process.env.FINNHUB_PROFILE_BATCH) > 0 ? Number(process.env.FINNHUB_PROFILE_BATCH) : 8);
  const concurrency = deps.concurrency ?? 4;
  const now = deps.now ?? (() => Date.now());

  const profiles = new Map<string, { at: number; p: Partial<FinnhubProfile> }>();

  function toQuote(symbol: string, q: Awaited<ReturnType<typeof getQuote>>): StockQuote {
    const p = profiles.get(symbol)?.p;
    const info = universeInfo(symbol);
    return {
      symbol,
      name: p?.name || info?.name || symbol,
      price: q.c,
      change: q.d,
      changePercent: q.dp,
      high: q.h,
      low: q.l,
      open: q.o,
      previousClose: q.pc,
      // Finnhub marketCapitalization MİLYON USD
      marketCap: (Number(p?.marketCapitalization) || 0) * 1_000_000,
      logo: p?.logo || '',
      industry: p?.finnhubIndustry || info?.industry || '',
    };
  }

  async function refreshProfiles(list: string[]): Promise<void> {
    const due = list.filter((sym) => {
      const hit = profiles.get(sym);
      return !hit || now() - hit.at > PROFILE_TTL_MS;
    });
    for (const sym of due.slice(0, profileBatch)) {
      try {
        const p = await getProfile(sym);
        profiles.set(sym, { at: now(), p: p || {} });
      } catch {
        // bir sonraki turda tekrar denenir
      }
    }
  }

  return {
    id: 'finnhub-cached',
    isConfigured,
    getTrackedSymbols: symbols,
    async getPopularStocks() {
      if (!isConfigured()) return [];
      const list = symbols();
      await refreshProfiles(list);
      const quotes = await mapLimit(list, concurrency, async (sym) => {
        try {
          const q = await getQuote(sym);
          return q && Number(q.c) > 0 ? toQuote(sym, q) : null;
        } catch {
          return null;
        }
      });
      return quotes.filter((q): q is StockQuote => q !== null);
    },
    getStockData: (symbol) => FinnhubService.getStockData(symbol),
    listSymbols: (exchange) => FinnhubService.getStockSymbols(exchange),
    countSymbols: (exchange) => FinnhubService.getStockCount(exchange),
    exchangeCounts: () => FinnhubService.getExchangeStockCounts(),
    activeStocks: (exchange, maxStocks, minMarketCap) => FinnhubService.getActiveStocks(exchange, maxStocks, minMarketCap),
    testConnection: () => FinnhubService.testAPIKey(),
    profileCount: () => profiles.size,
  };
}

export const finnhubCachedStockProvider = createFinnhubCachedProvider();
