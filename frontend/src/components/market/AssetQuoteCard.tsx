'use client';

import Link from 'next/link';
import { cn, formatMoney } from '@portfoygo/shared/format';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { Skeleton } from '@portfoygo/shared/ui/Feedback';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import Sparkline from '@/components/asset/Sparkline';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import type { AssetType, MarketAsset } from '@/types';
import { assetHref } from './MarketTable';
import PriceTick from './PriceTick';

interface Props {
  /** Canlı varlık; yoksa `fallback` ile fiyatsız kart gösterilir */
  asset?: MarketAsset;
  fallback: { type: AssetType; symbol: string; name?: string };
  loading?: boolean;
  /** Kartın üst satırındaki etiket (ör. "USD/TRY"); verilmezse sembol */
  label?: string;
  /** 7 günlük seri (verilirse sağ altta mini grafik çizilir) */
  sparkline?: readonly number[] | null;
  /** Diğer birimdeki fiyatı (TL görünümde USD, USD görünümde TL) küçük satırda göster */
  showUSD?: boolean;
  className?: string;
}

/** TailAdmin "Stocks" üst kartı: simge, sembol, isim, fiyat ve değişim rozeti. Kartın tamamı varlık sayfasına gider. */
export default function AssetQuoteCard({ asset, fallback, loading, label, sparkline, showUSD = false, className }: Props) {
  const type = asset?.type ?? fallback.type;
  const symbol = asset?.symbol ?? fallback.symbol;
  const name = asset?.name ?? fallback.name ?? symbol;
  const dc = useDisplayCurrency();
  // Döviz kartları kur olarak okunur: "1 EUR = ₺55,62" (TL görünüm) / "1 EUR = $1,13" (USD görünüm). USD'nin kendisi
  // her zaman TL kurudur ("1 USD = ₺49,45"); etiketteki karşı birim de buna göre yazılır (EUR/TRY → EUR/USD).
  const fx = type === 'currency';
  const fxQuote: 'TRY' | 'USD' = fx && symbol !== 'USD' ? dc.currency : 'TRY';
  const fxValue = asset?.priceTRY == null ? null : fxQuote === 'USD' ? dc.convert(asset.priceTRY) : asset.priceTRY;
  const shownLabel = fx && label ? label.replace(/\/(TRY|USD)$/i, `/${fxQuote}`) : label;
  const priceText = !asset
    ? '—'
    : fx
      ? fxValue != null
        ? `1 ${symbol} = ${formatMoney(fxValue, fxQuote, { precise: true })}`
        : '—'
      : dc.assetPrice(asset);
  const secondary = showUSD && asset && !fx ? dc.assetSecondary(asset) : null;

  if (loading && !asset) {
    return (
      <div className={cn('rounded-2xl border border-line bg-surface p-4 sm:p-5', className)} aria-hidden="true">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="mt-5 h-6 w-28" />
      </div>
    );
  }

  return (
    <Link
      href={assetHref({ type, symbol, coinId: asset?.coinId })}
      className={cn(
        'group block min-w-0 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong sm:p-5',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <AssetAvatar symbol={symbol} type={type} image={asset?.image} size={40} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg group-hover:text-brand sm:text-base">{shownLabel ?? symbol}</p>
          <p className="truncate text-xs text-muted">{name}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5 sm:mt-5">
        <div className="min-w-0">
          <PriceTick value={asset?.priceTRY ?? null} className="block truncate text-base font-semibold text-fg sm:text-lg">
            {priceText}
          </PriceTick>
          {secondary && <p className="num truncate text-xs text-subtle">{secondary}</p>}
        </div>
        <div className="flex items-center gap-2">
          {sparkline !== undefined && asset && <Sparkline values={sparkline} width={56} height={22} className="max-sm:hidden" />}
          {asset ? <Delta value={asset.changePercent} /> : <span className="text-xs text-subtle">Veri yok</span>}
        </div>
      </div>
    </Link>
  );
}
