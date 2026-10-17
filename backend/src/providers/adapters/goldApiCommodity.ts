/**
 * Değerli metaller canlı (gold-api.com) + diğer emtialar son bilinen fiyat → CommodityProvider ('goldapi').
 *
 * Kaynak: https://api.gold-api.com/price/{XAU|XAG|XPT|XPD|HG} — anahtarsız, ücretsiz; kullanım koşulları
 * (gold-api.com/terms, Eylül 2026) ticari kullanıma izin verir, atıf istemez, veriyi "olduğu gibi" sunar ve
 * saniyede birden fazla isteği kötüye kullanım sayar. Bu yüzden semboller arasında `gapMs` (varsayılan 1,1 sn)
 * beklenir ve liste en fazla `ttlMs`'de (varsayılan 2 dk) bir arka planda yenilenir (istek başına API çağrısı yok).
 *
 * Petrol (BRENT_OIL), doğal gaz vb. için anahtarsız ve resmî ücretsiz bir kaynak yok: bunlar `pricehistory`
 * adaptöründeki gibi `price_history`'deki son bilinen fiyattan gelir. Gram altın (GAU) canlı onstan türetilir.
 * Canlı metal fiyatları fiyat geçmişi işiyle tabloya yazılır (grafik/sparkline beslenir).
 */
import pool from '../../config/database';
import { isTryQuotedCommodity } from '../../services/commodity';
import type { CommodityProvider, CommodityQuote } from '../types';
import { axiosGet, percentChange, positiveNumber, sleep, type HttpGet } from './http';
import { GOLD_API_SYMBOLS } from './goldApiSymbols';
import {
  commodityDisplayName,
  deriveGramGold,
  pickFresh,
  readCommodityHistoryQuotes,
  readPrices24hAgo,
  sortCommodities,
  type Queryable,
} from './priceHistoryCommodity';

const GOLD_API_BASE = 'https://api.gold-api.com';
const DAY_MS = 24 * 60 * 60 * 1000;

interface LiveQuote {
  price: number;
  fetchedAt: number;
  /** Kaynağın bildirdiği fiyat zamanı (ISO) */
  sourceTime: string | null;
}

export interface GoldApiDeps {
  http?: HttpGet;
  db?: Queryable;
  /** Canlı listeyi en fazla bu sıklıkta yenile (ms); varsayılan GOLD_API_REFRESH_MS ya da 120 000 */
  ttlMs?: number;
  /** Ardışık istekler arası bekleme (ms); varsayılan 1100 (kullanım koşulları: saniyede birden fazla istek yok) */
  gapMs?: number;
  now?: () => number;
}

export function createGoldApiCommodityProvider(deps: GoldApiDeps = {}): CommodityProvider & { refreshLive(): Promise<number> } {
  const http = deps.http ?? axiosGet;
  const db = deps.db ?? pool;
  const now = deps.now ?? (() => Date.now());
  const ttlMs = deps.ttlMs ?? (Number(process.env.GOLD_API_REFRESH_MS) > 0 ? Number(process.env.GOLD_API_REFRESH_MS) : 120_000);
  const gapMs = deps.gapMs ?? 1100;

  const live = new Map<string, LiveQuote>();
  let lastAttempt = 0;
  let inFlight: Promise<number> | null = null;

  /** Tüm metalleri sırayla çeker; başarılı sembol sayısını döner. Başarısız semboller son değerini korur. */
  async function refreshLive(): Promise<number> {
    let ok = 0;
    let first = true;
    for (const [code, symbol] of Object.entries(GOLD_API_SYMBOLS)) {
      if (!first && gapMs > 0) await sleep(gapMs);
      first = false;
      try {
        const res = await http<{ price?: unknown; updatedAt?: unknown }>(`${GOLD_API_BASE}/price/${symbol}`, { timeoutMs: 8_000 });
        const price = res.status === 200 ? positiveNumber(res.data?.price) : null;
        if (!price) {
          console.warn(`[gold-api] ${symbol}: geçersiz yanıt (HTTP ${res.status})`);
          continue;
        }
        live.set(code, { price, fetchedAt: now(), sourceTime: typeof res.data?.updatedAt === 'string' ? res.data.updatedAt : null });
        ok++;
      } catch (err: any) {
        console.warn(`[gold-api] ${symbol} alınamadı: ${err?.message || err}`);
      }
    }
    return ok;
  }

  /** TTL dolduysa arka planda yenilemeyi başlatır (eşzamanlı çağrılar birleştirilir) */
  function ensureFresh(): Promise<number> | null {
    if (inFlight) return inFlight;
    if (now() - lastAttempt < ttlMs) return null;
    lastAttempt = now();
    inFlight = refreshLive().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  async function getPopularPrices(): Promise<CommodityQuote[]> {
    const pending = ensureFresh();
    // İlk çağrıda (henüz canlı veri yokken) yenilemeyi bekle; sonrakiler son değeri anında döner
    if (pending && live.size === 0) await pending.catch(() => 0);

    const t = now();
    const [history, prev] = await Promise.all([readCommodityHistoryQuotes(db, t), readPrices24hAgo([...live.keys()], db)]);
    const out = new Map(history.map((q) => [q.code, q]));
    // Canlı değer varsa her zaman o kullanılır (tablodaki aynı kodlu satırlar zaten bu değerlerin snapshot'ıdır);
    // kaynak kesilirse son canlı değer yaşlanır ve tazelik penceresi (24 sa) dolunca işlem reddedilir.
    for (const [code, l] of live) {
      out.set(code, {
        code,
        name: commodityDisplayName(code),
        buying: l.price,
        selling: l.price,
        changeRate: percentChange(l.price, prev.get(code)) ?? 0,
        datetime: l.sourceTime ?? new Date(l.fetchedAt).toISOString(),
        quoteCurrency: 'USD',
        fetchedAt: l.fetchedAt,
        fromHistory: false,
      });
    }
    const gau = await deriveGramGold(out.get('GOLD'), db, t);
    if (gau) out.set('GAU', gau);
    return sortCommodities([...out.values()]);
  }

  return {
    id: 'goldapi',
    isConfigured: () => true,
    getList: async () => (await getPopularPrices()).map((q) => ({ code: q.code, name: q.name })),
    getPopularPrices,
    getPrice: async (code, _refreshAfterMs, maxAgeMs = DAY_MS) => pickFresh(await getPopularPrices(), code, maxAgeMs, now()),
    isTryQuoted: (code) => isTryQuotedCommodity(code),
    refreshLive,
  };
}

export const goldApiCommodityProvider = createGoldApiCommodityProvider();
