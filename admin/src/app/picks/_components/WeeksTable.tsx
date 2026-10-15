'use client';

import { ChatBubbleLeftRightIcon, EnvelopeIcon, ListBulletIcon, TrophyIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Badge, EmptyState } from '@portfoygo/shared/ui/Feedback';
import Button from '@portfoygo/shared/ui/Button';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { cn, formatNumber } from '@portfoygo/shared/format';
import type { AdminPicksWeek } from '@/lib/types';
import { TableCardHeader, TableSkeleton, table } from '@/components/ui';
import { LoadError, Pagination, StaleNotice } from '@/components/controls';
import { formatTr } from '@/components/arena/time';
import { PHASE_META, WEEKS_PAGE, isRevealed, usePicksWeeks, weekRange } from './data';

type WeeksState = ReturnType<typeof usePicksWeeks>;

/** Haftalar tablosu: hafta, evre, katılımcı, kazanan, kitle getirisi, yorumlar. */
export default function WeeksTable({
  list,
  offset,
  setOffset,
  onShowPicks,
  onShowComments,
}: {
  list: WeeksState;
  offset: number;
  setOffset: (v: number) => void;
  onShowPicks: (w: AdminPicksWeek) => void;
  onShowComments: (w: AdminPicksWeek) => void;
}) {
  const { items, total, error, loading, isValidating, mutate } = list;

  return (
    <Card className="min-w-0 overflow-hidden">
      <TableCardHeader
        title="Haftalar"
        description={loading ? 'Yükleniyor' : `${formatNumber(total, 0)} hafta · en yeni önce · saatler Türkiye saati`}
      />
      <StaleNotice show={!!error && items.length > 0} />

      {loading ? (
        <TableSkeleton rows={4} />
      ) : error && items.length === 0 ? (
        <LoadError error={error} title="Haftalar yüklenemedi" onRetry={() => void mutate()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<EnvelopeIcon />} title="Henüz hafta yok" description="İlk hafta oluşturulduğunda burada görünür." className="border-t border-line" />
      ) : (
        <div className={cn(table.wrap, 'transition-opacity', isValidating && 'opacity-70')} aria-busy={isValidating}>
          <table className={table.table}>
            <caption className="sr-only">Haftalık seçim haftaları</caption>
            <thead>
              <tr className={table.headRow}>
                <th scope="col" className={table.th}>
                  Hafta
                </th>
                <th scope="col" className={table.th}>
                  Evre
                </th>
                <th scope="col" className={cn(table.th, 'text-right')}>
                  Katılımcı
                </th>
                <th scope="col" className={cn(table.th, 'hidden md:table-cell')}>
                  Kazanan
                </th>
                <th scope="col" className={cn(table.th, 'hidden text-right lg:table-cell')}>
                  Kitle getirisi
                </th>
                <th scope="col" className={cn(table.th, 'hidden text-right sm:table-cell')}>
                  Yorum
                </th>
                <th scope="col" className={cn(table.th, 'text-right')}>
                  <span className="sr-only">Eylemler</span>
                </th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {items.map((w) => {
                const ph = PHASE_META[w.phase];
                return (
                  <tr key={w.week_id} className="align-top transition-colors hover:bg-surface-2">
                    <td className={cn(table.td, 'whitespace-nowrap')}>
                      <p className="num font-medium text-fg">{w.week_id}</p>
                      <p className="text-xs text-subtle">{weekRange(w.starts_at, w.ends_at)}</p>
                      <p className="mt-1 text-xs text-subtle md:hidden">
                        {w.winner ? `Kazanan: ${w.winner.username}` : 'Kazanan yok'}
                      </p>
                    </td>
                    <td className={cn(table.td, 'whitespace-nowrap')}>
                      <Badge tone={ph.tone}>{ph.label}</Badge>
                      <p className="mt-1 text-xs text-subtle">
                        {w.phase === 'submit'
                          ? `Açılış ${formatTr(w.reveal_at, { withYear: false })}`
                          : w.phase === 'revealed'
                            ? `Başlangıç ${formatTr(w.starts_at, { withYear: false })}`
                            : w.phase === 'live'
                              ? `Bitiş ${formatTr(w.ends_at, { withYear: false })}`
                              : w.phase === 'upcoming'
                                ? `Açılış ${formatTr(w.opens_at, { withYear: false })}`
                                : w.rewarded_at
                                  ? 'Ödüller dağıtıldı'
                                  : w.settled_at
                                    ? 'Sonuçlandı'
                                    : '—'}
                      </p>
                    </td>
                    <td className={cn(table.td, 'whitespace-nowrap text-right')}>
                      <span className="num font-medium text-fg">{formatNumber(w.participants, 0)}</span>
                      {w.void_picks > 0 && <p className="text-xs text-subtle">{formatNumber(w.void_picks, 0)} geçersiz</p>}
                      {w.notes_hidden > 0 && <p className="text-xs text-subtle">{formatNumber(w.notes_hidden, 0)} not gizli</p>}
                    </td>
                    <td className={cn(table.td, 'hidden whitespace-nowrap md:table-cell')}>
                      {w.winner ? (
                        <span className="inline-flex items-center gap-1.5">
                          <TrophyIcon className="h-4 w-4 text-gold" aria-hidden="true" />
                          <span className="font-medium text-fg">{w.winner.username}</span>
                          <Delta value={w.winner.return_pct} variant="text" className="text-xs" />
                        </span>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td className={cn(table.td, 'hidden whitespace-nowrap text-right lg:table-cell')}>
                      {w.crowd_return_pct != null ? <Delta value={w.crowd_return_pct} variant="pill" /> : <span className="text-subtle">—</span>}
                      {w.beat_pct != null && <p className="mt-1 text-xs text-subtle">Geçtiği oran: %{Math.round(w.beat_pct)}</p>}
                      {w.bullish_pct != null && <p className="text-xs text-subtle">Yükselir: %{Math.round(w.bullish_pct)}</p>}
                    </td>
                    <td className={cn(table.td, 'hidden whitespace-nowrap text-right sm:table-cell')}>
                      <span className="num font-medium text-fg">{formatNumber(w.comments, 0)}</span>
                      {w.comments_deleted > 0 && <p className="text-xs text-subtle">{formatNumber(w.comments_deleted, 0)} silindi</p>}
                    </td>
                    <td className={cn(table.td, 'whitespace-nowrap text-right')}>
                      <span className="inline-flex flex-wrap justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!isRevealed(w.phase) || w.participants === 0}
                          onClick={() => onShowPicks(w)}
                          icon={<ListBulletIcon className="h-4 w-4" aria-hidden="true" />}
                          aria-label={`${w.week_id} seçimleri ve notları`}
                          title={!isRevealed(w.phase) ? 'Seçimler açılıştan sonra görünür' : undefined}
                        >
                          Seçimler
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onShowComments(w)}
                          icon={<ChatBubbleLeftRightIcon className="h-4 w-4" aria-hidden="true" />}
                          aria-label={`${w.week_id} yorumlarını göster`}
                        >
                          Yorumlar
                        </Button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination offset={offset} limit={WEEKS_PAGE} total={total} onChange={setOffset} label="Hafta sayfaları" />
    </Card>
  );
}
