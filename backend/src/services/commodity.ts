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
}

const MAX_ITEMS = 30;

// En önemli emtialar (Silver, Bakır, Platin vb. - öncelik sırasına göre)
const PRIORITY_CODES = [
  'GOLD', 'SILVER', 'SILVER_FUT', 'COPPER', 'PLATINUM', 'PALLADIUM',
  'BRENT_OIL', 'CRUDEOIL', 'NATURAL_GAS', 'WHEAT', 'CORN',
  'COTTON2', 'SUGAR', 'SOYBEAN', 'COFFEE', 'COCOA',
  'ALUMINUM', 'HEATING_OIL', 'GASOLINE', 'GAU', 'GOLDTRY',
];

let cachedList: CommodityListItem[] = [];
let cachedPrices: CommodityPrice[] = [];
let lastCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 saat (500 kredi tasarrufu)

export class CommodityService {
  private static async request<T>(endpoint: string, params?: Record<string, string>): Promise<T | null> {
    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        console.warn('EMTIA API key not set');
        return null;
      }

      const url = new URL(`${NOSY_API_BASE}/${endpoint}`);
      if (params) {
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      }

      const { data } = await axios.get(url.toString(), {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 10000,
      });

      if ((data as any).status === 'success' || (data as any).status === 'Success') {
        return (data as any).data as T;
      }
      console.error('NosyAPI error:', (data as any).message || (data as any).messageTR);
      return null;
    } catch (err: any) {
      console.error(`NosyAPI ${endpoint} error:`, err.message);
      return null;
    }
  }

  static async getList(): Promise<CommodityListItem[]> {
    if (cachedList.length > 0) return cachedList;

    const data = await this.request<any[]>('economy/emtia/list');
    if (data && Array.isArray(data)) {
      cachedList = data.map((item: any) => ({
        code: item.code || item.Code || '',
        name: item.name || item.Name || item.code || '',
      }));
      return cachedList;
    }
    return [];
  }

  static async getPrice(code: string): Promise<CommodityPrice | null> {
    const data = await this.request<any>('economy/emtia/exchange-rate', { code });
    if (!data) return null;

    const item = Array.isArray(data) ? data[0] : data;
    if (!item) return null;

    return {
      code: item.code || item.Code || code,
      name: item.name || item.Name || code,
      buying: parseFloat(item.buying || item.Buying || item.alis || item.Alis || 0),
      selling: parseFloat(item.selling || item.Selling || item.satis || item.Satis || 0),
      changeRate: parseFloat(item.change_rate || item.ChangeRate || item.changeRate || item.degisim || 0),
      datetime: item.datetime || item.DateTime || new Date().toISOString(),
    };
  }

  static async getPopularPrices(): Promise<CommodityPrice[]> {
    const now = Date.now();
    if (cachedPrices.length > 0 && now - lastCacheTime < CACHE_TTL) {
      return cachedPrices;
    }

    const list = await this.getList();
    const listCodes = list.map(l => l.code);
    const codeToApi = new Map(listCodes.map(c => [c.toUpperCase(), c]));
    // Önce öncelikli emtialar (Silver, Bakır, Platin vb.) - büyük/küçük harf duyarsız
    const priorityMapped = PRIORITY_CODES
      .map(p => codeToApi.get(p.toUpperCase()))
      .filter((c): c is string => !!c);
    const rest = listCodes.filter(c => !priorityMapped.some(p => p.toUpperCase() === c.toUpperCase()));
    const codes = [...priorityMapped, ...rest].slice(0, MAX_ITEMS);

    const results: CommodityPrice[] = [];
    for (const code of codes) {
      try {
        const price = await this.getPrice(code);
        if (price && price.selling > 0) {
          results.push(price);
        }
      } catch {
        // skip
      }
    }

    if (results.length > 0) {
      cachedPrices = results;
      lastCacheTime = now;
      return results;
    }

    if (cachedPrices.length > 0) {
      return cachedPrices;
    }
    return results;
  }
}
