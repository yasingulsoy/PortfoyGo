'use client';

import { useMemo, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid';
import { FireIcon } from '@heroicons/react/24/outline';
import { useMarket } from '@/hooks/useMarketData';
import { useTrade } from '@/components/trade/TradeProvider';
import { cn, formatTRY } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import Button from '@portfoygo/shared/ui/Button';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import Sparkline from '@/components/asset/Sparkline';
import { useSparklines } from '@/hooks/useMarketHistory';
import type { MarketAsset } from '@/types';
import { assetHref } from './MarketTable';
import PriceTick from './PriceTick';

const LIMIT = 12;

/** Tüm piyasalarda günlük değişimi (mutlak) en yüksek varlıklar. */
export function topMovers(byType: Record<string, MarketAsset[]>, limit = LIMIT): MarketAsset[] {
  return Object.values(byType)
    .flat()
    .filter((a) => a.priceTRY != null && Number.isFinite(a.changePercent))
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, limit);
}

const roundBtn =
  'flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-40';

/** TailAdmin "Trending Stocks": yatay kaydırılabilir varlık karoları, Sat / Al düğmeleriyle. */
export default function TrendingAssets({ className }: { className?: string }) {
  const market = useMarket();
  const { openTrade } = useTrade();
  const scroller = useRef<HTMLUListElement>(null);
  const movers = useMemo(() => topMovers(market.byType), [market.byType]);
  const sparks = useSparklines(movers);

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <CardHeader
        title="Trend varlıklar"
        description="Son 24 saatte en çok hareket edenler"
        action={
          <div className="flex items-center gap-2">
            <button type="button" className={roundBtn} onClick={() => scrollBy(-1)} aria-label="Önceki varlıklar" aria-controls="trending-list">
              <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" className={roundBtn} onClick={() => scrollBy(1)} aria-label="Sonraki varlıklar" aria-controls="trending-list">
              <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        }
      />
      {market.isLoading && movers.length === 0 ? (
        <div className="flex gap-4 overflow-hidden px-5 pb-5 sm:px-6 sm:pb-6" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[212px] w-[260px] shrink-0 rounded-xl" />
          ))}
        </div>
      ) : movers.length === 0 ? (
        <EmptyState className="py-8" icon={<FireIcon />} title="Piyasa verisi alınamadı" description="Birazdan otomatik olarak yeniden denenecek." />
      ) : (
        <ul
          id="trending-list"
          ref={scroller}
          aria-label="Trend varlıklar"
          className="scrollbar-none flex flex-1 snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-5 sm:scroll-px-6 sm:px-6 sm:pb-6"
        >
          {movers.map((a) => (
            <li key={a.key} className="flex w-[260px] shrink-0 snap-start flex-col rounded-xl bg-surface-2 p-4 sm:w-[272px]">
              <div className="flex items-start justify-between gap-3">
                <Link href={assetHref(a)} className="group flex min-w-0 items-center gap-3">
                  <AssetAvatar symbol={a.symbol} type={a.type} image={a.image} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-fg group-hover:text-brand">{a.symbol}</span>
                    <span className="block truncate text-xs text-muted">{a.name}</span>
                  </span>
                </Link>
                <div className="shrink-0 text-right">
                  <PriceTick value={a.priceTRY} className="block text-sm font-semibold text-fg">
                    {formatTRY(a.priceTRY, { precise: true })}
                  </PriceTick>
                  <Delta value={a.changePercent} variant="text" className="text-xs" />
                </div>
              </div>
              <div className="mt-4 flex flex-1 items-center">
                <Sparkline values={sparks.get(a.type, a.symbol)} loading={sparks.isLoading} width={240} height={44} area className="w-full" label={`${a.symbol} son 7 gün`} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="secondary" size="md" onClick={() => openTrade(a, 'sell')} aria-label={`${a.symbol} sat`}>
                  Sat
                </Button>
                <Button variant="primary" size="md" onClick={() => openTrade(a, 'buy')} aria-label={`${a.symbol} al`}>
                  Al
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
