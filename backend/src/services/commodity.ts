import axios from 'axios';

const NOSY_API_BASE = 'https://www.nosyapi.com/apiv2/service';
const getApiKey = () => process.env.EMTIA || '';

export interface CommodityListItem {
  code: string;
  name: string;
}

export interface CommodityPrice {
  code: string;
  name: string;
  buying: number;
  selling: number;
  changeRate: number;
  datetime: string;
  /** Fiyatın para birimi: 'TRY' (GAU / *TRY) veya 'USD' (diğerleri) */
  quoteCurrency: 'TRY' | 'USD';
  /** Sunucunun bu fiyatı API'den çektiği an (ms) */
  fetchedAt: number;
}

/**
 * Emtia fiyatının TL cinsinden mi geldiğini belirler.
 * Frontend ile AYNI kural: kod 'GAU' ise veya 'TRY' ile bitiyorsa TL; diğer tüm emtialar USD.
 */
export function isTryQuotedCommodity(code: string): boolean {
  const c = (code || '').trim().toUpperCase();
  return c === 'GAU' || c.endsWith('TRY');
}

const MAX_ITEMS = 30;

// En önemli emtialar (öncelik sırasına göre)
const PRIORITY_CODES = [
  'GOLD', 'SILVER', 'SILVER_FUT', 'COPPER', 'PLATINUM', 'PALLADIUM',
  'BRENT_OIL', 'CRUDEOIL', 'NATURAL_GAS', 'WHEAT', 'CORN',
  'COTTON2', 'SUGAR', 'SOYBEAN', 'COFFEE', 'COCOA',
  'ALUMINUM', 'HEATING_OIL', 'GASOLINE', 'GAU', 'GOLDTRY',
];

/** Liste (kod/isim) — nadiren değişir */
let cachedList: CommodityListItem[] = [];
let listFetchedAt = 0;
const LIST_TTL = 24 * 60 * 60 * 1000;
const LIST_RETRY_MS = 5 * 60 * 1000;
let lastListAttempt = 0;

/** Popüler fiyat listesi önbelleği (kredi tasarrufu için 1 saat) */
let cachedPrices: CommodityPrice[] = [];
let lastCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000;
let popularRefreshInFlight: Promise<CommodityPrice[]> | null = null;

/** Tek kod fiyat önbelleği (işlemler ve /commodities/:code için kısa TTL) */
const SINGLE_TTL = 60 * 1000;
const singleCache = new Map<string, CommodityPrice>();
const singleInFlight = new Map<string, Promise<CommodityPrice | null>>();
const singleLastAttempt = new Map<string, number>();

export class CommodityService {
  private static async request<T>(endpoint: string, params?: Record<string, string>): Promise<T | null> {
    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        return null;
      }

      const url = new URL(`${NOSY_API_BASE}/${endpoint}`);
      if (params) {
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      }

      const { data } = await axios.get(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      });

      if ((data as any).status === 'success' || (data as any).status === 'Success') {
        return (data as any).data as T;
      }
      console.error('[commodity] NosyAPI error:', (data as any).message || (data as any).messageTR);
      return null;
    } catch (err: any) {
      console.error(`[commodity] NosyAPI ${endpoint} error:`, err?.response?.status || '', err?.message);
      return null;
    }
  }

  static isConfigured(): boolean {
    return !!getApiKey();
  }

  static async getList(): Promise<CommodityListItem[]> {
    if (cachedList.length > 0 && Date.now() - listFetchedAt < LIST_TTL) return cachedList;
    // Başarısız denemelerden sonra API'yi her istekte tekrar yormamak için bekleme
    if (Date.now() - lastListAttempt < LIST_RETRY_MS) return cachedList;
    lastListAttempt = Date.now();

    const data = await this.request<any[]>('economy/emtia/list');
    if (data && Array.isArray(data)) {
      cachedList = data
        .map((item: any) => ({
          code: String(item.code || item.Code || ''),
          name: String(item.name || item.Name || item.code || ''),
        }))
        .filter((i) => i.code);
      listFetchedAt = Date.now();
    }
    return cachedList;
  }

  /** API'den tek emtia fiyatı (önbelleksiz). Dışarıdan doğrudan çağırmayın; getPriceCached kullanın. */
  private static async fetchPrice(code: string): Promise<CommodityPrice | null> {
    const data = await this.request<any>('economy/emtia/exchange-rate', { code });
    if (!data) return null;

    const item = Array.isArray(data) ? data[0] : data;
    if (!item) return null;

    const resolvedCode = String(item.code || item.Code || code);
    return {
      code: resolvedCode,
      name: String(item.name || item.Name || code),
      buying: parseFloat(item.buying || item.Buying || item.alis || item.Alis || 0),
      selling: parseFloat(item.selling || item.Selling || item.satis || item.Satis || 0),
      changeRate: parseFloat(item.change_rate || item.ChangeRate || item.changeRate || item.degisim || 0),
      datetime: item.datetime || item.DateTime || new Date().toISOString(),
      quoteCurrency: isTryQuotedCommodity(resolvedCode) ? 'TRY' : 'USD',
      fetchedAt: Date.now(),
    };
  }

  /** Bilinen (listede olan) bir emtia kodunu API'deki yazımıyla döndürür; yoksa null. */
  static async resolveKnownCode(code: string): Promise<string | null> {
    const upper = code.trim().toUpperCase();
    const fromPrices = cachedPrices.find((p) => p.code.toUpperCase() === upper);
    if (fromPrices) return fromPrices.code;
    const list = await this.getList();
    const found = list.find((l) => l.code.toUpperCase() === upper);
    return found ? found.code : null;
  }

  /**
   * Tek emtia fiyatı, önbellekli.
   * - Önbellekteki (popüler liste veya tekil) değer `refreshAfterMs`'den gençse doğrudan döner.
   *   Varsayılan olarak popüler listenin TTL'i kullanılır; böylece ekranda gösterilen fiyat ile
   *   işlemde kullanılan fiyat aynı kaynaktan gelir.
   * - Aksi halde (sadece listede bilinen kodlar için) API'den tazelenir; keyfi kodlarla kota harcanamaz.
   * - API başarısızsa `maxAgeMs`'den genç son bilinen değer döner; yoksa null.
   */
  static async getPriceCached(
    code: string,
    refreshAfterMs: number = CACHE_TTL,
    maxAgeMs: number = 24 * 60 * 60 * 1000
  ): Promise<CommodityPrice | null> {
    const upper = code.trim().toUpperCase();
    const now = Date.now();

    const single = singleCache.get(upper);
    const fromPopular = cachedPrices.find((p) => p.code.toUpperCase() === upper);
    const newest = [single, fromPopular]
      .filter((p): p is CommodityPrice => !!p)
      .sort((a, b) => b.fetchedAt - a.fetchedAt)[0];

    if (newest && now - newest.fetchedAt < Math.max(refreshAfterMs, SINGLE_TTL)) {
      return newest;
    }

    const apiCode = await this.resolveKnownCode(upper);
    const lastAttempt = singleLastAttempt.get(upper) || 0;
    if (apiCode && this.isConfigured() && now - lastAttempt >= SINGLE_TTL) {
      singleLastAttempt.set(upper, now);
      let inFlight = singleInFlight.get(upper);
      if (!inFlight) {
        inFlight = this.fetchPrice(apiCode).finally(() => singleInFlight.delete(upper));
        singleInFlight.set(upper, inFlight);
      }
      const fresh = await inFlight;
      if (fresh && fresh.selling > 0) {
        singleCache.set(upper, fresh);
        return fresh;
      }
    }

    // API başarısız: kabul edilebilir yaştaki son bilinen değeri döndür
    if (newest && now - newest.fetchedAt < maxAgeMs) {
      return newest;
    }
    return null;
  }

  static async getPopularPrices(): Promise<CommodityPrice[]> {
    const now = Date.now();
    if (cachedPrices.length > 0 && now - lastCacheTime < CACHE_TTL) {
      return cachedPrices;
    }
    if (!this.isConfigured()) {
      return cachedPrices;
    }
    if (!popularRefreshInFlight) {
      popularRefreshInFlight = this.refreshPopular().finally(() => {
        popularRefreshInFlight = null;
      });
    }
    return popularRefreshInFlight;
  }

  private static async refreshPopular(): Promise<CommodityPrice[]> {
    const list = await this.getList();
    const listCodes = list.map((l) => l.code);
    const codeToApi = new Map(listCodes.map((c) => [c.toUpperCase(), c]));
    const priorityMapped = PRIORITY_CODES.map((p) => codeToApi.get(p.toUpperCase())).filter((c): c is string => !!c);
    const rest = listCodes.filter((c) => !priorityMapped.some((p) => p.toUpperCase() === c.toUpperCase()));
    const codes = [...priorityMapped, ...rest].slice(0, MAX_ITEMS);

    const results: CommodityPrice[] = [];
    for (const code of codes) {
      const price = await this.fetchPrice(code);
      if (price && price.selling > 0) {
        results.push(price);
        singleCache.set(price.code.toUpperCase(), price);
      }
    }

    if (results.length > 0) {
      cachedPrices = results;
      lastCacheTime = Date.now();
    }
    return cachedPrices;
  }
}
