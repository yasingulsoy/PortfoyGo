'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import { Delta } from '@portfoygo/shared/ui/Delta';
import Button from '@portfoygo/shared/ui/Button';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useTrade } from '@/components/trade/TradeProvider';
import Sparkline from '@/components/asset/Sparkline';
import { useSparklines } from '@/hooks/useMarketHistory';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import { cn, formatNumber } from '@portfoygo/shared/format';
import type { MarketAsset } from '@/types';
import PriceTick from './PriceTick';
import WatchStar from './WatchStar';

export function assetHref(a: Pick<MarketAsset, 'type' | 'symbol' | 'coinId'>) {
  const params = new URLSearchParams({ type: a.type });
  if (a.coinId) params.set('id', a.coinId);
  return `/asset/${encodeURIComponent(a.symbol)}?${params}`;
}

/** Metin aramasıyla eşleşen varlıklar (sembol veya isim; Türkçe büyük/küçük harf duyarsız). */
export function filterAssets(assets: MarketAsset[], query: string): MarketAsset[] {
  const q = query.trim().toLocaleLowerCase('tr');
  if (!q) return assets;
  return assets.filter((a) => a.symbol.toLocaleLowerCase('tr').includes(q) || a.name.toLocaleLowerCase('tr').includes(q));
}

interface Props {
  assets: MarketAsset[];
  loading?: boolean;
  error?: unknown;
  query?: string;
  /** Piyasa değeri sütununu göster (lg+) */
  showMarketCap?: boolean;
  /** @deprecated showMarketCap ile aynı */
  showVolume?: boolean;
  /** 7 günlük mini grafik sütununu göster (md+) */
  showSparkline?: boolean;
  /** Liste boşken (arama yokken) gösterilecek özel boş durum */
  empty?: ReactNode;
  /** Uzun listelerde ilk N satır + "Daha fazla göster" (varsayılan: hepsi) */
  pageSize?: number;
  className?: string;
}

const th = 'py-3 text-xs font-medium text-muted whitespace-nowrap';

/**
 * TailAdmin tarzı piyasa tablosu: varlık (yıldız + simge + sembol + isim), fiyat, 24s değişim,
 * 7 günlük mini grafik, piyasa değeri ve Sat / Al düğmeleri. Satırın tamamı varlık sayfasına gider
 * (varlık hücresindeki bağlantı satırı kaplar; düğmeler üstte kalır).
 */
export default function MarketTable({ assets, loading, error, query = '', showMarketCap, showVolume, showSparkline = true, empty, pageSize, className }: Props) {
  const { openTrade } = useTrade();
  const dc = useDisplayCurrency();
  const rows = filterAssets(assets, query);
  const sparks = useSparklines(showSparkline ? rows : []);
  const withCap = showMarketCap ?? showVolume ?? false;
  const [limit, setLimit] = useState(pageSize ?? Infinity);
  const visible = Number.isFinite(limit) ? rows.slice(0, limit) : rows;
  const hidden = rows.length - visible.length;

  if (loading && assets.length === 0) {
    return (
      <div className={cn('border-t border-line', className)} aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line px-5 py-3.5 sm:px-6">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="hidden h-6 w-20 md:block" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
        <span className="sr-only" role="status">Piyasa verisi yükleniyor…</span>
      </div>
    );
  }

  if (rows.length === 0) {
    if (!query.trim() && !error && empty) return <>{empty}</>;
    return (
      <EmptyState
        className={cn('border-t border-line', className)}
        icon={<MagnifyingGlassIcon />}
        title={query.trim() ? 'Eşleşen varlık bulunamadı' : error ? 'Piyasa verisi alınamadı' : 'Bu piyasada henüz veri yok'}
        description={query.trim() ? `"${query.trim()}" için sonuç yok.` : error ? 'Veri sağlayıcısına şu an ulaşılamıyor. Birazdan otomatik olarak yeniden denenecek.' : undefined}
      />
    );
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-line text-left">
            <th scope="col" className={cn(th, 'pl-4 pr-3 sm:pl-6')}>Varlık</th>
            <th scope="col" className={cn(th, 'px-3 text-right')}>Fiyat</th>
            <th scope="col" className={cn(th, 'hidden px-3 text-right sm:table-cell')}>24s</th>
            {showSparkline && <th scope="col" className={cn(th, 'hidden px-3 text-center md:table-cell')}>7G</th>}
            {withCap && <th scope="col" className={cn(th, 'hidden px-3 text-right lg:table-cell')}>Piyasa değeri</th>}
            <th scope="col" className={cn(th, 'pl-3 pr-4 text-right sm:pr-6')}>
              <span className="sr-only">İşlem</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((a) => {
            const tradable = a.priceTRY != null;
            const secondary = dc.assetSecondary(a);
            return (
              <tr key={a.key} className="group relative border-b border-line transition-colors last:border-b-0 hover:bg-surface-2">
                <td className="py-3.5 pl-2 pr-3 sm:pl-4">
                  <div className="flex min-w-0 items-center gap-1 sm:gap-2">
                    <WatchStar type={a.type} symbol={a.symbol} className="relative z-10" />
                    <AssetAvatar symbol={a.symbol} type={a.type} image={a.image} size={32} />
                    <Link
                      href={assetHref(a)}
                      className="min-w-0 pl-1.5 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-[var(--ring)]"
                    >
                      <span className="block text-sm font-semibold text-fg group-hover:text-brand">{a.symbol}</span>
                      <span className="block max-w-[6.5rem] truncate text-xs text-muted sm:max-w-[14rem]">{a.name}</span>
                    </Link>
                  </div>
                </td>
                <td className="px-3 py-3.5 text-right align-middle">
                  <PriceTick value={a.priceTRY} className="whitespace-nowrap font-medium text-fg">
                    {dc.assetPrice(a)}
                  </PriceTick>
                  <div className="num mt-0.5 whitespace-nowrap text-xs text-subtle">
                    {secondary && <span className="hidden sm:inline">{secondary}</span>}
                    <Delta value={a.changePercent} variant="text" className="text-xs sm:hidden" />
                  </div>
                </td>
                <td className="hidden px-3 py-3.5 text-right sm:table-cell">
                  <Delta value={a.changePercent} />
                </td>
                {showSparkline && (
                  <td className="hidden px-3 py-3.5 text-center md:table-cell">
                    <Sparkline
                      values={sparks.get(a.type, a.symbol)}
                      loading={sparks.isLoading}
                      width={88}
                      height={28}
                      area
                      label={sparks.get(a.type, a.symbol) ? `${a.symbol} son 7 gün` : undefined}
                    />
                  </td>
                )}
                {withCap && (
                  <td className="num hidden px-3 py-3.5 text-right text-muted lg:table-cell">
                    {dc.compactUSD(a.marketCap)}
                  </td>
                )}
                <td className="py-3.5 pl-3 pr-4 text-right sm:pr-6">
                  <div className="relative z-10 inline-flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openTrade(a, 'sell')}
                      disabled={!tradable}
                      className="max-sm:hidden"
                      aria-label={`${a.symbol} sat`}
                    >
                      Sat
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => openTrade(a, 'buy')} disabled={!tradable} aria-label={`${a.symbol} al`}>
                      Al
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hidden > 0 && (
        <div className="flex flex-col items-center gap-1 border-t border-line px-4 py-4">
          <Button size="sm" variant="secondary" onClick={() => setLimit((n) => n + (pageSize ?? rows.length))}>
            Daha fazla göster
          </Button>
          <span className="num text-xs text-subtle">
            {formatNumber(visible.length, 0)} / {formatNumber(rows.length, 0)} varlık
          </span>
        </div>
      )}
    </div>
  );
}
