'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowTrendingDownIcon, ArrowTrendingUpIcon, SignalSlashIcon } from '@heroicons/react/20/solid';
import { useMarket } from '@/hooks/useMarketData';
import { assetHref } from '@/components/market/MarketTable';
import AssetAvatar from '@/components/ui/AssetAvatar';
import { Card } from '@/components/ui/Card';
import { Delta } from '@/components/ui/Delta';
import { Skeleton } from '@/components/ui/Feedback';
import { cn, formatTRY } from '@/lib/format';
import { ASSET_TYPE_LABELS, type MarketAsset } from '@/types';
import SectionHeading from './SectionHeading';

const MOVERS = 4;
const TICKER = 16;

/** Hisse ve kripto piyasalarındaki günün en hareketli varlıkları (herkese açık uç noktalar). */
export default function MarketPulse() {
  const market = useMarket();
  const { stock, crypto } = market.byType;

  const { ticker, gainers, losers } = useMemo(() => {
    const pool = [...stock, ...crypto].filter((a) => a.priceTRY != null && Number.isFinite(a.changePercent));
    const byMove = [...pool].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
    const sorted = [...pool].sort((a, b) => b.changePercent - a.changePercent);
    return {
      ticker: byMove.slice(0, TICKER),
      gainers: sorted.filter((a) => a.changePercent > 0).slice(0, MOVERS),
      losers: sorted.filter((a) => a.changePercent < 0).reverse().slice(0, MOVERS),
    };
  }, [stock, crypto]);

  // SWR hata sonrası yeniden denerken isLoading tekrar true olur; hata varken iskelet göstermeyiz
  const failed = !!market.errors.stock && !!market.errors.crypto;
  const loading = !failed && market.isLoading && ticker.length === 0;
  const unavailable = !loading && ticker.length === 0;

  return (
    <section aria-labelledby="landing-pulse-title" className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading
          id="landing-pulse-title"
          eyebrow="Piyasa nabzı"
          title="Bugün piyasada neler oluyor?"
          description="Fiyatlar canlı piyasadan gelir ve birkaç saniyede bir yenilenir. Oyundaki her işlem bu fiyatlarla gerçekleşir."
        />
        {!unavailable && (
          <p className="inline-flex shrink-0 items-center gap-2 text-xs text-subtle">
            <span className="h-1.5 w-1.5 rounded-full bg-up" aria-hidden="true" />
            15 sn&apos;de bir güncellenir
          </p>
        )}
      </div>

      {unavailable ? (
        <Unavailable />
      ) : (
        <>
          <Ticker assets={ticker} loading={loading} />
          <div className="grid gap-4 md:grid-cols-2">
            <MoverList title="En çok yükselenler" icon={<ArrowTrendingUpIcon />} tone="up" assets={gainers} loading={loading} />
            <MoverList title="En çok düşenler" icon={<ArrowTrendingDownIcon />} tone="down" assets={losers} loading={loading} />
          </div>
        </>
      )}
    </section>
  );
}

function Ticker({ assets, loading }: { assets: MarketAsset[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex gap-3 overflow-hidden rounded-2xl border border-line bg-surface p-3" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-44 shrink-0 rounded-xl" />
        ))}
      </div>
    );
  }
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-line bg-surface py-3 motion-reduce:overflow-x-auto">
      <style href="pg-landing-marquee" precedence="default">
        {'@keyframes pg-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}'}
      </style>
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-linear-to-r from-surface to-transparent" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-linear-to-l from-surface to-transparent" aria-hidden="true" />
      <ul
        aria-label="Canlı fiyat bandı"
        className="flex w-max gap-2 px-3 motion-safe:animate-[pg-marquee_60s_linear_infinite] motion-safe:group-hover:[animation-play-state:paused]"
      >
        {/* Kesintisiz kayma için liste iki kez çizilir; ikinci kopya ekran okuyuculardan gizlenir */}
        {[0, 1].map((copy) =>
          assets.map((a) => (
            <li key={`${copy}:${a.key}`} aria-hidden={copy === 1 ? true : undefined} className={cn(copy === 1 && 'motion-reduce:hidden')}>
              <Link
                href={assetHref(a)}
                tabIndex={copy === 1 ? -1 : undefined}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors hover:bg-surface-2"
              >
                <AssetAvatar symbol={a.symbol} type={a.type} image={a.image} size={22} />
                <span className="font-mono text-[13px] font-semibold text-fg">{a.symbol}</span>
                <span className="num text-[13px] text-muted">{formatTRY(a.priceTRY, { precise: true })}</span>
                <Delta value={a.changePercent} variant="text" className="text-xs" />
              </Link>
            </li>
          )),
        )}
      </ul>
    </div>
  );
}

function MoverList({ title, icon, tone, assets, loading }: { title: string; icon: React.ReactNode; tone: 'up' | 'down'; assets: MarketAsset[]; loading: boolean }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg [&>svg]:h-4 [&>svg]:w-4', tone === 'up' ? 'bg-up-soft text-up' : 'bg-down-soft text-down')} aria-hidden="true">
          {icon}
        </span>
        <h3 className="text-sm font-semibold tracking-tight text-fg">{title}</h3>
        <span className="ml-auto text-[11px] text-subtle">24 saat</span>
      </div>
      {loading ? (
        <div className="space-y-3 p-5" aria-hidden="true">
          {Array.from({ length: MOVERS }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      ) : assets.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">{tone === 'up' ? 'Şu an yükselen varlık yok.' : 'Şu an düşen varlık yok.'}</p>
      ) : (
        <ol className="divide-y divide-line">
          {assets.map((a) => (
            <li key={a.key}>
              <Link href={assetHref(a)} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60">
                <AssetAvatar symbol={a.symbol} type={a.type} image={a.image} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold text-fg group-hover:text-brand">{a.symbol}</span>
                    <span className="rounded bg-surface-2 px-1 text-[10px] font-medium text-subtle">{ASSET_TYPE_LABELS[a.type]}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">{a.name}</span>
                </span>
                <span className="text-right">
                  <span className="num block text-sm font-medium text-fg">{formatTRY(a.priceTRY, { precise: true })}</span>
                  <Delta value={a.changePercent} className="mt-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** Veri sağlayıcısına ulaşılamadığında: sakin, bilgilendirici bir boş durum. */
function Unavailable() {
  return (
    <Card className="relative overflow-hidden">
      <svg aria-hidden="true" viewBox="0 0 600 120" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full text-brand opacity-[0.12]">
        <path d="M0 90 C 60 80, 90 40, 150 55 S 240 100, 300 70 S 400 20, 460 40 S 560 60, 600 30" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="6 8" />
      </svg>
      <div className="relative flex flex-col items-center px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-subtle">
          <SignalSlashIcon className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-4 text-sm font-semibold text-fg">Canlı veriler şu an alınamıyor</p>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">
          Piyasa veri sağlayıcısına ulaşılamadı; sayfa kendiliğinden yeniden deneyecek. Bu arada aşağıdan oyunun nasıl işlediğine göz atabilirsin.
        </p>
      </div>
    </Card>
  );
}
