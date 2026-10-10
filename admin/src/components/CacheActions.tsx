'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ArrowPathIcon, InformationCircleIcon, ChartBarIcon, CurrencyDollarIcon } from '@heroicons/react/20/solid';
import { ArrowTrendingUpIcon, ClockIcon, CubeTransparentIcon, CircleStackIcon } from '@heroicons/react/24/outline';
import { Card } from '@portfoygo/shared/ui/Card';
import { Alert, Badge } from '@portfoygo/shared/ui/Feedback';
import Button from '@portfoygo/shared/ui/Button';
import { adminApi, swrFetcher } from '@/lib/api';
import { formatDateTime, formatNumber, formatRelative } from '@portfoygo/shared/format';
import { num } from './model';
import { MetricCard, TableCardHeader } from './ui';

type Target = 'stocks' | 'currencies';
type Result = { tone: 'success' | 'error'; message: string };

const ACTIONS: { target: Target; label: string; hint: string; icon: typeof ChartBarIcon; run: () => Promise<any> }[] = [
  {
    target: 'stocks',
    label: 'Hisse ve kripto önbelleği',
    hint: 'Takip edilen hisse ve kripto fiyatlarını sağlayıcılardan yeniden çeker. Finnhub / CoinGecko kotası harcar.',
    icon: ChartBarIcon,
    run: () => adminApi.refreshStocks(),
  },
  {
    target: 'currencies',
    label: 'Döviz kurları',
    hint: 'Döviz ve emtia fiyatlarında kullanılan kurları yeniler. Kur sağlayıcısının kotası harcar.',
    icon: CurrencyDollarIcon,
    run: () => adminApi.refreshCurrencies(),
  },
];

export const CACHE_STATUS_KEY = '/stocks/cache-status';

export function useCacheStatus() {
  return useSWR<any>(CACHE_STATUS_KEY, swrFetcher, { refreshInterval: 60_000, revalidateOnFocus: false });
}

/** Önbellek durum kartları: hisse / kripto sayısı, en yeni ve en eski kayıt. */
export function CacheStatusCards() {
  const { data: s, error, isLoading } = useCacheStatus();
  const loading = isLoading && !s;
  const newest = s?.newestCache ?? s?.newest_cache;
  const oldest = s?.oldestCache ?? s?.oldest_cache;

  if (error && !s) return <Alert tone="error">Önbellek durumu alınamadı: {error instanceof Error ? error.message : 'beklenmeyen hata'}.</Alert>;

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4" aria-label="Önbellek durumu">
      <li>
        <MetricCard icon={ArrowTrendingUpIcon} label="Önbellekteki hisse" value={formatNumber(num(s?.currentStocks ?? s?.stocks), 0)} loading={loading} />
      </li>
      <li>
        <MetricCard icon={CubeTransparentIcon} label="Önbellekteki kripto" value={formatNumber(num(s?.cryptos), 0)} loading={loading} />
      </li>
      <li>
        <MetricCard
          icon={ClockIcon}
          label="En yeni kayıt"
          value={newest ? formatRelative(newest) : '—'}
          loading={loading}
          badge={newest ? <span className="text-xs text-subtle">{formatDateTime(newest)}</span> : undefined}
        />
      </li>
      <li>
        <MetricCard
          icon={CircleStackIcon}
          label="En eski kayıt"
          value={oldest ? formatRelative(oldest) : '—'}
          loading={loading}
          badge={!loading && !newest ? <Badge tone="gold">Önbellek boş</Badge> : undefined}
        />
      </li>
    </ul>
  );
}

/** Önbellek yenileme eylemleri (kota harcar). */
export default function CacheActions() {
  const [pending, setPending] = useState<Target | null>(null);
  const [results, setResults] = useState<Partial<Record<Target, Result>>>({});
  const status = useCacheStatus();

  const run = async (a: (typeof ACTIONS)[number]) => {
    setPending(a.target);
    setResults((r) => ({ ...r, [a.target]: undefined }));
    try {
      const res = await a.run();
      const ok = res?.success !== false;
      setResults((r) => ({
        ...r,
        [a.target]: { tone: ok ? 'success' : 'error', message: res?.message || (ok ? 'Önbellek yenilendi.' : 'Yenileme başarısız.') },
      }));
      if (a.target === 'stocks') void status.mutate();
    } catch (err) {
      setResults((r) => ({ ...r, [a.target]: { tone: 'error', message: err instanceof Error ? err.message : 'Yenileme başarısız.' } }));
    } finally {
      setPending(null);
    }
  };

  return (
    <Card className="overflow-hidden">
      <TableCardHeader
        title="Yenileme işlemleri"
        description="Önbellek normalde arka planda kendiliğinden yenilenir; yalnızca veri eskidiğinde elle yenile."
      />
      <ul className="divide-y divide-line border-t border-line">
        {ACTIONS.map((a) => {
          const result = results[a.target];
          const Icon = a.icon;
          return (
            <li key={a.target} className="space-y-3 px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand" aria-hidden="true">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">{a.label}</p>
                    <p className="mt-0.5 text-sm text-muted">{a.hint}</p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  loading={pending === a.target}
                  disabled={pending !== null && pending !== a.target}
                  onClick={() => void run(a)}
                  icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />}
                  className="shrink-0 self-start sm:self-auto"
                >
                  Yenile
                </Button>
              </div>
              {result && <Alert tone={result.tone}>{result.message}</Alert>}
            </li>
          );
        })}
      </ul>
      <p className="flex items-start gap-2 border-t border-line bg-surface-2 px-5 py-3 text-xs text-muted sm:px-6">
        <InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
        Sağlayıcıların ücretsiz kotaları sınırlıdır; art arda yenileme kota aşımına ve geçici veri kesintisine yol açabilir.
      </p>
    </Card>
  );
}
