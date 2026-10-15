'use client';

import { useMemo, useState } from 'react';
import { ChatBubbleLeftRightIcon, EnvelopeIcon, SparklesIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import { formatNumber, formatPercent } from '@portfoygo/shared/format';
import { MetricCard } from '@/components/ui';
import type { AdminPicksWeek } from '@/lib/types';
import CommentsCard from './CommentsCard';
import WeeksTable from './WeeksTable';
import WeekPicksModal from './WeekPicksModal';
import { PHASE_META, usePicksComments, usePicksWeeks, weekRange } from './data';

/** Haftalık Seçim yönetimi: özet, haftalar tablosu ve yorum / not moderasyonu. */
export default function PicksAdmin() {
  const [offset, setOffset] = useState(0);
  const [commentsOffset, setCommentsOffset] = useState(0);
  const [weekFilter, setWeekFilter] = useState<string | null>(null);
  const [picksFor, setPicksFor] = useState<AdminPicksWeek | null>(null);

  const weeks = usePicksWeeks(offset);
  const summaryWeeks = usePicksWeeks(0);
  const comments = usePicksComments(commentsOffset, weekFilter);

  const { active, lastFinished } = useMemo(() => {
    const list = summaryWeeks.items;
    return {
      active: list.find((w) => w.phase === 'submit' || w.phase === 'revealed' || w.phase === 'live') ?? list.find((w) => w.phase !== 'upcoming') ?? null,
      lastFinished: list.find((w) => w.phase === 'finished') ?? null,
    };
  }, [summaryWeeks.items]);

  const loading = summaryWeeks.loading;
  const failed = !!summaryWeeks.error && summaryWeeks.items.length === 0;

  return (
    <div className="space-y-6">
      <section aria-label="Haftalık Seçim özeti" className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
        <MetricCard
          icon={EnvelopeIcon}
          label="Bu hafta"
          value={failed ? '—' : active ? PHASE_META[active.phase].label : 'Hafta yok'}
          loading={loading}
          hint={active ? `${active.week_id} · ${weekRange(active.starts_at, active.ends_at)}` : failed ? 'Yüklenemedi' : undefined}
        />
        <MetricCard
          icon={UserGroupIcon}
          label="Katılımcı (bu hafta)"
          value={failed || !active ? '—' : formatNumber(active.participants, 0)}
          loading={loading}
          badge={active && active.void_picks > 0 ? <Badge tone="gold">{active.void_picks} geçersiz</Badge> : undefined}
        />
        <MetricCard
          icon={SparklesIcon}
          label="Kitle getirisi (son biten)"
          value={lastFinished?.crowd_return_pct != null ? formatPercent(lastFinished.crowd_return_pct) : '—'}
          loading={loading}
          hint={
            lastFinished
              ? lastFinished.beat_pct != null
                ? `Geçtiği katılımcı oranı: %${Math.round(lastFinished.beat_pct)} · ${lastFinished.week_id}`
                : lastFinished.week_id
              : 'Henüz biten hafta yok'
          }
        />
        <MetricCard
          icon={ChatBubbleLeftRightIcon}
          label="Yorumlar"
          value={comments.error && comments.items.length === 0 ? '—' : formatNumber(comments.total, 0)}
          loading={comments.loading}
          hint={weekFilter ? `${weekFilter} haftası` : 'Tüm haftalar (silinenler dahil)'}
        />
      </section>

      <WeeksTable
        list={weeks}
        offset={offset}
        setOffset={setOffset}
        onShowPicks={setPicksFor}
        onShowComments={(w) => {
          setWeekFilter(w.week_id);
          setCommentsOffset(0);
          document.getElementById('picks-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />

      <CommentsCard
        list={comments}
        offset={commentsOffset}
        setOffset={setCommentsOffset}
        weekFilter={weekFilter}
        weekOptions={summaryWeeks.items.map((w) => w.week_id)}
        onWeekFilter={(v) => {
          setWeekFilter(v);
          setCommentsOffset(0);
        }}
        onChanged={() => {
          void comments.mutate();
          void weeks.mutate();
          void summaryWeeks.mutate();
        }}
      />

      <WeekPicksModal
        week={picksFor}
        onClose={() => setPicksFor(null)}
        onChanged={() => {
          void weeks.mutate();
          void summaryWeeks.mutate();
        }}
      />
    </div>
  );
}
