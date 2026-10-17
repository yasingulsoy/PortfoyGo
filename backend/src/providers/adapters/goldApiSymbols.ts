/**
 * gold-api.com sembolleri → uygulamanın emtia kodları (NosyAPI ile aynı adlar). Saf modül (veritabanı / ağ yok):
 * yerel veritabanı süreci de (dev/localDb.ts → seed tickMarket) canlı alınan kodları sahte fiyat hareketinden
 * hariç tutmak için içe aktarır.
 */
export const GOLD_API_SYMBOLS: Readonly<Record<string, string>> = {
  GOLD: 'XAU',
  SILVER: 'XAG',
  PLATINUM: 'XPT',
  PALLADIUM: 'XPD',
  COPPER: 'HG',
};

export const GOLD_API_LIVE_CODES: readonly string[] = Object.keys(GOLD_API_SYMBOLS);

/** Gram altın (GAU, TL) ons altından türetilir: GOLD (USD/ons) × USD/TRY ÷ 31,1034768 */
export const DERIVED_COMMODITY_CODES: readonly string[] = ['GAU'];

export const TROY_OUNCE_GRAMS = 31.1034768;
