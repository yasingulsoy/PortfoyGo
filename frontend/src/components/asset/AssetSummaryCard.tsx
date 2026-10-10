'use client';

import { formatTRY } from '@portfoygo/shared/format';
import { Card } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import { getMarketStatus } from '@/lib/marketHours';
import type { MarketAsset } from '@/types';
import PriceTick from '@/components/market/PriceTick';
import PerformanceTiles from './PerformanceTiles';

/** Gün içi düşük–yüksek aralığında güncel fiyatın konumu (0–100); veri yoksa null. */
export function rangePosition(low: number | undefined, high: number | undefined, price: number | null | undefined): number | null {
  if (low == null || high == null || price == null || !(high > low) || !Number.isFinite(price)) return null;
  return Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
}

/** Sağ sütun: seçili varlığın özeti — fiyat, gün içi aralık ve dönemsel performans karoları. */
export default function AssetSummaryCard({ asset, usdTry }: { asset: MarketAsset; usdTry: number | null }) {
  const status = getMarketStatus(asset.type);
  // Gün içi aralık USD kotasyonlu varlıklarda (hisse) TL'ye çevrilir
  const k = asset.priceUSD != null && usdTry ? usdTry : null;
  const low = asset.low != null && k ? asset.low * k : undefined;
  const high = asset.high != null && k ? asset.high * k : undefined;
  const pos = rangePosition(low, high, asset.priceTRY);

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <AssetAvatar symbol={asset.symbol} type={asset.type} image={asset.image} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-fg">{asset.symbol}</p>
          <p className="truncate text-xs text-muted">{asset.name}</p>
        </div>
        <div className="shrink-0 text-right">
          <PriceTick value={asset.priceTRY} className="block text-sm font-semibold text-fg">
            {asset.priceTRY != null ? formatTRY(asset.priceTRY, { precise: true }) : '—'}
          </PriceTick>
          <Delta value={asset.changePercent} variant="text" className="text-xs" />
        </div>
      </div>

      {pos != null && (
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Gün içi düşük</span>
            <span>Gün içi yüksek</span>
          </div>
          <div className="relative mt-2 h-1.5 rounded-full bg-surface-3" role="img" aria-label={`Güncel fiyat gün içi aralığın %${Math.round(pos)} noktasında`}>
            <span className="absolute inset-y-0 left-0 rounded-full bg-brand/30" style={{ width: `${pos}%` }} />
            <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand shadow-card" style={{ left: `${pos}%` }} />
          </div>
          <div className="num mt-2 flex items-center justify-between text-xs font-medium text-fg">
            <span>{formatTRY(low, { precise: true })}</span>
            <span>{formatTRY(high, { precise: true })}</span>
          </div>
        </div>
      )}

      <h3 className="mt-6 text-sm font-semibold text-fg">Performans</h3>
      <PerformanceTiles type={asset.type} symbol={asset.symbol} layout="grid" className="mt-3" />
      <p className="mt-4 text-xs text-subtle">{status.note}</p>
    </Card>
  );
}
