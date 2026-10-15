'use client';

import { cn } from '@portfoygo/shared/format';
import Avatar from '@/components/game/ui/Avatar';
import { GameLoader } from '@/components/game/ui/bits';
import { useIdleLeaderboard } from '@/hooks/useIdle';
import type { IdleLeaderboardRow } from '@/types';
import { formatCoins } from './model';

const MEDAL = ['var(--g-tier-gold)', 'var(--g-tier-silver)', 'var(--g-tier-bronze)'];
const MEDAL_EDGE = ['var(--g-tier-gold-edge)', 'var(--g-tier-silver-edge)', 'var(--g-tier-bronze-edge)'];

/** İmparatorluk sıralaması: toplam kazanca göre (halka arzda sıfırlanmaz). */
export default function IdleLeaderboard({ me }: { me?: string | null }) {
  const { data, error, isLoading } = useIdleLeaderboard(true);

  if (isLoading && !data) return <GameLoader label="Sıralama yükleniyor…" className="py-8" />;
  if (error && !data) return <p className="g-panel p-4 text-center text-sm font-bold text-(--g-ink-soft)">Sıralama şu an yüklenemedi.</p>;
  const items = data?.items ?? [];
  if (items.length === 0) return <p className="g-panel p-4 text-center text-sm font-bold text-(--g-ink-soft)">Henüz kimse sıralamada yok. İlk sen ol!</p>;
  const mine = data?.me;
  const inList = mine ? items.some((r) => r.username === mine.username) : false;

  return (
    <div className="g-panel p-2">
      <ol aria-label="İmparatorluk sıralaması" className="divide-y-2 divide-(--g-panel-2)">
        {items.map((r) => (
          <LeaderRow key={`${r.rank}-${r.username}`} row={r} self={r.username === (mine?.username ?? me)} />
        ))}
      </ol>
      {mine && !inList && (
        <div className="mt-2 border-t-2 border-dashed border-(--g-panel-3) pt-2">
          <ol aria-label="Senin sıran">
            <LeaderRow row={mine} self />
          </ol>
        </div>
      )}
      <p className="px-2 pb-1 pt-2 text-[11px] font-semibold text-(--g-ink-faint)">Sıralama ömür boyu toplam kazanca göredir; halka arz sıranı düşürmez.</p>
    </div>
  );
}

function LeaderRow({ row, self }: { row: IdleLeaderboardRow; self: boolean }) {
  const medal = row.rank <= 3 ? row.rank - 1 : -1;
  return (
    <li className={cn('flex items-center gap-3 rounded-2xl px-2 py-2', self && 'bg-(--g-c-bg-2)')} aria-current={self ? 'true' : undefined}>
      <span
        className="g-num grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-sm font-extrabold"
        style={
          medal >= 0
            ? { background: MEDAL[medal], borderColor: MEDAL_EDGE[medal], color: 'var(--g-c-ink)' }
            : { background: 'var(--g-panel-2)', borderColor: 'var(--g-panel-3)' }
        }
      >
        {row.rank}
      </span>
      <Avatar seed={row.username} size={36} ring={false} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-extrabold">
          {row.username}
          {self && <span className="ml-1 text-xs text-(--g-ink-soft)">(sen)</span>}
        </span>
        {row.prestige_shares > 0 && <span className="block text-xs font-bold text-(--g-purple)">{row.prestige_shares} halka arz payı</span>}
      </span>
      <span className="g-num shrink-0 font-extrabold">{formatCoins(row.total_earned)}</span>
    </li>
  );
}
