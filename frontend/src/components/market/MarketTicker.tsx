'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon, PauseIcon, PlayIcon } from '@heroicons/react/20/solid';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import { Skeleton } from '@portfoygo/shared/ui/Feedback';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { cn } from '@portfoygo/shared/format';
import { FEATURED_CURRENCIES, useMarket } from '@/hooks/useMarketData';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useWatchlistAssets } from './WatchlistPanel';
import { marqueeDuration, marqueeHalf, tickerItems, tickerTabs, type TickerItem, type TickerTab } from './tickerModel';

const TAB_KEY = 'pg:ticker-tab';
const TONE = { up: 'text-up', down: 'text-down', flat: 'text-muted' } as const;

function isTab(v: string | null): v is TickerTab {
  return v === 'stock' || v === 'crypto' || v === 'currency' || v === 'commodity' || v === 'watchlist';
}

/**
 * Panelin üstündeki piyasa şeridi: sekmeler (ABD hisseleri, kripto, döviz, emtia, izleme listesi) ve sürekli kayan
 * fiyat şeridi. Fiyatlar seçili TL/USD görüntüleme biriminde, SWR piyasa verisiyle (15 sn) yenilenir. Fareyle üzerine
 * gelince / klavye odağında / "Durdur" ile durur; hareket azaltma tercihinde kaymaz, yatay kaydırılabilir.
 */
export default function MarketTicker({ className }: { className?: string }) {
  const market = useMarket();
  const dc = useDisplayCurrency();
  const watch = useWatchlist();
  const { assets: watchAssets } = useWatchlistAssets();
  const [stored, setStored] = useLocalStorage(TAB_KEY);
  const [paused, setPaused] = useState(false);

  const tabs = tickerTabs(watch.items.length > 0);
  const tab: TickerTab = isTab(stored) && tabs.some((t) => t.value === stored) ? stored : 'stock';

  const items = useMemo(() => {
    let list = tab === 'watchlist' ? watchAssets : market.byType[tab];
    if (tab === 'currency') {
      const rank = (s: string) => {
        const i = FEATURED_CURRENCIES.indexOf(s);
        return i === -1 ? 999 : i;
      };
      list = [...list].sort((a, b) => rank(a.symbol) - rank(b.symbol));
    }
    return tickerItems(list, dc.ctx);
  }, [tab, watchAssets, market.byType, dc.ctx]);
  const half = useMemo(() => marqueeHalf(items), [items]);

  // Hız sabit: süre, yarım şeridin genişliğiyle orantılı (ölçüm DOM'dan; React durumu yalnızca süre)
  const halfRef = useRef<HTMLUListElement>(null);
  const [duration, setDuration] = useState(60);
  useEffect(() => {
    const el = halfRef.current;
    if (!el) return;
    const measure = () => setDuration(marqueeDuration(el.scrollWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [half]);

  const loading = tab === 'watchlist' ? watch.isLoading : market.isLoading && items.length === 0;
  const activeLabel = tabs.find((t) => t.value === tab)?.label ?? '';

  return (
    <section aria-label="Piyasa şeridi" className={cn('min-w-0 overflow-hidden rounded-2xl border border-line bg-surface', className)}>
      <div className="flex items-center gap-3 px-4 sm:px-5">
        <Tabs
          variant="underline"
          label="Piyasa şeridi pazarları"
          value={tab}
          onChange={(v) => setStored(v)}
          items={tabs}
          className="min-w-0 flex-1 border-b-0"
        />
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          aria-label={paused ? 'Şeridi oynat' : 'Şeridi durdur'}
          title={paused ? 'Oynat' : 'Durdur'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-fg motion-reduce:hidden"
        >
          {paused ? <PlayIcon className="h-4 w-4" aria-hidden="true" /> : <PauseIcon className="h-4 w-4" aria-hidden="true" />}
        </button>
        <Link href="/markets" className="hidden shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline sm:inline-flex">
          Tümünü gör <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div
        role="tabpanel"
        aria-label={`${activeLabel} fiyatları`}
        data-paused={paused || undefined}
        className="ticker-viewport relative border-t border-line"
      >
        {loading ? (
          <div className="flex gap-6 px-5 py-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-40 shrink-0" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-5 py-3 text-sm text-muted">{tab === 'watchlist' ? 'İzleme listen boş.' : 'Bu pazarda şu an fiyat yok.'}</p>
        ) : (
          <div className="ticker-track flex w-max" style={{ ['--ticker-duration' as string]: `${duration}s` }}>
            <ul ref={halfRef} className="flex shrink-0">
              {half.map((it) => (
                <TickerEntry key={it.loopKey} item={it} />
              ))}
            </ul>
            {/* Kesintisiz döngü için birebir kopya: ekran okuyucu ve klavye için gizli */}
            <ul className="ticker-dup flex shrink-0" aria-hidden="true">
              {half.map((it) => (
                <TickerEntry key={it.loopKey} item={it} hidden />
              ))}
            </ul>
          </div>
        )}
      </div>

      <Link href="/markets" className="flex items-center justify-center gap-1 border-t border-line py-2 text-sm font-medium text-brand sm:hidden">
        Tümünü gör <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

function TickerEntry({ item, hidden = false }: { item: TickerItem; hidden?: boolean }) {
  const Arrow = item.trend === 'down' ? ArrowDownRightIcon : ArrowUpRightIcon;
  return (
    <li className="shrink-0 border-r border-line">
      <Link
        href={item.href}
        tabIndex={hidden ? -1 : undefined}
        title={item.name}
        className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
      >
        <AssetAvatar symbol={item.symbol} type={item.type} image={item.image} size={22} />
        <span className="text-sm font-semibold text-fg">{item.symbol}</span>
        <span className="num whitespace-nowrap text-sm text-fg">{item.price}</span>
        <span className={cn('num inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-medium', TONE[item.trend])}>
          {item.trend !== 'flat' && <Arrow className="h-3.5 w-3.5" aria-hidden="true" />}
          {item.change && <span className="max-sm:hidden">{item.change}</span>}
          <span>({item.percent})</span>
        </span>
      </Link>
    </li>
  );
}
