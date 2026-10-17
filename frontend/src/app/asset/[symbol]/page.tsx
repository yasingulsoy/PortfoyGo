'use client';

import { Suspense, use, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { InformationCircleIcon, ShoppingCartIcon } from '@heroicons/react/24/outline';
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useLivePortfolio } from '@/context/PortfolioContext';
import { useTrade } from '@/components/trade/TradeProvider';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import { DISPLAY_CURRENCY_NAMES, fxSourceLabel } from '@/lib/displayCurrency';
import { COMMISSION_RATE } from '@/lib/constants';
import { formatPercent } from '@portfoygo/shared/format';
import { ASSET_TYPE_LABELS, type AssetType, type MarketAsset } from '@/types';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import { Card } from '@portfoygo/shared/ui/Card';
import { Alert, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { Breadcrumb } from '@/components/dashboard/PageTitle';
import AssetChart from '@/components/asset/AssetChart';
import AssetHeaderCard from '@/components/asset/AssetHeaderCard';
import AssetSummaryCard from '@/components/asset/AssetSummaryCard';
import AssetNews from '@/components/asset/AssetNews';
import KeyStats from '@/components/asset/KeyStats';
import PositionCard from '@/components/asset/PositionCard';
import WatchlistPanel from '@/components/market/WatchlistPanel';
import SymbolOrdersCard from '@/components/trade/SymbolOrdersCard';

const TYPES: AssetType[] = ['stock', 'crypto', 'currency', 'commodity'];

type DetailTab = 'overview' | 'news' | 'position';

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function AssetPage({ params }: { params: Promise<{ symbol: string }> }) {
  // useSearchParams ve use(params) askıya alınabilir; sınır burada.
  return (
    <Suspense fallback={<PageLoader />}>
      <AssetDetail params={params} />
    </Suspense>
  );
}

function AssetDetail({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: rawSymbol } = use(params);
  const symbol = safeDecode(rawSymbol).trim().toUpperCase();
  const search = useSearchParams();
  const typeParam = search.get('type');
  const type: AssetType = TYPES.includes(typeParam as AssetType) ? (typeParam as AssetType) : 'stock';
  const coinIdParam = search.get('id') || undefined;

  const { user, ready } = useRequireAuth();
  const { holdings, loaded, market } = useLivePortfolio();
  const { openTrade } = useTrade();
  const dc = useDisplayCurrency();
  const [tab, setTab] = useState<DetailTab>('overview');

  if (!ready || !user) return <PageLoader />;

  const live = market.find(type, symbol);
  const holding = holdings.find((h) => h.assetType === type && h.symbol === symbol);

  // Canlı veri yoksa (ör. listeden düşmüş kripto) pozisyonun son değerlemesine düş
  const asset: MarketAsset | undefined =
    live ??
    (holding
      ? {
          key: `${type}:${symbol}`,
          type,
          symbol,
          name: holding.name,
          priceTRY: holding.livePrice,
          priceUSD: null,
          changePercent: holding.dayChangePercent ?? 0,
          image: holding.image,
          coinId: coinIdParam,
        }
      : undefined);

  const crumbs = <Breadcrumb crumbs={[{ label: 'Piyasalar', href: '/markets' }, { label: symbol }]} />;

  if (!asset) {
    if (market.isLoading || !loaded) return <AssetSkeleton top={crumbs} />;
    const failed = !!market.errors[type];
    return (
      <div className="space-y-4 md:space-y-6">
        {crumbs}
        <Card>
          <EmptyState
            icon={<MagnifyingGlassIcon />}
            title={failed ? 'Piyasa verisi alınamadı' : 'Varlık bulunamadı'}
            description={
              failed
                ? 'Veri sağlayıcısına şu an ulaşılamıyor. Birazdan tekrar dene.'
                : `${ASSET_TYPE_LABELS[type]} piyasasında "${symbol}" sembolü bulunamadı.`
            }
            action={
              <LinkButton href="/markets" variant="secondary" size="sm">
                Piyasalara dön
              </LinkButton>
            }
          />
        </Card>
      </div>
    );
  }

  const target = { type, symbol, name: asset.name, image: asset.image };
  const coinId = asset.coinId ?? coinIdParam;
  const usdTry = market.usdTry;
  const buy = () => openTrade(target, 'buy');
  const sell = () => openTrade(target, 'sell');

  return (
    <div className="space-y-4 md:space-y-6">
      {crumbs}

      <AssetHeaderCard asset={asset} stale={!live} canSell={!!holding} onBuy={buy} onSell={sell} />

      {!live && <Alert tone="info">Bu varlık için canlı fiyat şu an alınamıyor; pozisyonunun son değerlemesi gösteriliyor.</Alert>}

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="min-w-0 space-y-4 md:space-y-6">
          <AssetChart
            type={type}
            symbol={symbol}
            coinId={coinId}
            usdTry={usdTry}
            displayCurrency={type === 'currency' && symbol === 'USD' ? 'TRY' : dc.currency}
            title={`${symbol} · ${asset.name}`}
          />

          <Card className="min-w-0">
            <div className="px-5 pt-2 sm:px-6">
              <Tabs
                variant="underline"
                label="Varlık ayrıntıları"
                value={tab}
                onChange={setTab}
                items={[
                  { value: 'overview', label: 'Genel bakış' },
                  { value: 'news', label: 'Haberler' },
                  { value: 'position', label: 'Pozisyonum' },
                ]}
              />
            </div>
            <div className="p-5 sm:p-6" role="tabpanel" aria-label={tab === 'overview' ? 'Genel bakış' : tab === 'news' ? 'Haberler' : 'Pozisyonum'}>
              {tab === 'overview' && (
                <>
                  <h2 className="text-lg font-semibold text-fg">Önemli veriler</h2>
                  <p className="mt-1 text-sm text-muted">{type === 'stock' ? 'Son işlem günü' : 'Son 24 saat'}</p>
                  <KeyStats asset={asset} usdTry={usdTry} currency={dc.currency} fxNote={fxSourceLabel(market.fxSource)} className="mt-4" />
                  <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-surface-2 p-4 text-sm">
                    <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                    <p className="text-muted">
                      Her alım ve satımda <span className="num font-medium text-fg">{formatPercent(COMMISSION_RATE * 100, { sign: false })}</span> komisyon
                      uygulanır. İşlemler TL bazında hesaplanır{dc.currency === 'USD' ? `; tutarlar ${DISPLAY_CURRENCY_NAMES.USD} olarak gösteriliyor` : ''}; veriler gecikmeli
                      olabilir ve yatırım tavsiyesi değildir.
                    </p>
                  </div>
                </>
              )}
              {tab === 'news' && <AssetNews asset={asset} />}
              {tab === 'position' &&
                (!loaded ? (
                  <div className="space-y-3" aria-hidden="true">
                    <Skeleton className="h-8 w-40" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : holding ? (
                  <PositionCard holding={holding} onBuy={buy} onSell={sell} bare />
                ) : (
                  <EmptyState
                    className="py-8"
                    icon={<ShoppingCartIcon />}
                    title="Pozisyonun yok"
                    description={`${symbol} henüz portföyünde değil. Sanal bakiyenle alım yaparak pozisyon açabilirsin.`}
                    action={<Button onClick={buy}>{symbol} al</Button>}
                  />
                ))}
            </div>
          </Card>

          <SymbolOrdersCard type={type} symbol={symbol} livePrice={asset.priceTRY ?? null} />
        </div>

        <aside className="min-w-0 space-y-4 md:space-y-6 xl:sticky xl:top-24" aria-label="Varlık özeti ve izleme listesi">
          <AssetSummaryCard asset={asset} usdTry={usdTry} />
          <WatchlistPanel highlight={{ type, symbol }} compact />
        </aside>
      </div>
    </div>
  );
}

function AssetSkeleton({ top }: { top: React.ReactNode }) {
  return (
    <div className="space-y-4 md:space-y-6" aria-busy="true">
      {top}
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="mt-6 h-12 w-56" />
        <Skeleton className="mt-2 h-5 w-64" />
      </Card>
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="space-y-4 p-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </Card>
        <Card className="space-y-3 p-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-28 w-full" />
        </Card>
      </div>
      <span className="sr-only" role="status">
        Varlık yükleniyor…
      </span>
    </div>
  );
}
