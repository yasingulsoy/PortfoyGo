'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ArrowPathIcon, CircleStackIcon } from '@heroicons/react/20/solid';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import Button from '@portfoygo/shared/ui/Button';
import { adminApi, swrFetcher } from '@/lib/api';
import { formatNumber, formatRelative } from '@portfoygo/shared/format';
import { num } from './model';

type Target = 'stocks' | 'currencies';
type Result = { tone: 'success' | 'error'; message: string };

const ACTIONS: { target: Target; label: string; hint: string; run: () => Promise<any> }[] = [
  { target: 'stocks', label: 'Hisse ve kripto önbelleğini yenile', hint: 'Finnhub / CoinGecko kotası harcar.', run: () => adminApi.refreshStocks() },
  { target: 'currencies', label: 'Döviz kurlarını yenile', hint: 'Kur sağlayıcısının kotası harcar.', run: () => adminApi.refreshCurrencies() },
];

const CACHE_STATUS_KEY = '/stocks/cache-status';

export default function CacheActions() {
  const [pending, setPending] = useState<Target | null>(null);
  const [results, setResults] = useState<Partial<Record<Target, Result>>>({});
  const status = useSWR<any>(CACHE_STATUS_KEY, swrFetcher, { refreshInterval: 60_000, revalidateOnFocus: false });

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

  const s = status.data;
  const newest = s?.newestCache ?? s?.newest_cache;

  return (
    <Card>
      <CardHeader
        icon={<CircleStackIcon />}
        title="Piyasa önbelleği"
        description={
          s
            ? `${formatNumber(num(s.currentStocks ?? s.stocks), 0)} hisse · ${formatNumber(num(s.cryptos), 0)} kripto${newest ? ` · ${formatRelative(newest)}` : ''}`
            : status.error
              ? 'Önbellek durumu alınamadı'
              : 'Durum yükleniyor'
        }
      />
      <ul className="divide-y divide-line">
        {ACTIONS.map((a) => {
          const result = results[a.target];
          return (
            <li key={a.target} className="space-y-3 px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.label}</p>
                  <p className="text-xs text-muted">{a.hint}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={pending === a.target}
                  disabled={pending !== null && pending !== a.target}
                  onClick={() => void run(a)}
                  icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />}
                  className="self-start sm:self-auto"
                >
                  Önbelleği yenile
                </Button>
              </div>
              {result && <Alert tone={result.tone}>{result.message}</Alert>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
