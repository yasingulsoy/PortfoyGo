'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ClockIcon } from '@heroicons/react/24/outline';
import { cn, formatDateTime, formatPercent, formatUSD } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Pagination from '@/components/common/Pagination';
import { DataTable, TBody, THead, Th } from '@/components/common/Table';
import { useArenaHistory } from '@/hooks/useArena';
import { ApiError } from '@/lib/api';
import { historyHref, historyTitle } from './model';

const PAGE = 10;

/** "Geçmiş turlarım": özet kutucukları ve tur tablosu. */
export default function ArenaHistory({ className }: { className?: string }) {
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useArenaHistory(PAGE, (page - 1) * PAGE);
  const stats = data?.stats;
  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  const missing = error instanceof ApiError && error.status === 404;

  const tiles = [
    { label: 'Oynanan tur', value: stats ? String(stats.rounds) : '—' },
    { label: 'En iyi getiri', value: stats?.best_return_pct != null ? formatPercent(stats.best_return_pct) : '—', tone: stats?.best_return_pct },
    { label: 'Ortalama getiri', value: stats?.avg_return_pct != null ? formatPercent(stats.avg_return_pct) : '—', tone: stats?.avg_return_pct },
    { label: 'Kazanma oranı', value: stats?.win_rate != null ? formatPercent(stats.win_rate, { sign: false }) : '—' },
  ];

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader title="Geçmiş turlarım" description="Oyun Merkezi'ndeki tüm turların, düelloların, senaryoların ve meydan okumaların" icon={<ClockIcon />} />
      <dl className="grid grid-cols-2 gap-3 px-5 pb-5 sm:px-6 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-line bg-surface-2 p-3.5">
            <dt className="text-xs text-muted">{t.label}</dt>
            <dd
              className={cn(
                'num mt-1 text-lg font-semibold sm:text-xl',
                t.tone == null ? 'text-fg' : t.tone > 0 ? 'text-up' : t.tone < 0 ? 'text-down' : 'text-fg',
              )}
            >
              {isLoading && !data ? <Skeleton className="h-6 w-16" /> : t.value}
            </dd>
          </div>
        ))}
      </dl>

      {isLoading && !data ? (
        <div className="space-y-2 px-5 pb-6 sm:px-6">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : error && !data ? (
        <EmptyState title={missing ? 'Henüz tur oynamadın' : 'Geçmiş yüklenemedi'} description={missing ? 'İlk turunu başlattığında sonuçların burada listelenir.' : 'Birazdan tekrar dene.'} className="py-8" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Henüz tur oynamadın" description="İlk turunu başlattığında sonuçların burada listelenir." className="py-8" />
      ) : (
        <>
          <DataTable label="Geçmiş turlar" className="pb-2">
            <THead>
              <Th>Tur</Th>
              <Th>Tarih</Th>
              <Th align="right">Son özsermaye</Th>
              <Th align="right">Getiri</Th>
              <Th align="right">Sıra</Th>
              <Th align="right">İşlem</Th>
            </THead>
            <TBody>
              {data.items.map((r) => (
                <tr key={r.round_id} className="transition-colors hover:bg-surface-2">
                  <td className="py-3 pr-3">
                    <Link href={historyHref(r)} className="font-medium text-fg hover:text-brand">
                      {historyTitle(r)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted">{formatDateTime(r.finished_at)}</td>
                  <td className="num whitespace-nowrap px-3 py-3 text-right text-fg">{formatUSD(r.equity_final)}</td>
                  <td className="px-3 py-3 text-right">
                    <Delta value={r.return_pct} />
                  </td>
                  <td className="num px-3 py-3 text-right text-muted">{r.rank ?? '—'}</td>
                  <td className="num py-3 pl-3 text-right text-muted">{r.trades_count}</td>
                </tr>
              ))}
            </TBody>
          </DataTable>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} label="Geçmiş tur sayfaları" className="border-t border-line px-5 py-4 sm:px-6" />
        </>
      )}
    </Card>
  );
}
