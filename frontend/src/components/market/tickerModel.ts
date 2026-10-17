// Piyasa şeridi (MarketTicker) — saf yardımcılar: sekmeler, öğe biçimleme, kesintisiz kayan şerit için çoğaltma ve süre.

import { formatMoney, formatPercent, trend } from '@portfoygo/shared/format';
import { absoluteChange } from '@/components/asset/AssetHeaderCard';
import { convertFromTRY, resolveCurrency, validRate, type DisplayCurrency, type MoneyContext } from '@/lib/displayCurrency';
import type { MarketAsset } from '@/types';
import { assetHref } from './MarketTable';

export type TickerTab = 'stock' | 'crypto' | 'currency' | 'commodity' | 'watchlist';

/** Yalnızca gerçekten verisi olan pazarlar (endeks / Avrupa / Asya verisi yok — uydurulmaz) */
export const TICKER_TABS: { value: TickerTab; label: string }[] = [
  { value: 'stock', label: 'ABD Hisseleri' },
  { value: 'crypto', label: 'Kripto' },
  { value: 'currency', label: 'Döviz' },
  { value: 'commodity', label: 'Emtia' },
  { value: 'watchlist', label: 'İzleme listem' },
];

export function tickerTabs(hasWatchlist: boolean) {
  return TICKER_TABS.filter((t) => t.value !== 'watchlist' || hasWatchlist);
}

export interface TickerItem {
  key: string;
  href: string;
  type: MarketAsset['type'];
  symbol: string;
  name: string;
  image?: string;
  /** "₺4.321,50", "$103,10" ya da döviz için "1 EUR = $1,13" */
  price: string;
  /** "+$1,25" (fiyatın birimiyle); hesaplanamıyorsa null */
  change: string | null;
  /** "+%1,23" */
  percent: string;
  trend: 'up' | 'down' | 'flat';
}

/**
 * Şerit öğesi. Fiyat seçili görüntüleme biriminde (hisse/kripto USD görünümde kendi USD kotasyonu). Döviz kur olarak
 * okunur: "1 EUR = ₺55,62" / USD görünümde "1 EUR = $1,13"; USD'nin kendisi her zaman "1 USD = ₺49,45".
 * Fiyatı bilinmeyen varlık null döner (şeritte gösterilmez).
 */
export function tickerItem(a: MarketAsset, ctx: MoneyContext): TickerItem | null {
  if (a.priceTRY == null && !(resolveCurrency(ctx) === 'USD' && a.priceUSD != null)) return null;
  let cur: DisplayCurrency;
  let value: number | null;
  let price: string;
  if (a.type === 'currency') {
    cur = a.symbol === 'USD' || !validRate(ctx.usdTry) ? 'TRY' : resolveCurrency(ctx);
    value = cur === 'USD' ? convertFromTRY(a.priceTRY, ctx) : a.priceTRY;
    if (value == null) return null;
    price = `1 ${a.symbol} = ${formatMoney(value, cur, { precise: true })}`;
  } else {
    cur = resolveCurrency(ctx);
    value = convertFromTRY(a.priceTRY, ctx, a.priceUSD);
    if (value == null) return null;
    price = formatMoney(value, cur, { precise: true });
  }
  const abs = absoluteChange(value, a.changePercent);
  return {
    key: a.key,
    href: assetHref(a),
    type: a.type,
    symbol: a.symbol,
    name: a.name,
    image: a.image,
    price,
    change: abs == null ? null : formatMoney(abs, cur, { precise: true, sign: true }),
    percent: formatPercent(a.changePercent),
    trend: trend(a.changePercent),
  };
}

export function tickerItems(assets: readonly MarketAsset[], ctx: MoneyContext, limit = 60): TickerItem[] {
  const out: TickerItem[] = [];
  for (const a of assets) {
    const item = tickerItem(a, ctx);
    if (item) out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Kesintisiz kayan şerit için yarı: kısa listeler (ör. 2 öğelik izleme listesi) en az `minPerHalf` öğeye kadar
 * tekrarlanır ki yarım şerit görünür alanı doldursun. Bileşen bu yarıyı İKİ kez çizer (ikincisi aria-hidden) ve
 * -%50 kaydırır; ikinci yarı birincinin tam kopyası olduğundan döngü dikişsizdir. Anahtarlar tekrarlarda benzersizdir.
 */
export function marqueeHalf<T extends { key: string }>(items: readonly T[], minPerHalf = 10): (T & { loopKey: string })[] {
  if (items.length === 0) return [];
  const out: (T & { loopKey: string })[] = [];
  let round = 0;
  while (out.length < Math.max(minPerHalf, items.length)) {
    for (const it of items) {
      out.push({ ...it, loopKey: round === 0 ? it.key : `${it.key}~${round}` });
      if (round > 0 && out.length >= minPerHalf) break;
    }
    round++;
  }
  return out;
}

/** Kayma süresi (sn): içerik genişliğiyle orantılı (sabit hız, px/sn); çok kısa listelerde en az `minSec` */
export function marqueeDuration(halfWidthPx: number, pxPerSec = 45, minSec = 15): number {
  if (!Number.isFinite(halfWidthPx) || halfWidthPx <= 0) return 60;
  return Math.max(minSec, Math.round((halfWidthPx / pxPerSec) * 10) / 10);
}
