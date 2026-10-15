'use client';

import { useState } from 'react';
import { ChatBubbleLeftRightIcon, TrashIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Badge, EmptyState } from '@portfoygo/shared/ui/Feedback';
import Button from '@portfoygo/shared/ui/Button';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn, formatNumber } from '@portfoygo/shared/format';
import { picksAdminApi } from '@/lib/api';
import type { AdminPicksComment } from '@/lib/types';
import { TableCardHeader, TableSkeleton, table } from '@/components/ui';
import { ConfirmModal, LoadError, Pagination, SelectField, StaleNotice } from '@/components/controls';
import { formatTr } from '@/components/arena/time';
import { COMMENTS_PAGE, usePicksComments } from './data';

type CommentsState = ReturnType<typeof usePicksComments>;

/** Son tartışma yorumları (silinenler dahil) ve kaldırma. */
export default function CommentsCard({
  list,
  offset,
  setOffset,
  weekFilter,
  weekOptions,
  onWeekFilter,
  onChanged,
}: {
  list: CommentsState;
  offset: number;
  setOffset: (v: number) => void;
  weekFilter: string | null;
  weekOptions: string[];
  onWeekFilter: (weekId: string | null) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { items, total, error, loading, isValidating, mutate } = list;
  const [target, setTarget] = useState<AdminPicksComment | null>(null);

  const options = [{ value: '', label: 'Tüm haftalar' }, ...[...new Set([...(weekFilter ? [weekFilter] : []), ...weekOptions])].map((w) => ({ value: w, label: w }))];

  return (
    <Card id="picks-comments" className="min-w-0 scroll-mt-24 overflow-hidden">
      <TableCardHeader
        title="Son yorumlar"
        description={loading ? 'Yükleniyor' : `${formatNumber(total, 0)} yorum · en yeni önce · silinenler soluk görünür`}
        actions={
          <SelectField
            label="Hafta"
            hideLabel
            value={weekFilter ?? ''}
            onChange={(e) => onWeekFilter(e.target.value || null)}
            options={options}
            className="w-44"
          />
        }
      />
      <StaleNotice show={!!error && items.length > 0} />

      {loading ? (
        <TableSkeleton rows={5} />
      ) : error && items.length === 0 ? (
        <LoadError error={error} title="Yorumlar yüklenemedi" onRetry={() => void mutate()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ChatBubbleLeftRightIcon />}
          title="Yorum yok"
          description={weekFilter ? 'Bu haftanın tartışmasına henüz yorum yazılmadı.' : 'Tartışmalara yazılan yorumlar burada listelenir.'}
          className="border-t border-line"
        />
      ) : (
        <div className={cn(table.wrap, 'transition-opacity', isValidating && 'opacity-70')} aria-busy={isValidating}>
          <table className={table.table}>
            <caption className="sr-only">Haftalık seçim tartışma yorumları</caption>
            <thead>
              <tr className={table.headRow}>
                <th scope="col" className={table.th}>
                  Yorum
                </th>
                <th scope="col" className={cn(table.th, 'hidden md:table-cell')}>
                  Hafta
                </th>
                <th scope="col" className={cn(table.th, 'hidden sm:table-cell')}>
                  Zaman
                </th>
                <th scope="col" className={cn(table.th, 'text-right')}>
                  <span className="sr-only">Eylemler</span>
                </th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {items.map((c) => (
                <tr key={c.id} className={cn('align-top transition-colors hover:bg-surface-2', c.deleted && 'opacity-60')}>
                  <td className={cn(table.td, 'min-w-[14rem] max-w-[36rem]')}>
                    <p className="text-xs font-medium text-fg">{c.username}</p>
                    <p className={cn('mt-0.5 whitespace-pre-line break-words text-fg/90', c.deleted && 'line-through')}>{c.text}</p>
                    <p className="mt-1 text-xs text-subtle sm:hidden">
                      {formatTr(c.created_at, { withYear: false })} · {c.week_id}
                    </p>
                  </td>
                  <td className={cn(table.td, 'hidden whitespace-nowrap md:table-cell')}>
                    <span className="num">{c.week_id}</span>
                  </td>
                  <td className={cn(table.td, 'hidden whitespace-nowrap sm:table-cell')}>
                    <time dateTime={c.created_at}>{formatTr(c.created_at, { withYear: false })}</time>
                  </td>
                  <td className={cn(table.td, 'whitespace-nowrap text-right')}>
                    {c.deleted ? (
                      <span className="inline-flex flex-col items-end gap-0.5">
                        <Badge tone="down">Silindi</Badge>
                        {c.deleted_by_username && <span className="text-xs text-subtle">{c.deleted_by_username}</span>}
                      </span>
                    ) : (
                      <Button
                        variant="down"
                        size="sm"
                        onClick={() => setTarget(c)}
                        icon={<TrashIcon className="h-4 w-4" aria-hidden="true" />}
                        aria-label={`${c.username} kullanıcısının yorumunu sil`}
                      >
                        Sil
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination offset={offset} limit={COMMENTS_PAGE} total={total} onChange={setOffset} label="Yorum sayfaları" />

      <ConfirmModal
        open={!!target}
        onClose={() => setTarget(null)}
        title="Yorum kaldırılsın mı?"
        description={target ? `${target.username} · ${target.week_id} · ${formatTr(target.created_at, { withYear: false })}` : undefined}
        confirmLabel="Kaldır"
        tone="danger"
        onConfirm={async () => {
          if (!target) return;
          await picksAdminApi.deleteComment(target.id);
          toast.success('Yorum kaldırıldı', { description: target.username });
          setTarget(null);
          onChanged();
        }}
      >
        {target && <p className="whitespace-pre-line break-words rounded-lg bg-surface-2 p-3 text-fg">{target.text}</p>}
        <p>Yorum tartışmadan kalkar; işlem denetim kaydına yazılır.</p>
      </ConfirmModal>
    </Card>
  );
}
