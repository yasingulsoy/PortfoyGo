'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { formatMoney, formatMoneyCompact } from '@portfoygo/shared/format';
import { useCurrencies } from '@/hooks/useMarketData';
import {
  DISPLAY_CURRENCY_STORAGE_KEY,
  convertFromTRY,
  convertFromUSD,
  displaySymbol,
  formatAlternateMoney,
  formatDisplayCompact,
  formatDisplayMoney,
  parseDisplayCurrency,
  resolveCurrency,
  type DisplayCurrency,
  type DisplayMoneyOptions,
  type MoneyContext,
} from '@/lib/displayCurrency';

// Tercih localStorage'da (try/catch); depolama kullanılamıyorsa (gizli pencere, engelli site verisi) bu sekmede
// bellekte tutulur. Aynı sekmedeki tüm abonelere olayla, diğer sekmelere 'storage' olayıyla duyurulur.
const EVENT = 'pg:display-currency';
let memoryValue: string | null = null;

function read(): string | null {
  try {
    return localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY) ?? memoryValue;
  } catch {
    return memoryValue;
  }
}

function write(cur: DisplayCurrency) {
  memoryValue = cur;
  try {
    localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, cur);
  } catch {
    // depolama yok — yalnızca bu sekmede geçerli
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

function subscribe(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === DISPLAY_CURRENCY_STORAGE_KEY) callback();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EVENT, callback);
  };
}

/** Yalnızca tercih (kur gerektirmez; düğmeler için) — sunucuda ve hidrasyonda TL */
export function useDisplayCurrencyPreference(): [DisplayCurrency, (c: DisplayCurrency) => void] {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  return [parseDisplayCurrency(raw), write];
}

export interface DisplayCurrencyApi {
  /** Kullanıcının seçtiği birim */
  preference: DisplayCurrency;
  /** Gerçekte gösterilen birim (USD seçili ama kur yüklenmediyse TL) */
  currency: DisplayCurrency;
  /** 1 USD = ? TL (sunucunun güncel kuru; bilinmiyorsa null) */
  usdTry: number | null;
  /** ₺ / $ */
  symbol: string;
  ctx: MoneyContext;
  setCurrency: (c: DisplayCurrency) => void;
  toggle: () => void;
  /** TL tutarı → görüntüleme birimi (nativeUSD: varlığın kendi USD fiyatı) */
  convert: (valueTRY: number | null | undefined, nativeUSD?: number | null) => number | null;
  /** USD tutarı (ör. piyasa değeri) → görüntüleme birimi */
  convertUSD: (valueUSD: number | null | undefined) => number | null;
  /** Biçimlendirilmiş tutar */
  money: (valueTRY: number | null | undefined, opts?: DisplayMoneyOptions) => string;
  /** Diğer birimdeki karşılık ("≈ $25,01"); bilinmiyorsa null */
  alt: (valueTRY: number | null | undefined, opts?: DisplayMoneyOptions) => string | null;
  /** Kısa tutar ("$3,4 B") */
  compact: (valueTRY: number | null | undefined, nativeUSD?: number | null) => string;
  /** USD tutarın (piyasa değeri, hacim) kısa gösterimi görüntüleme biriminde; bilinmiyorsa "—" */
  compactUSD: (valueUSD: number | null | undefined) => string;
  /**
   * Fiyatın diğer birimdeki karşılığı (tablo ikincil satırı): TL görünümde yalnızca USD kotasyonlu varlıklar için
   * kendi USD fiyatı, USD görünümde TL fiyatı; yoksa null.
   */
  secondaryPrice: (priceTRY: number | null | undefined, priceUSD: number | null | undefined) => string | null;
  /**
   * Varlığın birim fiyatı: hisse/kripto USD görünümde kendi USD kotasyonu; döviz çapraz kurla (EUR → $1,13).
   * USD'nin kendisi (ve `pairTRY` ile "EUR/TRY" gibi kur çifti kartları) her zaman TL kurudur — "$1,00" anlamsız.
   */
  assetPrice: (a: PricedAsset, opts?: { pairTRY?: boolean }) => string;
  /** Tablo/kart ikincil satırı (diğer birim); kur çiftlerinde null */
  assetSecondary: (a: PricedAsset, opts?: { pairTRY?: boolean }) => string | null;
}

export interface PricedAsset {
  type: string;
  symbol: string;
  priceTRY: number | null;
  priceUSD: number | null;
}

/** TL kuru olarak gösterilmesi gereken varlık mı (USD/TRY, ya da açıkça "X/TRY" kur çifti) */
export const isTryPair = (a: Pick<PricedAsset, 'type' | 'symbol'>, pairTRY?: boolean) =>
  a.type === 'currency' && (pairTRY === true || a.symbol.toUpperCase() === 'USD');

/**
 * Site geneli TL / USD görüntüleme tercihi + kur. Para gösteren her bileşen bunu kullanır; tercih değişince
 * tüm abonelikler aynı anda yeniden çizilir. Kur, /currencies (SWR, paylaşılan önbellek) USD satış kurudur.
 */
export function useDisplayCurrency(): DisplayCurrencyApi {
  const [preference, setCurrency] = useDisplayCurrencyPreference();
  const { usdTry } = useCurrencies();
  const ctx = useMemo<MoneyContext>(() => ({ currency: preference, usdTry }), [preference, usdTry]);
  const currency = resolveCurrency(ctx);
  const toggle = useCallback(() => setCurrency(preference === 'USD' ? 'TRY' : 'USD'), [preference, setCurrency]);
  const secondaryPrice = useCallback(
    (priceTRY: number | null | undefined, priceUSD: number | null | undefined): string | null => {
      if (currency === 'USD') return priceTRY != null && Number.isFinite(priceTRY) ? formatMoney(priceTRY, 'TRY', { precise: true }) : null;
      return priceUSD != null && Number.isFinite(priceUSD) ? formatMoney(priceUSD, 'USD', { precise: true }) : null;
    },
    [currency],
  );

  return useMemo<DisplayCurrencyApi>(
    () => ({
      preference,
      currency,
      usdTry,
      symbol: displaySymbol(currency),
      ctx,
      setCurrency,
      toggle,
      convert: (v, nativeUSD) => convertFromTRY(v, ctx, nativeUSD),
      convertUSD: (v) => convertFromUSD(v, ctx),
      money: (v, opts) => formatDisplayMoney(v, ctx, opts),
      alt: (v, opts) => formatAlternateMoney(v, ctx, opts),
      compact: (v, nativeUSD) => formatDisplayCompact(v, ctx, nativeUSD),
      compactUSD: (v) => {
        const c = convertFromUSD(v, ctx);
        return c == null || c === 0 ? '—' : formatMoneyCompact(c, currency);
      },
      secondaryPrice,
      assetPrice: (a, opts) => {
        if (isTryPair(a, opts?.pairTRY)) return a.priceTRY != null ? formatMoney(a.priceTRY, 'TRY', { precise: true }) : '—';
        if (a.priceTRY == null && !(currency === 'USD' && a.priceUSD != null)) return '—';
        return formatDisplayMoney(a.priceTRY, ctx, { precise: true, nativeUSD: a.priceUSD });
      },
      assetSecondary: (a, opts) => (isTryPair(a, opts?.pairTRY) ? null : secondaryPrice(a.priceTRY, a.priceUSD)),
    }),
    [preference, currency, usdTry, ctx, setCurrency, toggle, secondaryPrice],
  );
}
