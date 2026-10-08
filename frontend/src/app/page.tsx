'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  ArrowRightIcon,
  BriefcaseIcon,
  ChartBarIcon,
  MagnifyingGlassIcon,
  NewspaperIcon,
  TrophyIcon,
} from '@heroicons/react/20/solid';
import { useAuth } from '@/context/AuthContext';
import Landing from '@/components/landing/Landing';
import OnboardingGuide from '@/components/onboarding/OnboardingGuide';
import { useLivePortfolio, type LiveHolding } from '@/context/PortfolioContext';
import { FEATURED_CURRENCIES } from '@/hooks/useMarketData';
import { leaderboardApi, newsApi } from '@/lib/api';
import { STARTING_BALANCE } from '@/lib/constants';
import { cn, formatPercent, formatRelative, formatTRY, trend } from '@portfoygo/shared/format';
import { ASSET_TYPE_LABELS, type AssetType, type LeaderboardEntry, type NewsItem } from '@/types';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta, Money } from '@portfoygo/shared/ui/Delta';
import { Alert, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { LinkButton } from '@portfoygo/shared/ui/Button';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import Tabs from '@portfoygo/shared/ui/Tabs';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import MarketTable, { assetHref } from '@/components/market/MarketTable';
import PerformanceChart from '@/components/portfolio/PerformanceChart';
import { useWatchlist } from '@/hooks/useWatchlist';
import { StarIcon } from '@heroicons/react/24/outline';
import type { MarketAsset } from '@/types';

type MarketTab = AssetType | 'watchlist';

const MARKET_TABS: { value: AssetType; label: string }[] = [
  { value: 'stock', label: 'Hisse' },
  { value: 'crypto', label: 'Kripto' },
  { value: 'currency', label: 'Döviz' },
  { value: 'commodity', label: 'Emtia' },
];

const ALLOCATION_COLORS: Record<AssetType | 'cash', string> = {
  cash: 'var(--surface-3)',
  stock: 'var(--brand)',
  crypto: 'var(--gold)',
  currency: 'var(--up)',
  commodity: 'var(--muted)',
};

export default function DashboardPage() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  // Oturum yoksa yönlendirme yerine herkese açık tanıtım sayfası
  if (!user) return <Landing />;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted">{greeting()},</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{user.username}</h1>
      </header>

      {!user.email_verified && (
        <Alert tone="info">
          <span className="inline-flex flex-wrap items-center gap-x-2">
            E-posta adresinizi doğrulayın; liderlik tablosunda yer almak için gerekli.
            <Link href="/verify-email" className="font-semibold underline underline-offset-2">Şimdi doğrula</Link>
          </span>
        </Alert>
      )}

      <OnboardingGuide />

      <Overview rank={user.rank} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Markets className="lg:col-span-2" />
        <div className="space-y-6">
          <Positions />
          <Leaders />
        </div>
      </div>

      <News />
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

/* ------------------------------------------------------------------ */

function Overview({ rank }: { rank: number | null }) {
  const { balance, reservedCash, totals, holdings, loaded } = useLivePortfolio();
  const allTimeChange = totals.netWorth - STARTING_BALANCE;
  const allTimePct = (allTimeChange / STARTING_BALANCE) * 100;

  const allocation = useMemo(() => {
    const buckets: Record<string, number> = { cash: balance + reservedCash };
    for (const h of holdings) buckets[h.assetType] = (buckets[h.assetType] ?? 0) + h.liveValue;
    const total = Object.values(buckets).reduce((s, v) => s + v, 0) || 1;
    return (Object.entries(buckets) as [AssetType | 'cash', number][])
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ key: k, value: v, pct: (v / total) * 100 }))
      .sort((a, b) => b.value - a.value);
  }, [balance, reservedCash, holdings]);

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.2fr_1fr] lg:gap-10">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-subtle">Toplam varlık</p>
          {loaded ? (
            <>
              <p className="num mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">{formatTRY(totals.netWorth)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <Delta value={allTimePct} />
                <Money value={allTimeChange} signed className="font-medium" />
                <span className="text-subtle">başlangıçtan bu yana</span>
              </div>
            </>
          ) : (
            <>
              <Skeleton className="mt-3 h-12 w-64" />
              <Skeleton className="mt-3 h-5 w-48" />
            </>
          )}

          <div className="mt-6">
            <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Varlık dağılımı">
              {allocation.map((a) => (
                <span key={a.key} style={{ width: `${a.pct}%`, background: ALLOCATION_COLORS[a.key] }} className="h-full first:rounded-l-full last:rounded-r-full" />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
              {allocation.map((a) => (
                <li key={a.key} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: ALLOCATION_COLORS[a.key] }} aria-hidden="true" />
                  {a.key === 'cash' ? 'Nakit' : ASSET_TYPE_LABELS[a.key]}
                  <span className="num text-subtle">%{a.pct.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
          <Metric label="Kullanılabilir nakit" value={formatTRY(balance)} />
          <Metric label="Yatırım değeri" value={formatTRY(totals.value)} />
          <Metric
            label="Açık pozisyon K/Z"
            value={<span className={cn(trend(totals.pl) === 'up' && 'text-up', trend(totals.pl) === 'down' && 'text-down')}>{formatTRY(totals.pl, { sign: true })}</span>}
            sub={holdings.length ? formatPercent(totals.plPercent) : undefined}
          />
          <Metric label="Genel sıralama" value={rank ? `#${rank}` : '—'} sub={rank ? undefined : 'Doğrulama sonrası'} />
        </dl>
      </div>
      <div className="border-t border-line px-5 py-4 sm:px-6">
        <PerformanceChart compact />
      </div>
    </Card>
  );
}

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-surface p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-1.5 truncate text-lg font-semibold tracking-tight">{value}</dd>
      {sub && <dd className="num mt-0.5 text-xs text-subtle">{sub}</dd>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Markets({ className }: { className?: string }) {
  const { market } = useLivePortfolio();
  const watch = useWatchlist();
  // Kullanıcı sekme seçene kadar: izleme listesi doluysa onu, değilse hisseleri göster
  const [picked, setPicked] = useState<MarketTab | null>(null);
  const tab: MarketTab = picked ?? (watch.items.length > 0 ? 'watchlist' : 'stock');
  const [query, setQuery] = useState('');

  const watchAssets = useMemo<MarketAsset[]>(() => {
    const out: MarketAsset[] = [];
    for (const i of watch.items) {
      const live = market.find(i.asset_type, i.symbol);
      if (live) out.push(live);
      // Canlı listede olmayan (ör. ilk 25 dışına düşen kripto) varlık: fiyatsız satır, yıldızla çıkarılabilir
      else if (!market.isLoading)
        out.push({ key: `${i.asset_type}:${i.symbol}`, type: i.asset_type, symbol: i.symbol, name: ASSET_TYPE_LABELS[i.asset_type], priceTRY: null, priceUSD: null, changePercent: 0 });
    }
    return out;
  }, [watch.items, market]);

  const assets = useMemo(() => {
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

  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight">Piyasalar</h2>
          {market.usdTry && (
            <span className="num rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">USD/TRY {market.usdTry.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
          )}
        </div>
        <label className="relative block sm:w-56">
          <span className="sr-only">Varlık ara</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sembol veya isim ara"
            className="h-9 w-full rounded-lg border border-line bg-surface-2 pl-9 pr-3 text-sm placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </label>
      </div>
      <div className="px-5 pt-3">
        <Tabs
          variant="underline"
          label="Piyasa türü"
          value={tab}
          onChange={setPicked}
          items={[
            { value: 'watchlist' as const, label: 'İzleme listesi', count: watch.items.length },
            ...MARKET_TABS.map((t) => ({ ...t, count: market.byType[t.value].length })),
          ]}
        />
      </div>
      <div className="lg:max-h-[560px] lg:overflow-y-auto">
        {tab === 'watchlist' && watch.items.length === 0 && !watch.isLoading ? (
          <EmptyState
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
        ) : (
          <MarketTable
            assets={assets}
            loading={tab === 'watchlist' ? watch.isLoading || market.isLoading : market.isLoading}
            error={tab === 'watchlist' ? watch.error : market.errors[tab]}
            query={query}
            showVolume={tab === 'crypto'}
          />
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function Positions() {
  const { holdings, loaded } = useLivePortfolio();
  const top = useMemo(() => [...holdings].sort((a, b) => b.liveValue - a.liveValue).slice(0, 5), [holdings]);

  return (
    <Card>
      <CardHeader
        icon={<BriefcaseIcon />}
        title="Pozisyonların"
        description={loaded ? `${holdings.length} açık pozisyon` : 'Yükleniyor'}
        action={holdings.length > 0 && <LinkButton href="/portfolio" variant="ghost" size="sm">Tümü <ArrowRightIcon className="h-3.5 w-3.5" /></LinkButton>}
      />
      {!loaded ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : top.length === 0 ? (
        <EmptyState icon={<ChartBarIcon />} title="Henüz pozisyonun yok" description="Piyasalardan bir varlık seçip ilk alımını yap." />
      ) : (
        <ul className="divide-y divide-line">
          {top.map((h) => <PositionRow key={h.id} h={h} />)}
        </ul>
      )}
    </Card>
  );
}

function PositionRow({ h }: { h: LiveHolding }) {
  return (
    <li>
      <Link href={assetHref({ type: h.assetType, symbol: h.symbol })} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60">
        <AssetAvatar symbol={h.symbol} type={h.assetType} image={h.image} size={32} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[13px] font-semibold">{h.symbol}</p>
          <p className="truncate text-xs text-muted">{h.name}</p>
        </div>
        <div className="text-right">
          <p className="num text-sm font-medium">{formatTRY(h.liveValue)}</p>
          <Delta value={h.livePLPercent} variant="text" className="text-xs" />
        </div>
      </Link>
    </li>
  );
}

/* ------------------------------------------------------------------ */

const MEDALS = ['bg-gold text-black', 'bg-silver text-black', 'bg-bronze text-black'];

function Leaders() {
  const { data, error, isLoading } = useSWR('leaders:top3', () => leaderboardApi.list(3, 'alltime'), { refreshInterval: 60_000 });
  const leaders: LeaderboardEntry[] = data?.leaderboard ?? [];

  return (
    <Card>
      <CardHeader
        icon={<TrophyIcon />}
        title="Liderler"
        description="Tüm zamanlar · ilk 3"
        action={<LinkButton href="/leaderboard" variant="ghost" size="sm">Tablo <ArrowRightIcon className="h-3.5 w-3.5" /></LinkButton>}
      />
      {isLoading ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : leaders.length === 0 ? (
        <EmptyState title={error ? 'Liderlik tablosu yüklenemedi' : 'Henüz sıralama yok'} />
      ) : (
        <ol className="divide-y divide-line">
          {leaders.map((l, i) => (
            <li key={l.username} className="flex items-center gap-3 px-5 py-3">
              <span className={cn('num flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold', MEDALS[i] ?? 'bg-surface-2')}>{l.rank}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.username}</span>
              <Delta value={Number(l.profit_loss_percent)} variant="text" className="text-sm" />
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function News() {
  const { data, error, isLoading } = useSWR('news:latest', () => newsApi.list(5), { refreshInterval: 300_000 });
  const items: NewsItem[] = data?.data ?? [];

  return (
    <Card>
      <CardHeader
        icon={<NewspaperIcon />}
        title="Piyasa haberleri"
        description="Ekonomi ve finans gündemi"
        action={<LinkButton href="/news" variant="ghost" size="sm">Tüm haberler <ArrowRightIcon className="h-3.5 w-3.5" /></LinkButton>}
      />
      {isLoading ? (
        <div className="grid gap-4 p-5 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title={error ? 'Haberler yüklenemedi' : 'Şu an haber yok'} />
      ) : (
        <div className="grid md:grid-cols-[1.3fr_1fr]">
          <a href={items[0].link} target="_blank" rel="noopener noreferrer" className="group block border-b border-line p-5 md:border-b-0 md:border-r">
            <p className="text-xs text-subtle">{[items[0].categories?.[0], formatRelative(items[0].pubDate)].filter(Boolean).join(' · ')}</p>
            <h3 className="mt-2 text-lg font-semibold leading-snug tracking-tight group-hover:text-brand">{items[0].title}</h3>
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{items[0].description}</p>
          </a>
          <ul className="divide-y divide-line">
            {items.slice(1, 5).map((n) => (
              <li key={n.link}>
                <a href={n.link} target="_blank" rel="noopener noreferrer" className="group block px-5 py-3.5">
                  <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-brand">{n.title}</p>
                  <p className="mt-1 text-xs text-subtle">{formatRelative(n.pubDate)}</p>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
