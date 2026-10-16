'use client';

import { useMemo, useState } from 'react';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { cn, formatDate } from '@portfoygo/shared/format';
import EquityChart, { type EquitySeries } from '@/components/sandbox/EquityChart';
import { DataTable, TBody, THead, Td, Th } from '@/components/common/Table';
import { fmtSignedPct, periodColumnLabel, seriesColors } from '@/lib/portfolioLeagues';
import type { PortfolioLeaguePerformance } from '@/types/portfolioLeague';

/** Performans: ilk 5 + ben (başlangıç = 100) ve katılımcı başına haftalık / aylık dönem getirileri. */
export default function PerformanceTab({ data, loading }: { data: PortfolioLeaguePerformance | undefined; loading: boolean }) {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const colors = useMemo(() => seriesColors(data?.series ?? []), [data?.series]);
  const series: EquitySeries[] = useMemo(
    () =>
      (data?.series ?? []).map((s) => ({
        id: s.entry_id,
        label: `${s.rank ? `${s.rank}. ` : ''}${s.label}${s.is_me ? ' (sen)' : ''}`,
        colorVar: colors.get(s.entry_id) ?? '--brand',
        points: s.points,
      })),
    [data?.series, colors],
  );

  if (loading && !data) {
    return (
      <Card className="space-y-3 p-5 sm:p-6" aria-busy="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-64 w-full" />
      </Card>
    );
  }
  if (!data || data.status === 'upcoming') {
    return (
      <Card>
        <EmptyState icon={<ChartBarIcon />} title="Performans lig başlayınca oluşur" description="Herkesin portföyü aynı anda, aynı sermayeyle açılır; grafik o andan itibaren çizilir." />
      </Card>
    );
  }

  const table = period === 'week' ? data.weekly : data.monthly;
  const spanMs = Date.parse(data.period_end) - Date.parse(data.period_start);
  const intraday = Number.isFinite(spanMs) && spanMs <= 14 * 86_400_000;

  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="min-w-0">
        <CardHeader title="Karşılaştırmalı performans" description="İlk 5 ve sen · başlangıç sermayesi = 100" />
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          <EquityChart
            series={series}
            format="index"
            baseline={100}
            intraday={intraday}
            emptyDescription="Değer geçmişi her saat kaydedilir; birkaç saat içinde grafik oluşur."
          />
        </div>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader
          title="Dönem getirileri"
          description="Dilimler lig başlangıcından sayılır (7 / 30 gün) — herkes için aynı takvim"
          action={
            <Tabs
              label="Dönem"
              value={period}
              onChange={setPeriod}
              items={[
                { value: 'week', label: 'Haftalık' },
                { value: 'month', label: 'Aylık' },
              ]}
            />
          }
        />
        {table.rows.length === 0 ? (
          <EmptyState className="border-t border-line" icon={<ChartBarIcon />} title="Henüz veri yok" />
        ) : (
          <DataTable label={period === 'week' ? 'Haftalık getiriler' : 'Aylık getiriler'} className="pb-2" tableClassName="min-w-[20rem]">
            <THead>
              <Th className="w-10">Sıra</Th>
              <Th>Katılımcı</Th>
              {table.columns.map((c, i) => (
                <Th key={c.start} align="right" title={`${formatDate(c.start)} – ${formatDate(c.end)}`}>
                  {periodColumnLabel(i, period)}
                </Th>
              ))}
            </THead>
            <TBody>
              {table.rows.map((r) => (
                <tr key={r.entry_id} className={cn(r.is_me ? 'bg-brand-soft' : 'hover:bg-surface-2')}>
                  <Td className="num text-muted">{r.rank ?? '—'}</Td>
                  <Td className="max-w-[12rem]">
                    <span className="block truncate font-medium text-fg">
                      {r.label}
                      {r.is_me && <span className="text-brand"> (sen)</span>}
                    </span>
                  </Td>
                  {r.returns.map((v, i) => (
                    <Td key={i} align="right" className={cn('num whitespace-nowrap', v == null ? 'text-subtle' : v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-muted')}>
                      {fmtSignedPct(v)}
                    </Td>
                  ))}
                </tr>
              ))}
            </TBody>
          </DataTable>
        )}
      </Card>
    </div>
  );
}
