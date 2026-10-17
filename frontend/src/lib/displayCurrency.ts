// Görüntüleme para birimi (TL / USD) — saf yardımcılar. Muhasebe değişmez: bakiye, portföy ve işlemler veritabanında
// TL'dir; burada yalnızca GÖSTERİM çevrilir. Kur, uygulamanın kullandığı sunucu kurudur (GET /api/currencies → USD satış;
// işlemler de aynı currency_rates satırını kullanır). Hisse ve kriptoda USD seçiliyken kendi USD kotasyonu (nativeUSD)
// gösterilir; TL → USD geri çevrilmez. Yüzdeler hiçbir zaman değişmez.

import { MONEY_SYMBOLS, formatMoney, formatMoneyCompact, type MoneyCurrency, type MoneyFormatOptions } from '@portfoygo/shared/format';

export type DisplayCurrency = MoneyCurrency;

export const DISPLAY_CURRENCY_STORAGE_KEY = 'pg:display-currency';
export const DISPLAY_CURRENCIES: readonly DisplayCurrency[] = ['TRY', 'USD'];
/** Düğmelerde görünen kısa ad */
export const DISPLAY_CURRENCY_LABELS: Record<DisplayCurrency, string> = { TRY: 'TL', USD: 'USD' };
/** Açıklamalarda (ör. "tümü … bazında") */
export const DISPLAY_CURRENCY_NAMES: Record<DisplayCurrency, string> = { TRY: 'Türk lirası', USD: 'ABD doları' };

export interface MoneyContext {
  /** Kullanıcının tercihi */
  currency: DisplayCurrency;
  /** 1 USD kaç TL (bilinmiyorsa null) */
  usdTry: number | null;
}

export interface DisplayMoneyOptions extends MoneyFormatOptions {
  /** Varlığın kendi USD kotasyonu (hisse/kripto/USD emtia); USD görüntülemede TL'den çevirmek yerine kullanılır */
  nativeUSD?: number | null;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Saklanan değer → tercih (yalnızca 'USD' tanınır; diğer her şey varsayılan TL) */
export function parseDisplayCurrency(raw: string | null | undefined): DisplayCurrency {
  return (raw ?? '').trim().toUpperCase() === 'USD' ? 'USD' : 'TRY';
}

export function validRate(usdTry: number | null | undefined): usdTry is number {
  return finite(usdTry) && usdTry > 0;
}

/** Gerçekte kullanılacak birim: USD seçili ama kur henüz bilinmiyorsa TL (etiketli olarak) gösterilir */
export function resolveCurrency(ctx: MoneyContext): DisplayCurrency {
  return ctx.currency === 'USD' && validRate(ctx.usdTry) ? 'USD' : 'TRY';
}

/** TL tutarı görüntüleme birimine çevirir; değer yoksa null */
export function convertFromTRY(valueTRY: number | null | undefined, ctx: MoneyContext, nativeUSD?: number | null): number | null {
  if (resolveCurrency(ctx) === 'USD') {
    if (finite(nativeUSD)) return nativeUSD;
    return finite(valueTRY) ? valueTRY / (ctx.usdTry as number) : null;
  }
  return finite(valueTRY) ? valueTRY : null;
}

/** TL tutarını tercih edilen birimde biçimler ("₺1.234,56" / "$25,01"); null/NaN → formatTRY gibi 0 */
export function formatDisplayMoney(valueTRY: number | null | undefined, ctx: MoneyContext, opts: DisplayMoneyOptions = {}): string {
  const cur = resolveCurrency(ctx);
  return formatMoney(convertFromTRY(valueTRY, ctx, opts.nativeUSD), cur, opts);
}

/**
 * Diğer birimdeki karşılık, ikincil satır için: TL görünümünde "≈ $25,01", USD görünümünde "≈ ₺1.234,56".
 * Kur ya da tutar bilinmiyorsa null.
 */
export function formatAlternateMoney(valueTRY: number | null | undefined, ctx: MoneyContext, opts: DisplayMoneyOptions = {}): string | null {
  if (!validRate(ctx.usdTry) || !finite(valueTRY)) return null;
  const { nativeUSD, ...fmt } = opts;
  if (resolveCurrency(ctx) === 'USD') return `≈ ${formatMoney(valueTRY, 'TRY', fmt)}`;
  return `≈ ${formatMoney(finite(nativeUSD) ? nativeUSD : valueTRY / ctx.usdTry, 'USD', fmt)}`;
}

/** Kısa tutar ("₺1,2 Mn" / "$3,4 B"); bilinmiyorsa "—" */
export function formatDisplayCompact(valueTRY: number | null | undefined, ctx: MoneyContext, nativeUSD?: number | null): string {
  const v = convertFromTRY(valueTRY, ctx, nativeUSD);
  return v == null ? '—' : formatMoneyCompact(v, resolveCurrency(ctx));
}

/** USD kotasyonlu bir tutarı (ör. piyasa değeri) görüntüleme birimine çevirir; TL görünümde kur yoksa null */
export function convertFromUSD(valueUSD: number | null | undefined, ctx: MoneyContext): number | null {
  if (!finite(valueUSD)) return null;
  if (resolveCurrency(ctx) === 'USD') return valueUSD;
  return validRate(ctx.usdTry) ? valueUSD * ctx.usdTry : null;
}

export const displaySymbol = (cur: DisplayCurrency) => MONEY_SYMBOLS[cur];

/** Kur kaynağının tazelik notu (günlük kaynaklar anlık değildir); bilinmeyen/anlık kaynakta null */
export function fxSourceLabel(source: string | null | undefined): string | null {
  switch ((source ?? '').toLowerCase()) {
    case 'tcmb':
      return 'TCMB günlük kur';
    case 'frankfurter':
      return 'ECB günlük referans kur';
    default:
      return null;
  }
}
