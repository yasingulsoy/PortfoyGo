'use client';

import { useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import useSWR from 'swr';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  CircleStackIcon,
  CloudIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  PlayIcon,
  QueueListIcon,
  ServerStackIcon,
  XCircleIcon,
  ClockIcon,
} from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn, formatDateTime, formatNumber, formatRelative } from '@portfoygo/shared/format';
import { adminApi, adminKeys, swrFetcher } from '@/lib/api';
import { errorStatus, formatDurationMs, formatUptime, jobStatus } from '@/lib/labels';
import type { Health, Job } from '@/lib/types';
import { num } from '../model';
import { TableCardHeader, table } from '../ui';
import { LoadError } from '../controls';
import { HealthPill, STALE_SOURCES, healthMeta } from './shared';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const PROVIDER_LABELS: Record<string, string> = {
  stocks: 'Hisse',
  crypto: 'Kripto',
  fx: 'Döviz',
  commodities: 'Emtia',
  news: 'Haberler',
};

const BANNER: Record<string, { title: string; text: string; icon: Icon }> = {
  ok: { title: 'Tüm sistemler çalışıyor', text: 'Veritabanı, zamanlanmış işler ve veri kaynakları sağlıklı.', icon: CheckCircleIcon },
  degraded: { title: 'Bazı bileşenlerde sorun var', text: 'Uygulama çalışıyor ancak eski veri veya hata veren işler var; ayrıntılar aşağıda.', icon: ExclamationTriangleIcon },
  down: { title: 'Sistem çalışmıyor', text: 'Kritik bir bileşen (ör. veritabanı) yanıt vermiyor.', icon: XCircleIcon },
};

export default function SystemStatus() {
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const { data: h, error, isLoading, isValidating, mutate } = useSWR<Health>(adminKeys.health, swrFetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
    onSuccess: () => setCheckedAt(Date.now()),
  });

  if (isLoading && !h) {
    return (
      <div className="space-y-4 md:space-y-6" aria-hidden="true">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!h) {
    return (
      <Card>
        <LoadError error={error} title="Sistem durumu alınamadı" onRetry={() => void mutate()} className="border-t-0" />
      </Card>
    );
  }

  const banner = BANNER[h.status] ?? BANNER.degraded;
  const meta = healthMeta(h.status);
  const BannerIcon = banner.icon;
  const pending = h.migrations?.pending ?? [];
  const applied = h.migrations?.applied ?? [];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Genel durum şeridi */}
      <Card className={cn('flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6', h.status !== 'ok' && 'border-transparent', meta.cls)} role="status">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface/60" aria-hidden="true">
            <BannerIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{banner.title}</h2>
            <p className="mt-0.5 text-sm text-fg/70">{banner.text}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm text-fg/70">
          <span aria-live="polite">{checkedAt ? `Son kontrol ${new Date(checkedAt).toLocaleTimeString('tr-TR')}` : null}</span>
          <Button variant="secondary" size="sm" loading={isValidating} icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => void mutate()}>
            Yenile
          </Button>
        </div>
      </Card>
      {error && <p className="text-sm text-down">Son yenileme başarısız oldu; önceki veriler gösteriliyor.</p>}

      <div className="grid gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
        <InfoCard icon={CircleStackIcon} title="Veritabanı" badge={h.db.ok ? <Badge tone="up">Bağlı</Badge> : <Badge tone="down">Bağlantı yok</Badge>}>
          <Row label="Durum">{h.db.ok ? 'Sorgulara yanıt veriyor' : 'Yanıt yok'}</Row>
          <Row label="Gecikme">
            {h.db.latency_ms == null ? '—' : <span className={cn('num', num(h.db.latency_ms) > 250 && 'text-gold')}>{formatNumber(num(h.db.latency_ms), 0)} ms</span>}
          </Row>
        </InfoCard>

        <InfoCard icon={CpuChipIcon} title="Uygulama" badge={<HealthPill status={h.status} />}>
          <Row label="Çalışma süresi">{formatUptime(h.uptime_s)}</Row>
          <Row label="Node.js">
            <span className="num">{h.node || '—'}</span>
          </Row>
          <Row label="Ortam">
            <Badge tone={h.env === 'production' ? 'brand' : 'neutral'}>{h.env || '—'}</Badge>
          </Row>
          <Row label="Bellek">
            <span className="num">{formatNumber(num(h.memory_mb), 0)} MB</span>
          </Row>
        </InfoCard>

        <InfoCard icon={ClockIcon} title="Veri tazeliği" badge={STALE_SOURCES.some((s) => h.data?.stale?.[s.key]) ? <Badge tone="gold">Eski veri</Badge> : <Badge tone="up">Güncel</Badge>}>
          {STALE_SOURCES.map((s) => {
            const at = h.data?.[s.at] as string | null | undefined;
            const stale = !!h.data?.stale?.[s.key];
            return (
              <Row key={s.key} label={s.label}>
                <span className="flex items-center gap-2">
                  <span title={at ? formatDateTime(at) : undefined}>{at ? formatRelative(at) : 'Hiç'}</span>
                  {stale ? <Badge tone="gold">Eski</Badge> : <Badge tone="up">Güncel</Badge>}
                </span>
              </Row>
            );
          })}
        </InfoCard>

        <InfoCard icon={CloudIcon} title="Veri sağlayıcıları">
          {Object.keys(PROVIDER_LABELS).map((k) => (
            <Row key={k} label={PROVIDER_LABELS[k]}>
              {h.providers?.[k as keyof Health['providers']] || '—'}
            </Row>
          ))}
        </InfoCard>

        <InfoCard
          icon={QueueListIcon}
          title="Migration'lar"
          badge={pending.length ? <Badge tone="gold">{pending.length} bekliyor</Badge> : <Badge tone="up">Güncel</Badge>}
          className="xl:col-span-2"
        >
          <Row label="Son uygulanan">
            <code className="break-all font-mono text-xs">{h.migrations?.latest || '—'}</code>
          </Row>
          <Row label="Uygulanan">
            <span className="num">{formatNumber(applied.length, 0)}</span>
          </Row>
          {pending.length > 0 && (
            <div className="rounded-xl border border-gold/30 bg-gold-soft p-3 text-sm text-gold">
              <p className="flex items-center gap-2 font-medium">
                <ExclamationTriangleIcon className="h-4 w-4" aria-hidden="true" />
                Uygulanmamış migration var — backend&apos;i yeniden başlatmadan önce çalıştırın.
              </p>
              <ul className="mt-2 space-y-1 pl-6">
                {pending.map((m) => (
                  <li key={m}>
                    <code className="break-all font-mono text-xs">{m}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </InfoCard>
      </div>

      <JobsTable jobs={h.jobs ?? []} onChanged={() => void mutate()} />

      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand" aria-hidden="true">
            <ServerStackIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg">Piyasa önbelleği</p>
            <p className="mt-0.5 text-sm text-muted">Hisse, kripto ve döviz önbelleğini elle yenile (sağlayıcı kotası harcar).</p>
          </div>
        </div>
        <LinkButton href="/cache" variant="secondary" className="shrink-0">
          Önbelleği yönet
        </LinkButton>
      </Card>
    </div>
  );
}

function InfoCard({ icon: Icon, title, badge, children, className }: { icon: Icon; title: string; badge?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn('flex flex-col p-5 md:p-6', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg" aria-hidden="true">
            <Icon className="h-5 w-5" />
          </span>
          <h3 className="truncate text-base font-semibold text-fg">{title}</h3>
        </div>
        {badge}
      </div>
      <dl className="space-y-2.5">{children}</dl>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-fg">{children}</dd>
    </div>
  );
}

function JobsTable({ jobs, onChanged }: { jobs: Job[]; onChanged: () => void }) {
  const toast = useToast();
  const [starting, setStarting] = useState<string | null>(null);

  const run = async (j: Job) => {
    setStarting(j.name);
    try {
      await adminApi.runJob(j.name);
      toast.success(`${j.name} başlatıldı`, { description: 'Durum birkaç saniye içinde güncellenir.' });
      onChanged();
      setTimeout(onChanged, 3000);
    } catch (err) {
      if (errorStatus(err) === 409) toast.info(`${j.name} zaten çalışıyor`, { description: 'Bitmesini bekleyip tekrar deneyebilirsin.' });
      else toast.error(`${j.name} başlatılamadı`, { description: err instanceof Error ? err.message : undefined });
    } finally {
      setStarting(null);
    }
  };

  return (
    <Card className="min-w-0 overflow-hidden">
      <TableCardHeader title="Zamanlanmış işler" description="Arka plan işleri · her 15 saniyede bir yenilenir" />
      {jobs.length === 0 ? (
        <EmptyState icon={<ClockIcon />} title="Kayıtlı iş yok" className="border-t border-line" />
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <caption className="sr-only">Zamanlanmış işler</caption>
            <thead>
              <tr className={table.headRow}>
                <th scope="col" className={table.th}>İş</th>
                <th scope="col" className={cn(table.th, 'hidden md:table-cell')}>Zamanlama</th>
                <th scope="col" className={table.th}>Son çalışma</th>
                <th scope="col" className={cn(table.th, 'hidden text-right sm:table-cell')}>Süre</th>
                <th scope="col" className={table.th}>Durum</th>
                <th scope="col" className={cn(table.th, 'hidden text-right lg:table-cell')}>Çalışma</th>
                <th scope="col" className={cn(table.th, 'hidden 2xl:table-cell')}>Son hata</th>
                <th scope="col" className={cn(table.th, 'text-right')}>
                  <span className="sr-only">İşlem</span>
                </th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {jobs.map((j) => {
                const st = jobStatus(j.last_status);
                const running = j.last_status === 'running';
                return (
                  <tr key={j.name} className="transition-colors hover:bg-surface-2">
                    <td className={cn(table.td, 'whitespace-nowrap')}>
                      <span className="font-medium text-fg">{j.name}</span>
                      {j.enabled === false && (
                        <Badge className="ml-2" tone="gold">
                          Devre dışı
                        </Badge>
                      )}
                    </td>
                    <td className={cn(table.td, 'hidden md:table-cell')}>
                      <code className="inline-block max-w-[11rem] truncate whitespace-nowrap rounded-md bg-surface-3 px-2 py-0.5 align-middle font-mono text-xs text-fg/80" title={j.schedule}>
                        {j.schedule || '—'}
                      </code>
                    </td>
                    <td className={cn(table.td, 'whitespace-nowrap')}>
                      {j.last_run_at ? <span title={formatDateTime(j.last_run_at)}>{formatRelative(j.last_run_at)}</span> : 'Hiç'}
                    </td>
                    <td className={cn(table.td, 'num hidden whitespace-nowrap text-right sm:table-cell')}>{formatDurationMs(j.last_duration_ms)}</td>
                    <td className={table.td}>
                      <Badge tone={st.tone} className="whitespace-nowrap">
                        {st.label}
                      </Badge>
                      {j.last_error && (
                        <p className="mt-1 max-w-[12rem] truncate text-xs text-down 2xl:hidden" title={j.last_error}>
                          {j.last_error}
                        </p>
                      )}
                    </td>
                    <td className={cn(table.td, 'num hidden text-right lg:table-cell')}>{formatNumber(num(j.run_count), 0)}</td>
                    <td className={cn(table.td, 'hidden max-w-[16rem] 2xl:table-cell')}>
                      {j.last_error ? (
                        <span className="block truncate text-down" title={j.last_error}>
                          {j.last_error}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={cn(table.td, 'text-right')}>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={starting === j.name}
                        disabled={running || (starting !== null && starting !== j.name)}
                        icon={<PlayIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                        onClick={() => void run(j)}
                        aria-label={`${j.name} işini şimdi çalıştır`}
                      >
                        <span className="hidden sm:inline">Şimdi çalıştır</span>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
