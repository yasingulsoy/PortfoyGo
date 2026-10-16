'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { StarIcon } from '@heroicons/react/24/outline';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { FEATURED_CURRENCIES, useMarket } from '@/hooks/useMarketData';
import { useWatchlist } from '@/hooks/useWatchlist';
import { Card } from '@portfoygo/shared/ui/Card';
import { EmptyState } from '@portfoygo/shared/ui/Feedback';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import Tabs from '@portfoygo/shared/ui/Tabs';
import PageTitle from '@/components/dashboard/PageTitle';
import MarketTable from '@/components/market/MarketTable';
import MarketStatus from '@/components/asset/MarketStatus';
import TopAssetCards, { type AssetRef } from '@/components/market/TopAssetCards';
import { useWatchlistAssets } from '@/components/market/WatchlistPanel';
import type { AssetType, MarketAsset } from '@/types';

type MarketTab = AssetType | 'watchlist';

const TYPE_TABS: { value: AssetType; label: string }[] = [
  { value: 'stock', label: 'Hisse' },
  { value: 'crypto', label: 'Kripto' },
  { value: 'currency', label: 'Döviz' },
  { value: 'commodity', label: 'Emtia' },
];

const TAB_VALUES: MarketTab[] = ['watchlist', 'stock', 'crypto', 'currency', 'commodity'];

const SUMMARY: AssetRef[] = [
  { type: 'currency', symbol: 'USD', name: 'ABD Doları', label: 'USD/TRY' },
  { type: 'currency', symbol: 'EUR', name: 'Euro', label: 'EUR/TRY' },
  { type: 'commodity', symbol: 'GAU', name: 'Gram Altın', label: 'Gram altın' },
  { type: 'crypto', symbol: 'BTC', name: 'Bitcoin', label: 'BTC' },
];

export default function MarketsPage() {
  // useSearchParams askıya alınabilir; sınır burada.
  return (
    <Suspense fallback={<PageLoader />}>
      <Markets />
    </Suspense>
  );
}

function Markets() {
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;

  return (
    <div className="space-y-4 md:space-y-6">
      <PageTitle
        title="Piyasalar"
        description="Hisse, kripto, döviz ve emtia fiyatları — tümü Türk lirası bazında"
        crumbs={[{ label: 'Panel', href: '/' }, { label: 'Piyasalar' }]}
      />
      <section aria-label="Piyasa özeti">
        <TopAssetCards assets={SUMMARY} sparklines />
      </section>
      <MarketsCard />
    </div>
  );
}

function MarketsCard() {
  const search = useSearchParams();
  const market = useMarket();
  const watch = useWatchlist();
  const { assets: watchAssets } = useWatchlistAssets();
  const tabParam = search.get('tab') as MarketTab | null;
  const [picked, setPicked] = useState<MarketTab | null>(tabParam && TAB_VALUES.includes(tabParam) ? tabParam : null);
  // Varsayılan sekme izleme listesi ilk yüklendiğinde bir kez belirlenir (doluysa izleme listesi,
  // değilse hisseler); sonradan yıldızla ekleme yapmak açık sekmeyi değiştirmez.
  if (picked === null && !watch.isLoading) setPicked(watch.items.length > 0 ? 'watchlist' : 'stock');
  const tab: MarketTab = picked ?? 'stock';
  const [query, setQuery] = useState('');

  const assets = useMemo<MarketAsset[]>(() => {
    if (tab === 'watchlist') return watchAssets;
    const list = market.byType[tab];
    if (tab !== 'currency') return list;
    // Önce öne çıkan kurlar, sonra diğerleri
    const rank = (s: string) => {
      const i = FEATURED_CURRENCIES.indexOf(s);
      return i === -1 ? 999 : i;
    };
    return [...list].sort((a, b) => rank(a.symbol) - rank(b.symbol));
  }, [market.byType, tab, watchAssets]);

  const tabs = [
    { value: 'watchlist' as const, label: 'İzleme listesi', count: watch.items.length },
    ...TYPE_TABS.map((t) => ({ ...t, count: market.byType[t.value].length })),
  ];

  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="flex flex-col gap-4 px-5 pb-4 pt-5 sm:px-6 sm:pt-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg">Tüm piyasalar</h2>
          <p className="mt-1 text-sm text-muted">
            {market.usdTry ? (
              <>
                USD/TRY <span className="num font-medium text-fg">{market.usdTry.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span> ile
                TL’ye çevrilir
              </>
            ) : (
              'Canlı fiyatlar, 15 saniyede bir yenilenir'
            )}
          </p>
        </div>
        <label className="relative block w-full lg:w-72">
          <span className="sr-only">Varlık ara</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sembol veya isim ara…"
            className="h-11 w-full rounded-lg border border-line bg-transparent pl-10 pr-3 text-sm text-fg shadow-card placeholder:text-subtle focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10"
          />
        </label>
      </div>
      <div className="flex flex-col gap-3 px-5 pb-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
        <Tabs label="Piyasa türü" value={tab} onChange={setPicked} items={tabs} className="w-fit max-w-full" />
        {tab === 'stock' && <MarketStatus type="stock" showCountdown className="rounded-full border border-line bg-surface-2 px-3 py-1.5 xl:shrink-0" />}
      </div>

      <MarketTable
        assets={assets}
        loading={tab === 'watchlist' ? watch.isLoading || market.isLoading : market.isLoading}
        error={tab === 'watchlist' ? watch.error : market.errors[tab]}
        query={query}
        showMarketCap={tab === 'crypto' || tab === 'stock'}
        empty={
          tab === 'watchlist' ? (
            <EmptyState
              className="border-t border-line"
              icon={<StarIcon />}
              title={watch.error ? 'İzleme listesi yüklenemedi' : 'İzleme listen boş'}
              description={
                watch.error ? (
                  'Birazdan otomatik olarak yeniden denenecek.'
                ) : (
                  <>
                    Takip etmek istediğin varlıkların satırındaki <StarIcon className="inline h-4 w-4 align-[-3px] text-gold" aria-label="yıldız" /> simgesine
                    dokun; burada tek bakışta görürsün.
                  </>
                )
              }
            />
          ) : undefined
        }
      />
    </Card>
  );
}
