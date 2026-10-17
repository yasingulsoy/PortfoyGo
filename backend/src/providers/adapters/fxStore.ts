/**
 * Ücretsiz döviz kaynaklarının (TCMB, Frankfurter) ortak saklama katmanı: kurlar NosyAPI adaptörüyle aynı
 * `currency_rates` tablosuna yazılır, aynı yerden okunur. Böylece fiyatlama (PricingService), fiyat geçmişi ve
 * tazelik pencereleri (MAX_PRICE_AGE_MS.currency = 24 sa) kaynaktan bağımsız aynı kalır.
 *
 * Okuma, mevcut servisin DB okuma metotlarını kullanır (services/currency.ts DEĞİŞTİRİLMEDİ).
 * `updated_at` = kurun bu sunucuya yazıldığı an (bülten tarihi değil): TCMB hafta sonu/tatilde son iş gününün
 * bültenini yayımlar; bu durumda kur hâlâ geçerli resmi kurdur ve işlemler 24 saatlik pencere içinde açık kalır.
 */
import pool from '../../config/database';
import { CurrencyService } from '../../services/currency';
import type { FxRate } from '../types';

export interface FxRateInput {
  code: string;
  name: string;
  /** TL / 1 birim */
  buying: number;
  /** TL / 1 birim */
  selling: number;
  /** Önceki yayına göre % değişim; null → saklı değişim korunur (yeni kayıtta 0) */
  changeRate: number | null;
}

/** Sık kullanılan kodların Türkçe adları (kaynakların adları büyük harf / İngilizce gelir) */
const FX_NAMES: Record<string, string> = {
  USD: 'Amerikan Doları',
  EUR: 'Euro',
  GBP: 'İngiliz Sterlini',
  CHF: 'İsviçre Frangı',
  JPY: 'Japon Yeni',
  AUD: 'Avustralya Doları',
  CAD: 'Kanada Doları',
  SAR: 'Suudi Arabistan Riyali',
  DKK: 'Danimarka Kronu',
  SEK: 'İsveç Kronu',
  NOK: 'Norveç Kronu',
  KWD: 'Kuveyt Dinarı',
  RUB: 'Rus Rublesi',
  CNY: 'Çin Yuanı',
  AED: 'BAE Dirhemi',
  QAR: 'Katar Riyali',
  AZN: 'Azerbaycan Manatı',
  RON: 'Rumen Leyi',
  BGN: 'Bulgar Levası',
  KRW: 'Güney Kore Wonu',
  PKR: 'Pakistan Rupisi',
  KZT: 'Kazakistan Tengesi',
  HUF: 'Macar Forinti',
  PLN: 'Polonya Zlotisi',
  CZK: 'Çek Korunası',
  BRL: 'Brezilya Reali',
  MXN: 'Meksika Pesosu',
  INR: 'Hindistan Rupisi',
  IDR: 'Endonezya Rupisi',
  ILS: 'İsrail Şekeli',
  HKD: 'Hong Kong Doları',
  SGD: 'Singapur Doları',
  NZD: 'Yeni Zelanda Doları',
  ZAR: 'Güney Afrika Randı',
  THB: 'Tayland Bahtı',
  MYR: 'Malezya Ringgiti',
  PHP: 'Filipin Pesosu',
  ISK: 'İzlanda Kronası',
};

/** Görünen ad: bilinen kodlar Türkçe; diğerleri kaynağın adı (yoksa kod) */
export function fxDisplayName(code: string, fallback?: string | null): string {
  const c = code.toUpperCase();
  if (FX_NAMES[c]) return FX_NAMES[c];
  const f = (fallback || '').trim();
  if (!f) return c;
  // "AVUSTRALYA DOLARI" → "Avustralya Doları" gibi büyük harfli adları Türkçe kurallarla yumuşat
  return f === f.toLocaleUpperCase('tr')
    ? f
        .toLocaleLowerCase('tr')
        .split(/\s+/)
        .map((w) => (w ? w[0].toLocaleUpperCase('tr') + w.slice(1) : w))
        .join(' ')
    : f;
}

const VALID_CODE = /^[A-Z]{3}$/;

/** Kurları `currency_rates`'e yazar (tek işlem). Geçersiz satırlar atlanır; yazılan kayıt sayısını döner. */
export async function saveFxRates(rates: FxRateInput[]): Promise<number> {
  const valid = rates.filter(
    (r) =>
      VALID_CODE.test(r.code) &&
      r.code !== 'TRY' &&
      Number.isFinite(r.buying) &&
      Number.isFinite(r.selling) &&
      r.buying > 0 &&
      r.selling > 0
  );
  if (valid.length === 0) return 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of valid) {
      const change = r.changeRate != null && Number.isFinite(r.changeRate) ? r.changeRate : null;
      await client.query(
        `INSERT INTO currency_rates (code, name, buying, selling, change_rate, updated_at)
         VALUES ($1, $2, $3, $4, COALESCE($5::numeric, 0), CURRENT_TIMESTAMP)
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           buying = EXCLUDED.buying,
           selling = EXCLUDED.selling,
           change_rate = COALESCE($5::numeric, currency_rates.change_rate),
           updated_at = CURRENT_TIMESTAMP`,
        [r.code, r.name.slice(0, 255), r.buying, r.selling, change]
      );
    }
    await client.query('COMMIT');
    return valid.length;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export const readStoredRates = (): Promise<FxRate[]> => CurrencyService.getFromDb();
export const readStoredRate = (code: string): Promise<FxRate | null> => CurrencyService.getFromDbByCode(code);
export async function readStoredList(): Promise<{ code: string; name: string }[]> {
  return (await readStoredRates()).map((r) => ({ code: r.code, name: r.name }));
}
