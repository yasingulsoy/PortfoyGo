'use client';

import { useMemo } from 'react';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useMarket } from '@/hooks/useMarketData';
import { useSparklines } from '@/hooks/useMarketHistory';
import { cn } from '@portfoygo/shared/format';
import type { AssetType } from '@/types';
import AssetQuoteCard from './AssetQuoteCard';

export interface AssetRef {
  type: AssetType;
  symbol: string;
  name?: string;
  label?: string;
}

/** İzleme listesi 4'ten azsa tamamlamak için popüler varlıklar. */
export const POPULAR_ASSETS: AssetRef[] = [
  { type: 'stock', symbol: 'AAPL', name: 'Apple Inc.' },
  { type: 'crypto', symbol: 'BTC', name: 'Bitcoin' },
  { type: 'currency', symbol: 'USD', name: 'ABD Doları' },
  { type: 'commodity', symbol: 'GAU', name: 'Gram Altın' },
];

/** Popüler varsayılanlardan biri için veri yoksa yerine geçecek yedekler. */
const BACKUP_ASSETS: AssetRef[] = [
  { type: 'currency', symbol: 'EUR', name: 'Euro' },
  { type: 'crypto', symbol: 'ETH', name: 'Ethereum' },
  { type: 'stock', symbol: 'MSFT', name: 'Microsoft' },
  { type: 'stock', symbol: 'NVDA', name: 'NVIDIA' },
];

/** İzleme listesinin ilk öğeleri + gerektiğinde popüler varsayılanlar (tekrarsız). */
export function pickTopAssets(
  watch: ReadonlyArray<{ asset_type: AssetType; symbol: string }>,
  count = 4,
  /** Verilirse varsayılanlardan yalnızca verisi olanlar seçilir (izleme listesi her zaman korunur) */
  isAvailable?: (r: AssetRef) => boolean,
): AssetRef[] {
  const out: AssetRef[] = [];
  const seen = new Set<string>();
  const push = (r: AssetRef) => {
    const k = `${r.type}:${r.symbol.toUpperCase()}`;
    if (seen.has(k) || out.length >= count) return;
    seen.add(k);
    out.push({ ...r, symbol: r.symbol.toUpperCase() });
  };
  for (const w of watch) push({ type: w.asset_type, symbol: w.symbol });
  const defaults = isAvailable ? [...POPULAR_ASSETS, ...BACKUP_ASSETS].filter(isAvailable) : POPULAR_ASSETS;
  for (const p of defaults) push(p);
  // Hiçbiri yoksa (ör. piyasa verisi alınamadı) yine de popüler kartları göster
  for (const p of POPULAR_ASSETS) push(p);
  return out;
}

interface Props {
  /** Verilirse izleme listesi yerine bu varlıklar gösterilir */
  assets?: AssetRef[];
  /** Kartlarda 7 günlük mini grafik */
  sparklines?: boolean;
  showUSD?: boolean;
  className?: string;
}

/** TailAdmin "Stocks" üst satırı: 4 kompakt varlık kartı. */
export default function TopAssetCards({ assets, sparklines = false, showUSD = false, className }: Props) {
  const watch = useWatchlist();
  const market = useMarket();
  const { find, isLoading: marketLoading } = market;
  const refs = useMemo(
    () => assets ?? pickTopAssets(watch.items, 4, marketLoading ? undefined : (r) => !!find(r.type, r.symbol)),
    [assets, watch.items, find, marketLoading],
  );
  const sparks = useSparklines(sparklines ? refs : []);
  // İzleme listesi gelmeden kartları sabitleme (varsayılanlar bir an görünüp kaybolmasın)
  const waiting = !assets && watch.isLoading;

  return (
    <div className={cn('grid grid-cols-2 gap-4 md:gap-6 xl:grid-cols-4', className)}>
      {refs.map((r) => {
        const live = market.find(r.type, r.symbol);
        return (
          <AssetQuoteCard
            key={`${r.type}:${r.symbol}`}
            asset={live}
            fallback={r}
            label={r.label}
            loading={waiting || (market.isLoading && !live)}
            sparkline={sparklines ? (sparks.get(r.type, r.symbol) ?? null) : undefined}
            showUSD={showUSD}
          />
        );
      })}
    </div>
  );
}
