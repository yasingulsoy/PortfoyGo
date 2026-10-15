'use client';

import { Fragment, useState } from 'react';
import { ChartBarIcon, TrashIcon } from '@heroicons/react/20/solid';
import { CircleStackIcon } from '@heroicons/react/24/outline';
import { Card } from '@portfoygo/shared/ui/Card';
import { Badge, EmptyState } from '@portfoygo/shared/ui/Feedback';
import Button from '@portfoygo/shared/ui/Button';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn, formatNumber } from '@portfoygo/shared/format';
import { scenarioApi } from '@/lib/api';
import type { HistoricalSeries } from '@/lib/types';
import { TableCardHeader, TableSkeleton, table } from '@/components/ui';
import { ConfirmModal, LoadError, StaleNotice } from '@/components/controls';
import { formatUtc, useSeriesList, useSeriesPreview } from './data';
import LineChart from './LineChart';

type SeriesState = ReturnType<typeof useSeriesList>;

/** İçe aktarılmış seriler: nokta sayısı, aralık, künye, kullanan senaryolar; önizleme ve silme. */
export default function SeriesTable({ list, onChanged }: { list: SeriesState; onChanged: () => void }) {
  const toast = useToast();
  const { items, error, loading, isValidating, mutate } = list;
  const [open, setOpen] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HistoricalSeries | null>(null);

  return (
    <Card className="min-w-0 overflow-hidden">
      <TableCardHeader
        title="Tarihsel seriler"
        description={loading ? 'Yükleniyor' : `${formatNumber(items.length, 0)} seri · zamanlar UTC`}
      />
      <StaleNotice show={!!error && items.length > 0} />
      {loading ? (
        <TableSkeleton rows={3} />
      ) : error && items.length === 0 ? (
        <LoadError error={error} title="Seriler yüklenemedi" onRetry={() => void mutate()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CircleStackIcon />}
          title="Henüz seri yok"
          description="Yukarıdaki kartla lisanslı bir CSV yüklediğinde burada listelenir."
          className="border-t border-line"
        />
      ) : (
        <div className={cn(table.wrap, 'transition-opacity', isValidating && 'opacity-70')} aria-busy={isValidating}>
          <table className={table.table}>
            <caption className="sr-only">Tarihsel fiyat serileri</caption>
            <thead>
              <tr className={table.headRow}>
                <th scope="col" className={table.th}>
                  Seri
                </th>
                <th scope="col" className={cn(table.th, 'text-right')}>
                  Nokta
                </th>
                <th scope="col" className={cn(table.th, 'hidden md:table-cell')}>
                  Aralık
                </th>
                <th scope="col" className={cn(table.th, 'hidden lg:table-cell')}>
                  Kaynak / lisans
                </th>
                <th scope="col" className={cn(table.th, 'text-right')}>
                  <span className="sr-only">Eylemler</span>
                </th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {items.map((s) => {
                const expanded = open === s.series_code;
                const usedPublished = s.used_by.filter((u) => u.published);
                return (
                  <Fragment key={s.series_code}>
                    <tr className="align-top transition-colors hover:bg-surface-2">
                      <td className={cn(table.td, 'min-w-[11rem] max-w-[22rem]')}>
                        <p className="break-all font-mono text-xs font-semibold text-fg">{s.series_code}</p>
                        <p className="mt-0.5 break-words text-fg/80">{s.label}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge>{s.currency}</Badge>
                          {s.used_by.length > 0 && (
                            <Badge tone={usedPublished.length ? 'up' : 'neutral'}>
                              {s.used_by.length} senaryoda{usedPublished.length ? ` · ${usedPublished.length} yayında` : ''}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-subtle md:hidden">
                          {formatUtc(s.from, false)} – {formatUtc(s.to, false)}
                        </p>
                      </td>
                      <td className={cn(table.td, 'whitespace-nowrap text-right')}>
                        <span className="num font-medium text-fg">{formatNumber(s.points, 0)}</span>
                      </td>
                      <td className={cn(table.td, 'hidden whitespace-nowrap md:table-cell')}>
                        <span className="block text-fg/80">{formatUtc(s.from)}</span>
                        <span className="block text-xs text-subtle">{formatUtc(s.to)}</span>
                      </td>
                      <td className={cn(table.td, 'hidden max-w-[18rem] lg:table-cell')}>
                        <p className="truncate text-fg/80" title={s.source}>
                          {s.source || '—'}
                        </p>
                        <p className="line-clamp-2 text-xs text-subtle" title={s.license_note}>
                          {s.license_note || '—'}
                        </p>
                      </td>
                      <td className={cn(table.td, 'whitespace-nowrap text-right')}>
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setOpen(expanded ? null : s.series_code)}
                            aria-expanded={expanded}
                            aria-controls={`series-preview-${s.series_code}`}
                            icon={<ChartBarIcon className="h-4 w-4" aria-hidden="true" />}
                            aria-label={`${s.series_code} önizlemesi`}
                          >
                            <span className="hidden sm:inline">Önizle</span>
                          </Button>
                          <Button
                            variant="down"
                            size="sm"
                            onClick={() => setDeleteTarget(s)}
                            icon={<TrashIcon className="h-4 w-4" aria-hidden="true" />}
                            aria-label={`${s.series_code} serisini sil`}
                          >
                            <span className="hidden sm:inline">Sil</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr id={`series-preview-${s.series_code}`}>
                        <td colSpan={5} className="bg-surface-2 px-5 py-4 sm:px-6">
                          <SeriesPreviewChart code={s.series_code} />
                          <p className="mt-2 text-xs text-subtle lg:hidden">
                            Kaynak: {s.source || '—'} · Lisans: {s.license_note || '—'}
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Seri silinsin mi?"
        description={deleteTarget ? `${deleteTarget.series_code} · ${formatNumber(deleteTarget.points, 0)} nokta` : undefined}
        confirmLabel="Sil"
        tone="danger"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await scenarioApi.deleteSeries(deleteTarget.series_code);
          toast.success('Seri silindi', { description: deleteTarget.series_code });
          if (open === deleteTarget.series_code) setOpen(null);
          setDeleteTarget(null);
          onChanged();
        }}
      >
        <p>Serinin tüm noktaları kalıcı olarak silinir. Yayındaki bir senaryo bu seriyi kullanıyorsa sunucu silmeye izin vermez.</p>
        {deleteTarget && deleteTarget.used_by.length > 0 && (
          <p>
            Kullanan senaryolar: <span className="font-medium text-fg">{deleteTarget.used_by.map((u) => u.title).join(', ')}</span>
          </p>
        )}
      </ConfirmModal>
    </Card>
  );
}

function SeriesPreviewChart({ code }: { code: string }) {
  const { preview, loading, error } = useSeriesPreview(code, undefined, 500);
  if (loading) return <div className="h-[160px] animate-pulse rounded-xl bg-surface-3" aria-hidden="true" />;
  if (error || !preview) return <p className="text-sm text-down">Önizleme yüklenemedi.</p>;
  return (
    <div>
      <p className="mb-2 text-xs text-muted">
        {formatNumber(preview.total, 0)} noktadan {formatNumber(preview.points.length, 0)} tanesi gösteriliyor
      </p>
      <LineChart points={preview.points} label={`${code} serisinin fiyat grafiği`} height={150} />
    </div>
  );
}
