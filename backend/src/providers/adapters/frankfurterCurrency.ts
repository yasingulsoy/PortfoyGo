/**
 * Frankfurter (ECB ve diğer merkez bankalarının referans kurları) → FxProvider ('frankfurter').
 *
 * Kaynak: https://api.frankfurter.dev/v1 — anahtarsız, ücretsiz, açık kaynak; kota yok ("fair use", istek hızı
 * kötüye kullanıma karşı sınırlı). GÜNLÜK referans kurdur (ECB ~16:00 CET), anlık değildir; alış = satış = orta kur.
 * Tek istekte son ~10 günün USD bazlı serisi alınır; TL karşılıkları çapraz kurla hesaplanır
 * (TL / X = (TRY / USD) ÷ (X / USD)) ve değişim (%) bir önceki yayın gününe göredir.
 */
import type { FxProvider } from '../types';
import { addDays, axiosGet, isoDay, percentChange, positiveNumber, type HttpGet } from './http';
import { fxDisplayName, readStoredList, readStoredRate, readStoredRates, saveFxRates, type FxRateInput } from './fxStore';

const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1';
const LOOKBACK_DAYS = 10;

interface SeriesResponse {
  base?: string;
  rates?: Record<string, Record<string, number>>;
}

/** USD bazlı zaman serisinden TL / birim kurları (son gün + önceki güne göre değişim) */
export function ratesFromUsdSeries(body: SeriesResponse): FxRateInput[] {
  if (!body || String(body.base || '').toUpperCase() !== 'USD' || !body.rates) return [];
  const days = Object.keys(body.rates).sort();
  if (days.length === 0) return [];
  const last = body.rates[days[days.length - 1]] ?? {};
  const prev = days.length > 1 ? (body.rates[days[days.length - 2]] ?? {}) : {};
  const usdTry = positiveNumber(last.TRY);
  if (!usdTry) return [];
  const prevUsdTry = positiveNumber(prev.TRY);

  const out: FxRateInput[] = [{ code: 'USD', name: fxDisplayName('USD'), buying: usdTry, selling: usdTry, changeRate: percentChange(usdTry, prevUsdTry) }];
  for (const [code, perUsd] of Object.entries(last)) {
    const c = code.toUpperCase();
    if (c === 'TRY' || c === 'USD' || !/^[A-Z]{3}$/.test(c)) continue;
    const x = positiveNumber(perUsd);
    if (!x) continue;
    const tryPer = usdTry / x;
    const prevX = positiveNumber(prev[code]);
    const prevTryPer = prevUsdTry && prevX ? prevUsdTry / prevX : null;
    out.push({ code: c, name: fxDisplayName(c), buying: tryPer, selling: tryPer, changeRate: percentChange(tryPer, prevTryPer) });
  }
  return out;
}

export interface FrankfurterProviderDeps {
  http?: HttpGet;
  save?: (rates: FxRateInput[]) => Promise<number>;
  now?: () => Date;
}

export function createFrankfurterFxProvider(deps: FrankfurterProviderDeps = {}): FxProvider {
  const http = deps.http ?? axiosGet;
  const save = deps.save ?? saveFxRates;
  const now = deps.now ?? (() => new Date());
  let inFlight: Promise<number> | null = null;

  async function doRefresh(): Promise<number> {
    const end = isoDay(now());
    const url = `${FRANKFURTER_BASE}/${addDays(end, -LOOKBACK_DAYS)}..${end}?base=USD`;
    let rows: FxRateInput[];
    try {
      const res = await http<SeriesResponse>(url, { timeoutMs: 10_000 });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      rows = ratesFromUsdSeries(res.data);
    } catch (err: any) {
      console.error(`[frankfurter] Kurlar alınamadı: ${err?.message || err}`);
      return 0;
    }
    if (rows.length === 0) {
      console.error('[frankfurter] Yanıtta USD/TRY bulunamadı');
      return 0;
    }
    // Veritabanı hatası yutulmaz (iş kaydına hata olarak düşer)
    return save(rows);
  }

  return {
    id: 'frankfurter',
    getList: readStoredList,
    refreshRates: () => {
      if (!inFlight) {
        inFlight = doRefresh().finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
    getStoredRates: readStoredRates,
    getStoredRate: readStoredRate,
  };
}

export const frankfurterFxProvider = createFrankfurterFxProvider();
