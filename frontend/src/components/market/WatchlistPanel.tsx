'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PlusIcon } from '@heroicons/react/20/solid';
import { StarIcon } from '@heroicons/react/24/outline';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useMarket } from '@/hooks/useMarketData';
import { openCommandPalette } from '@/components/command/events';
import { cn, formatTRY } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import { ASSET_TYPE_LABELS, type AssetType, type MarketAsset } from '@/types';
import { assetHref } from './MarketTable';
import PriceTick from './PriceTick';

interface Props {
  /** Vurgulanacak (ör. o an görüntülenen) varlık */
  highlight?: { type: AssetType; symbol: string };
  /** Daha sıkı satırlar ve daha kısa kaydırma alanı */
  compact?: boolean;
  className?: string;
}

/** İzleme listesindeki varlıkları canlı fiyatlarıyla eşler; listede olmayanlar fiyatsız döner. */
export function useWatchlistAssets() {
  const watch = useWatchlist();
  const market = useMarket();
  const assets = useMemo<MarketAsset[]>(
    () =>
      watch.items.map(
        (i) =>
          market.find(i.asset_type, i.symbol) ?? {
            key: `${i.asset_type}:${i.symbol.toUpperCase()}`,
            type: i.asset_type,
            symbol: i.symbol.toUpperCase(),
            name: ASSET_TYPE_LABELS[i.asset_type],
            priceTRY: null,
            priceUSD: null,
            changePercent: 0,
          },
      ),
    [watch.items, market],
  );
  return { assets, watch, market };
}

/** TailAdmin "My Watchlist" kartı: izlenen varlıklar, fiyat ve günlük değişim. */
export default function WatchlistPanel({ highlight, compact = false, className }: Props) {
  const { assets, watch, market } = useWatchlistAssets();
  const highlightKey = highlight ? `${highlight.type}:${highlight.symbol.toUpperCase()}` : null;
  const loading = watch.isLoading || (market.isLoading && assets.length > 0 && assets.every((a) => a.priceTRY == null));

  return (
    <Card className={cn('flex min-h-0 flex-col overflow-hidden', className)}>
      <CardHeader
        title="İzleme listem"
        description={watch.items.length > 0 ? `${watch.items.length} varlık` : 'Takip ettiğin varlıklar'}
        action={
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="İzleme listesine varlık ekle"
            title="Varlık ara ve ekle"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:bg-surface-3 hover:text-fg"
          >
            <PlusIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        }
        className="pb-3"
      />

      {loading ? (
        <ul className="space-y-1 px-3 pb-4 sm:px-4" aria-busy="true">
          {Array.from({ length: compact ? 3 : 5 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-2 py-2.5">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-16" />
            </li>
          ))}
        </ul>
      ) : assets.length === 0 ? (
        <EmptyState
          className="px-5 pb-8 pt-4"
          icon={<StarIcon />}
          title={watch.error ? 'İzleme listesi yüklenemedi' : 'İzleme listen boş'}
          description={
            watch.error
              ? 'Birazdan otomatik olarak yeniden denenecek.'
              : 'Varlıkların yanındaki yıldıza dokunarak ya da + düğmesiyle arayıp ekleyebilirsin.'
          }
        />
      ) : (
        <ul
          className={cn(
            'min-h-0 flex-1 overflow-y-auto px-3 pb-3 sm:px-4',
            compact ? 'max-h-[320px]' : 'max-h-[420px]',
          )}
        >
          {assets.map((a) => {
            const active = a.key === highlightKey;
            return (
              <li key={a.key} className="border-b border-line last:border-b-0">
                <Link
                  href={assetHref(a)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'my-1 flex items-center gap-3 rounded-xl px-2 transition-colors',
                    compact ? 'py-2' : 'py-2.5',
                    active ? 'bg-brand-soft' : 'hover:bg-surface-2',
                  )}
                >
                  <AssetAvatar symbol={a.symbol} type={a.type} image={a.image} size={compact ? 32 : 36} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm font-semibold', active ? 'text-brand' : 'text-fg')}>{a.symbol}</span>
                    <span className="block truncate text-xs text-muted">{a.name}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <PriceTick value={a.priceTRY} className="block text-sm font-semibold text-fg">
                      {a.priceTRY != null ? formatTRY(a.priceTRY, { precise: true }) : '—'}
                    </PriceTick>
                    {a.priceTRY != null && <Delta value={a.changePercent} variant="text" className="text-xs" />}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
