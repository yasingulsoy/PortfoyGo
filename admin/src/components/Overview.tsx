'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import useSWR, { useSWRConfig } from 'swr';
import { ArrowsRightLeftIcon, BanknotesIcon, CheckBadgeIcon, ClockIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { ArrowPathIcon, ChartBarIcon, ChevronRightIcon, CircleStackIcon, ExclamationTriangleIcon, ServerStackIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Button from '@portfoygo/shared/ui/Button';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { cn, formatCompact, formatDate, formatNumber, formatTRY } from '@portfoygo/shared/format';
import { adminKeys, swrFetcher } from '@/lib/api';
import type { Health, Metrics, MetricsDay } from '@/lib/types';
import { formatUptime, isEndpointMissing } from '@/lib/labels';
import TimeSeriesChart, { type SeriesPoint } from './charts/TimeSeriesChart';
import { ADMIN_STATS_KEY, useAdminStats } from './AdminStats';
import { num } from './model';
import { MetricCard } from './ui';
import { HealthPill, STALE_SOURCES } from './system/shared';

const METRICS_KEY = adminKeys.metrics(30);

export function useMetrics() {
  return useSWR<Metrics>(METRICS_KEY, swrFetcher, { refreshInterval: 5 * 60_000, revalidateOnFocus: false });
}

export function useHealth(refreshInterval = 60_000) {
  return useSWR<Health>(adminKeys.health, swrFetcher, { refreshInterval, revalidateOnFocus: false });
}

/** Dört metrik kartı: kullanıcı, doğrulama oranı, bekleyen emir, 30 günlük hacim. */
export function OverviewMetrics() {
  const metrics = useMetrics();
  // Metrik uç noktası yoksa kullanıcı sayıları eski /admin/stats yanıtından okunur
  const stats = useAdminStats();
  const t = metrics.data?.totals;
  const s = stats.data?.stats ?? stats.data?.data;

  const users = t ? num(t.users) : s ? num(s.totalUsers ?? s.total_users) : null;
  const verified = t ? num(t.verified_users) : s ? num(s.activeUsers ?? s.active_users) : null;
  const ratio = users && verified != null ? (verified / users) * 100 : null;
  const volume30 = metrics.data ? metrics.data.days.reduce((acc, d) => acc + num(d.volume_try), 0) : null;
  const tx30 = metrics.data ? metrics.data.days.reduce((acc, d) => acc + num(d.transactions), 0) : null;

  const loadingUsers = users == null && (metrics.isLoading || stats.isLoading);
  const loadingMetrics = !metrics.data && metrics.isLoading;
  const metricsMissing = !metrics.data && !!metrics.error;

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4" aria-label="Genel istatistikler">
      <li>
        <MetricCard
          icon={UserGroupIcon}
          label="Toplam kullanıcı"
          value={users == null ? '—' : formatNumber(users, 0)}
          loading={loadingUsers}
          hint={t ? `${formatNumber(num(t.admins), 0)} yönetici · ${formatNumber(num(t.banned_users), 0)} yasaklı` : undefined}
        />
      </li>
      <li>
        <MetricCard
          icon={CheckBadgeIcon}
          label="Doğrulanmış hesap"
          value={verified == null ? '—' : formatNumber(verified, 0)}
          loading={loadingUsers}
          badge={ratio != null ? <Badge tone={ratio >= 50 ? 'up' : 'gold'}>%{formatNumber(ratio, 0)}</Badge> : undefined}
        />
      </li>
      <li>
        <MetricCard
          icon={ClockIcon}
          label="Bekleyen emir"
          value={t ? formatNumber(num(t.active_orders), 0) : '—'}
          loading={loadingMetrics}
          hint={t ? `${formatNumber(num(t.open_positions), 0)} açık pozisyon` : metricsMissing ? 'Metrikler alınamadı' : undefined}
        />
      </li>
      <li>
        <MetricCard
          icon={BanknotesIcon}
          label="30 günlük hacim"
          value={volume30 == null ? '—' : formatTRY(volume30)}
          loading={loadingMetrics}
          hint={tx30 != null ? `${formatNumber(tx30, 0)} işlem` : metricsMissing ? 'Metrikler alınamadı' : undefined}
        />
      </li>
    </ul>
  );
}

type SeriesKey = 'signups' | 'active_users' | 'transactions' | 'volume_try';

const SERIES: { value: SeriesKey; label: string; kind: 'histogram' | 'area'; unit: string; money?: boolean }[] = [
  { value: 'signups', label: 'Kayıtlar', kind: 'histogram', unit: 'yeni kayıt' },
  { value: 'active_users', label: 'Aktif kullanıcı', kind: 'area', unit: 'aktif kullanıcı' },
  { value: 'transactions', label: 'İşlem', kind: 'histogram', unit: 'işlem' },
  { value: 'volume_try', label: 'Hacim', kind: 'area', unit: 'işlem hacmi', money: true },
];

const EMPTY_DAYS: MetricsDay[] = [];

/** "Son 30 gün" grafik kartı: segment anahtarıyla seri seçimi, imleçle gün değeri. */
export function ActivityChartCard() {
  const { data, error, isLoading, mutate } = useMetrics();
  const [key, setKey] = useState<SeriesKey>('signups');
  const [hover, setHover] = useState<SeriesPoint | null>(null);
  const meta = SERIES.find((s) => s.value === key)!;
  const days = data?.days ?? EMPTY_DAYS;

  const points = useMemo<SeriesPoint[]>(() => days.map((d) => ({ time: String(d.date).slice(0, 10), value: num(d[key]) })), [days, key]);
  const fmt = (n: number) => (meta.money ? formatTRY(n) : formatNumber(n, 0));
  const axisFmt = (n: number) => (meta.money ? `₺${formatCompact(n)}` : formatNumber(n, 0));

  // "Aktif kullanıcı" günlük tekil sayıdır; toplamı anlamsızdır → ortalama gösterilir
  const total = points.reduce((a, p) => a + p.value, 0);
  const summaryValue = key === 'active_users' ? (points.length ? total / points.length : 0) : total;
  const summaryLabel = key === 'active_users' ? 'günlük ortalama' : 'son 30 gün toplamı';
  const peak = points.reduce<SeriesPoint | null>((m, p) => (!m || p.value > m.value ? p : m), null);
  const allZero = points.length > 0 && points.every((p) => p.value === 0);

  const chartLabel = `Son 30 gün ${meta.label.toLocaleLowerCase('tr')}: ${summaryLabel} ${fmt(summaryValue)}${peak ? `, en yüksek ${fmt(peak.value)} (${formatDate(peak.time)})` : ''}.`;

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <div className="flex flex-col gap-4 px-5 pt-5 sm:px-6 sm:pt-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg">Son 30 gün</h2>
          <p className="mt-1 text-sm text-muted">Günlük kayıt, aktiflik ve işlem hareketleri</p>
        </div>
        <Tabs label="Grafik serisi" items={SERIES.map(({ value, label }) => ({ value, label }))} value={key} onChange={(v) => { setKey(v); setHover(null); }} className="self-start" />
      </div>

      <div className="px-5 pt-4 sm:px-6" aria-live="polite">
        {data ? (
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="num text-2xl font-bold text-fg">{fmt(hover ? hover.value : summaryValue)}</span>
            <span className="text-sm text-muted">{hover ? `${meta.unit} · ${formatDate(hover.time)}` : summaryLabel}</span>
          </p>
        ) : (
          <Skeleton className="h-8 w-40" />
        )}
      </div>

      <div className="flex-1 px-2 pb-3 pt-2 sm:px-3">
        {isLoading && !data ? (
          <Skeleton className="mx-3 h-[280px] rounded-xl" />
        ) : error && !data ? (
          <EmptyState
            className="h-[280px]"
            icon={<ChartBarIcon />}
            title="Grafik verisi alınamadı"
            description={isEndpointMissing(error) ? 'Metrik uç noktası henüz yok.' : error instanceof Error ? error.message : undefined}
            action={<Button variant="secondary" size="sm" onClick={() => void mutate()}>Tekrar dene</Button>}
          />
        ) : points.length === 0 ? (
          <EmptyState className="h-[280px]" icon={<ChartBarIcon />} title="Bu dönemde veri yok" />
        ) : (
          <div className="relative">
            <TimeSeriesChart points={points} kind={meta.kind} integer={!meta.money} format={axisFmt} label={chartLabel} onHover={setHover} />
            {allZero && (
              <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-subtle">Son 30 günde {meta.unit} yok</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/** "Sistem durumu" özet kartı: genel durum, veritabanı gecikmesi, eski veri uyarıları. */
export function SystemSummaryCard() {
  const { data: h, error, isLoading, mutate, isValidating } = useHealth();
  const stale = h ? STALE_SOURCES.filter((s) => h.data?.stale?.[s.key]) : [];
  const failingJobs = h ? h.jobs.filter((j) => j.last_status === 'error') : [];
  const pending = h?.migrations?.pending?.length ?? 0;

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg">Sistem durumu</h2>
          <p className="mt-1 text-sm text-muted">{h ? `Çalışma süresi ${formatUptime(h.uptime_s)}` : 'Sunucu, veri ve işler'}</p>
        </div>
        {h ? <HealthPill status={h.status} /> : isLoading ? <Skeleton className="h-6 w-20 rounded-full" /> : null}
      </div>

      <div className="flex-1 px-5 py-5 sm:px-6">
        {isLoading && !h ? (
          <div className="space-y-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error && !h ? (
          <EmptyState
            className="py-6"
            icon={<ServerStackIcon />}
            title="Sistem durumu alınamadı"
            description={isEndpointMissing(error) ? 'Sağlık uç noktası henüz yok.' : error instanceof Error ? error.message : undefined}
            action={<Button variant="secondary" size="sm" onClick={() => void mutate()}>Tekrar dene</Button>}
          />
        ) : h ? (
          <ul className="space-y-3">
            <SummaryRow icon={CircleStackIcon} label="Veritabanı" tone={h.db.ok ? 'up' : 'down'}>
              {h.db.ok ? `Bağlı · ${h.db.latency_ms == null ? '—' : `${formatNumber(h.db.latency_ms, 0)} ms`}` : 'Bağlantı yok'}
            </SummaryRow>
            <SummaryRow icon={ClockIcon} label="Veri tazeliği" tone={stale.length ? 'gold' : 'up'}>
              {stale.length ? `Eski: ${stale.map((s) => s.label).join(', ')}` : 'Tüm kaynaklar güncel'}
            </SummaryRow>
            <SummaryRow icon={ArrowsRightLeftIcon} label="Zamanlanmış işler" tone={failingJobs.length ? 'down' : 'up'}>
              {failingJobs.length ? `${failingJobs.length} iş hata verdi` : `${h.jobs.length} iş sorunsuz`}
            </SummaryRow>
            {pending > 0 && (
              <SummaryRow icon={ExclamationTriangleIcon} label="Migration" tone="gold">
                {pending} bekleyen migration
              </SummaryRow>
            )}
          </ul>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => void mutate()}
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg"
          aria-label="Sistem durumunu yenile"
        >
          <ArrowPathIcon className={cn('h-4 w-4', isValidating && 'animate-spin')} aria-hidden="true" />
          Yenile
        </button>
        <Link href="/system" className="inline-flex items-center gap-1 text-sm font-medium text-brand transition-colors hover:text-brand-hover">
          Ayrıntılar <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}

function SummaryRow({ icon: Icon, label, tone, children }: { icon: typeof CircleStackIcon; label: string; tone: 'up' | 'down' | 'gold'; children: ReactNode }) {
  const toneCls = { up: 'bg-up-soft text-up', down: 'bg-down-soft text-down', gold: 'bg-gold-soft text-gold' }[tone];
  return (
    <li className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', toneCls)} aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="truncate text-sm font-medium text-fg">{children}</p>
      </div>
    </li>
  );
}

/** Üst çubuktaki "Yenile": istatistik, metrik ve sağlık verilerini birlikte tazeler. */
export function RefreshOverviewButton() {
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await Promise.allSettled([mutate(ADMIN_STATS_KEY), mutate(METRICS_KEY), mutate(adminKeys.health), mutate('admin:users:recent')]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="secondary" size="sm" loading={busy} icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => void run()}>
      Yenile
    </Button>
  );
}
