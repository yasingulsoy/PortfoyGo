'use client';

import { Suspense, use, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeftIcon, ChartBarIcon, InformationCircleIcon, MagnifyingGlassIcon, ShoppingCartIcon } from '@heroicons/react/20/solid';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useLivePortfolio } from '@/context/PortfolioContext';
import { useTrade } from '@/components/trade/TradeProvider';
import { COMMISSION_RATE } from '@/lib/constants';
import { formatPercent, formatTRY, formatUSD } from '@/lib/format';
import { ASSET_TYPE_LABELS, type AssetType, type MarketAsset } from '@/types';
import PageHeader from '@/components/ui/PageHeader';
import Button, { LinkButton } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Delta } from '@/components/ui/Delta';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { PageLoader } from '@/components/ui/Spinner';
import Tabs from '@/components/ui/Tabs';
import AssetAvatar from '@/components/ui/AssetAvatar';
import PriceTick from '@/components/market/PriceTick';
import WatchStar from '@/components/market/WatchStar';
import PriceChart from '@/components/PriceChart';
import KeyStats from '@/components/asset/KeyStats';
import PositionCard from '@/components/asset/PositionCard';
import SymbolOrdersCard from '@/components/trade/SymbolOrdersCard';

const TYPES: AssetType[] = ['stock', 'crypto', 'currency', 'commodity'];

type Range = '1' | '7' | '30' | '90' | '365';
const RANGES: { value: Range; label: string }[] = [
  { value: '1', label: '1G' },
  { value: '7', label: '1H' },
  { value: '30', label: '1A' },
  { value: '90', label: '3A' },
  { value: '365', label: '1Y' },
];

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
  const [range, setRange] = useState<Range>('30');

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

  const backLink = (
    <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg">
      <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" /> Piyasalar
    </Link>
  );

  if (!asset) {
    if (market.isLoading || !loaded) return <AssetSkeleton back={backLink} />;
    const failed = !!market.errors[type];
    return (
      <div className="space-y-6">
        {backLink}
        <Card>
          <EmptyState
            icon={<MagnifyingGlassIcon />}
            title={failed ? 'Piyasa verisi alınamadı' : 'Varlık bulunamadı'}
            description={
              failed
                ? 'Veri sağlayıcısına şu an ulaşılamıyor. Birazdan tekrar dene.'
                : `${ASSET_TYPE_LABELS[type]} piyasasında "${symbol}" sembolü bulunamadı.`
            }
            action={<LinkButton href="/" variant="secondary" size="sm">Piyasalara dön</LinkButton>}
          />
        </Card>
      </div>
    );
  }

  const target = { type, symbol, name: asset.name, image: asset.image };
  const chartable = type === 'stock' || type === 'crypto';
  const coinId = asset.coinId ?? coinIdParam;
  const usdTry = market.usdTry;

  return (
    <div className="space-y-6">
      {backLink}

      <PageHeader
        eyebrow={ASSET_TYPE_LABELS[type]}
        title={
          <span className="flex min-w-0 items-center gap-3">
            <AssetAvatar symbol={symbol} type={type} image={asset.image} size={40} />
            <span className="font-mono">{symbol}</span>
            <WatchStar type={type} symbol={symbol} size="md" />
          </span>
        }
        description={asset.name !== symbol ? asset.name : undefined}
        actions={
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
            <Button variant="buy" onClick={() => openTrade(target, 'buy')} className="sm:min-w-24">
              Al
            </Button>
            <Button
              variant="sell"
              onClick={() => openTrade(target, 'sell')}
              disabled={!holding}
              title={holding ? undefined : 'Satmak için önce bu varlıktan almalısın'}
              className="sm:min-w-24"
            >
              Sat
            </Button>
          </div>
        }
      />

      {!live && <Alert tone="info">Bu varlık için canlı fiyat şu an alınamıyor; pozisyonunun son değerlemesi gösteriliyor.</Alert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-subtle">Güncel fiyat</p>
                <p className="mt-2 truncate text-3xl font-semibold tracking-tight sm:text-4xl">
                  <PriceTick value={asset.priceTRY ?? asset.priceUSD}>
                    {asset.priceTRY != null ? formatTRY(asset.priceTRY, { precise: true }) : asset.priceUSD != null ? formatUSD(asset.priceUSD, { precise: true }) : '—'}
                  </PriceTick>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <Delta value={asset.changePercent} />
                  <span className="text-subtle">{type === 'stock' ? 'günlük' : 'son 24 saat'}</span>
                  {asset.priceUSD != null && asset.priceTRY != null && (
                    <span className="num text-muted">· {formatUSD(asset.priceUSD, { precise: true })}</span>
                  )}
                </div>
              </div>
              {chartable && <Tabs label="Grafik aralığı" items={RANGES} value={range} onChange={setRange} className="self-start sm:self-auto" />}
            </div>

            {chartable ? (
              <div className="px-2 pb-4 sm:px-4">
                <PriceChart type={type} symbol={symbol} coinId={coinId} days={Number(range)} multiplier={usdTry} height={300} />
                <p className="px-3 pt-2 text-xs text-subtle">
                  {usdTry
                    ? 'Geçmiş fiyatlar güncel USD/TRY kuruyla TL’ye çevrilerek gösterilir.'
                    : 'Kur bilgisi alınamadığı için grafik USD cinsindendir.'}
                </p>
              </div>
            ) : (
              <div className="border-t border-line p-5 sm:px-6">
                <div className="flex items-start gap-3 rounded-xl bg-surface-2 p-4">
                  <ChartBarIcon className="mt-0.5 h-5 w-5 shrink-0 text-subtle" aria-hidden="true" />
                  <div className="text-sm">
                    <p className="font-medium">Grafik bu varlık türü için mevcut değil</p>
                    <p className="mt-1 text-muted">
                      {ASSET_TYPE_LABELS[type]} fiyatları anlık kur olarak alınıyor; veri sağlayıcımız bu varlıklar için geçmiş fiyat serisi sunmuyor.
                      Güncel fiyat ve günlük değişim yukarıda gösteriliyor.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <KeyStats asset={asset} usdTry={usdTry} />
        </div>

        <aside className="space-y-6">
          {!loaded ? (
            <Card className="space-y-3 p-5" aria-hidden="true">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-24 w-full" />
            </Card>
          ) : holding ? (
            <PositionCard holding={holding} onBuy={() => openTrade(target, 'buy')} onSell={() => openTrade(target, 'sell')} />
          ) : (
            <Card>
              <CardHeader icon={<ShoppingCartIcon />} title="Pozisyonun yok" description={`${symbol} henüz portföyünde değil`} />
              <CardBody className="space-y-4">
                <p className="text-sm text-muted">Sanal bakiyenle bu varlıktan alım yaparak pozisyon açabilirsin.</p>
                <Button variant="buy" className="w-full" onClick={() => openTrade(target, 'buy')}>
                  {symbol} al
                </Button>
              </CardBody>
            </Card>
          )}

          <SymbolOrdersCard type={type} symbol={symbol} livePrice={asset.priceTRY ?? null} />

          <Card>
            <CardBody className="flex items-start gap-3 text-sm">
              <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
              <p className="text-muted">
                Her alım ve satımda <span className="num font-medium text-fg">{formatPercent(COMMISSION_RATE * 100, { sign: false })}</span> komisyon uygulanır.
                Fiyatlar TL bazında hesaplanır.
              </p>
            </CardBody>
          </Card>

          <p className="flex flex-wrap items-center gap-2 text-xs text-subtle">
            <Badge>{ASSET_TYPE_LABELS[type]}</Badge>
            <span>Veriler gecikmeli olabilir; yatırım tavsiyesi değildir.</span>
          </p>
        </aside>
      </div>
    </div>
  );
}

function AssetSkeleton({ back }: { back: ReactNode }) {
  return (
    <div className="space-y-6" aria-busy="true">
      {back}
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="space-y-4 p-6">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </Card>
        <Card className="space-y-3 p-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-24 w-full" />
        </Card>
      </div>
      <span className="sr-only" role="status">Varlık yükleniyor…</span>
    </div>
  );
}
