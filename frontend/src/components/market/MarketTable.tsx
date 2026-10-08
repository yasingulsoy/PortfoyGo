'use client';

import Link from 'next/link';
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import { Delta } from '@portfoygo/shared/ui/Delta';
import Button from '@portfoygo/shared/ui/Button';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useTrade } from '@/components/trade/TradeProvider';
import { formatCompact, formatTRY, formatUSD } from '@portfoygo/shared/format';
import type { MarketAsset } from '@/types';
import PriceTick from './PriceTick';
import WatchStar from './WatchStar';

export function assetHref(a: Pick<MarketAsset, 'type' | 'symbol' | 'coinId'>) {
  const params = new URLSearchParams({ type: a.type });
  if (a.coinId) params.set('id', a.coinId);
  return `/asset/${encodeURIComponent(a.symbol)}?${params}`;
}

interface Props {
  assets: MarketAsset[];
  loading?: boolean;
  error?: unknown;
  query?: string;
  /** Hacim / piyasa değeri sütununu göster */
  showVolume?: boolean;
}

export default function MarketTable({ assets, loading, error, query = '', showVolume }: Props) {
  const { openTrade } = useTrade();
  const q = query.trim().toLocaleLowerCase('tr');
  const rows = q ? assets.filter((a) => a.symbol.toLocaleLowerCase('tr').includes(q) || a.name.toLocaleLowerCase('tr').includes(q)) : assets;

  if (loading && assets.length === 0) {
    return (
      <div className="divide-y divide-line">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<MagnifyingGlassIcon />}
        title={q ? 'Eşleşen varlık bulunamadı' : error ? 'Piyasa verisi alınamadı' : 'Bu piyasada henüz veri yok'}
        description={q ? `"${query}" için sonuç yok.` : error ? 'Veri sağlayıcısına şu an ulaşılamıyor. Birazdan otomatik olarak yeniden denenecek.' : undefined}
      />
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="sr-only sm:not-sr-only">
        <tr className="border-b border-line text-left text-xs font-medium text-subtle">
          <th scope="col" className="py-2.5 pl-5 font-medium">Varlık</th>
          <th scope="col" className="py-2.5 pr-4 text-right font-medium">Fiyat</th>
          <th scope="col" className="hidden py-2.5 pr-4 text-right font-medium sm:table-cell">24s değişim</th>
          {showVolume && <th scope="col" className="hidden py-2.5 pr-4 text-right font-medium lg:table-cell">Piyasa değeri</th>}
          <th scope="col" className="py-2.5 pr-5 text-right font-medium">
            <span className="sr-only">İşlem</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((a) => (
          <tr key={a.key} className="group transition-colors hover:bg-surface-2/60">
            <td className="py-3 pl-5 pr-3">
              <Link href={assetHref(a)} className="flex min-w-0 items-center gap-3">
                <AssetAvatar symbol={a.symbol} type={a.type} image={a.image} />
                <span className="min-w-0">
                  <span className="block font-mono text-[13px] font-semibold text-fg group-hover:text-brand">{a.symbol}</span>
                  <span className="block max-w-[9rem] truncate text-xs text-muted sm:max-w-[16rem]">{a.name}</span>
                </span>
              </Link>
            </td>
            <td className="py-3 pr-4 text-right align-middle">
              <PriceTick value={a.priceTRY} className="font-semibold text-fg">
                {a.priceTRY != null ? formatTRY(a.priceTRY, { precise: true }) : '—'}
              </PriceTick>
              <div className="num mt-0.5 text-xs text-subtle">
                {a.priceUSD != null && <span className="hidden sm:inline">{formatUSD(a.priceUSD, { precise: true })}</span>}
                <Delta value={a.changePercent} variant="text" className="sm:hidden" />
              </div>
            </td>
            <td className="hidden py-3 pr-4 text-right sm:table-cell">
              <Delta value={a.changePercent} />
            </td>
            {showVolume && (
              <td className="num hidden py-3 pr-4 text-right text-muted lg:table-cell">{a.marketCap ? `$${formatCompact(a.marketCap)}` : '—'}</td>
            )}
            <td className="py-3 pr-5 text-right">
              <div className="flex justify-end gap-1.5">
                <WatchStar type={a.type} symbol={a.symbol} />
                <Button size="sm" variant="up" onClick={() => openTrade(a, 'buy')} disabled={a.priceTRY == null} aria-label={`${a.symbol} al`}>
                  Al
                </Button>
                <Button size="sm" variant="down" onClick={() => openTrade(a, 'sell')} disabled={a.priceTRY == null} className="max-sm:hidden" aria-label={`${a.symbol} sat`}>
                  Sat
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
