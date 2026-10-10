'use client';

import { useNow } from '@/hooks/useNow';
import { formatTrClock } from '@/lib/marketHours';
import { cn, formatTRY, formatUSD, trend } from '@portfoygo/shared/format';
import { Card } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import Button from '@portfoygo/shared/ui/Button';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import PriceTick from '@/components/market/PriceTick';
import WatchStar from '@/components/market/WatchStar';
import { ASSET_TYPE_LABELS, type MarketAsset } from '@/types';
import MarketStatus from './MarketStatus';

/** Yüzde değişimden mutlak değişimi geri hesaplar (fiyat / (1 + p)). */
export function absoluteChange(price: number | null, changePercent: number | null | undefined): number | null {
  if (price == null || changePercent == null || !Number.isFinite(changePercent) || changePercent <= -100) return null;
  return price - price / (1 + changePercent / 100);
}

interface Props {
  asset: MarketAsset;
  /** Canlı fiyat yoksa (son değerleme gösteriliyor) */
  stale?: boolean;
  canSell: boolean;
  onBuy: () => void;
  onSell: () => void;
}

/** Varlık sayfası başlık kartı: büyük simge, isim, sembol/tür etiketi, piyasa durumu, fiyat ve Al / Sat. */
export default function AssetHeaderCard({ asset, stale, canSell, onBuy, onSell }: Props) {
  const now = useNow(30_000);
  const price = asset.priceTRY;
  const abs = absoluteChange(price, asset.changePercent);
  const t = trend(asset.changePercent);

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <AssetAvatar symbol={asset.symbol} type={asset.type} image={asset.image} size={72} className="max-sm:hidden" />
          <AssetAvatar symbol={asset.symbol} type={asset.type} image={asset.image} size={56} className="sm:hidden" />
          <div className="min-w-0">
            <h1 className="line-clamp-2 text-2xl font-semibold text-fg sm:text-3xl">{asset.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="inline-flex items-center rounded-full bg-surface-3 px-2.5 py-0.5 text-xs font-medium text-fg">
                {asset.symbol}
                <span className="mx-1 text-subtle" aria-hidden="true">
                  ·
                </span>
                {ASSET_TYPE_LABELS[asset.type]}
              </span>
              <MarketStatus type={asset.type} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <WatchStar type={asset.type} symbol={asset.symbol} size="md" />
          <Button
            variant="secondary"
            onClick={onSell}
            disabled={!canSell}
            title={canSell ? undefined : 'Satmak için önce bu varlıktan almalısın'}
            className="flex-1 sm:min-w-28 sm:flex-none"
          >
            Sat
          </Button>
          <Button variant="primary" onClick={onBuy} disabled={price == null} className="flex-1 sm:min-w-28 sm:flex-none">
            Al
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="min-w-0 truncate text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
          <PriceTick value={price}>{price != null ? formatTRY(price, { precise: true }) : '—'}</PriceTick>
        </p>
        {asset.priceUSD != null && price != null && <span className="num text-base font-medium text-muted">{formatUSD(asset.priceUSD, { precise: true })}</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {abs != null && (
          <span className={cn('num font-medium', t === 'up' ? 'text-up' : t === 'down' ? 'text-down' : 'text-muted')}>{formatTRY(abs, { precise: true, sign: true })}</span>
        )}
        <Delta value={asset.changePercent} />
        <span className="text-muted">{asset.type === 'stock' ? 'günlük' : 'son 24 saat'}</span>
        <span className="text-subtle" aria-hidden="true">
          ·
        </span>
        <span className="text-muted">{stale ? 'Son değerleme' : `Bugün itibarıyla ${formatTrClock(now)}`}</span>
      </div>
    </Card>
  );
}
