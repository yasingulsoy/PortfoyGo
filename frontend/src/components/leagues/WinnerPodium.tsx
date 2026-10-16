import { TrophyIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import ProfileLink from '@/components/profile/ProfileLink';
import { cn } from '@portfoygo/shared/format';
import { formatLeagueDate } from '@/lib/competition';
import type { LeagueMember } from '@/types';

const PLACES = {
  1: { label: 'Şampiyon', bar: 'h-28 sm:h-32 bg-gold-soft border-gold/40', medal: 'bg-gold text-surface', delay: '240ms' },
  2: { label: 'İkinci', bar: 'h-20 sm:h-24 bg-surface-2 border-silver/40', medal: 'bg-silver text-surface', delay: '120ms' },
  3: { label: 'Üçüncü', bar: 'h-14 sm:h-16 bg-surface-2 border-bronze/40', medal: 'bg-bronze text-surface', delay: '0ms' },
} as const;

/** Bitmiş lig için kazanan kutlaması: şampiyon başlığı ve 2-1-3 kürsüsü (giriş animasyonu azaltılmış harekette kapanır). */
export default function WinnerPodium({ members, endsAt }: { members: LeagueMember[]; endsAt: string | null }) {
  const top = members.filter((m) => m.rank != null && m.rank <= 3).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const champion = top.find((m) => m.rank === 1);
  if (!champion) return null;

  return (
    <Card className="relative overflow-hidden border-gold/30">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b from-gold-soft to-transparent" />
      <div className="relative px-5 pt-6 text-center sm:px-6">
        <span className="animate-enter mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gold text-surface shadow-card" aria-hidden="true">
          <TrophyIcon className="h-7 w-7" />
        </span>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-gold">Şampiyon</p>
        <h2 className="mt-1 break-words text-2xl font-bold tracking-tight text-fg">
          {champion.is_me ? 'Tebrikler, şampiyon sensin!' : champion.username}
        </h2>
        <p className="mt-1.5 flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
          {champion.is_me && <span className="font-medium text-fg">{champion.username}</span>}
          {champion.return_pct != null && <Delta value={champion.return_pct} />}
          {endsAt && <span>· {formatLeagueDate(endsAt)} itibarıyla</span>}
        </p>
      </div>

      <ol className="relative mx-auto mt-6 grid max-w-md grid-cols-3 items-end gap-2 px-5 sm:gap-3 sm:px-6" aria-label="Kürsü">
        {/* Okuma sırası 1-2-3; görsel dizilim 2-1-3 */}
        {top.map((m) => {
          const rank = m.rank as 1 | 2 | 3;
          const place = PLACES[rank];
          return (
            <li key={m.user_id} className={cn('flex min-w-0 flex-col items-center', rank === 1 ? 'order-2' : rank === 2 ? 'order-1' : 'order-3')}>
              <UserInitial name={m.username} size={rank === 1 ? 44 : 36} tone={rank === 1 ? 'gold' : m.is_me ? 'brand' : 'neutral'} />
              <p className={cn('mt-1.5 w-full truncate text-center text-xs font-medium sm:text-sm', m.is_me ? 'text-brand' : 'text-fg')}>
                <ProfileLink username={m.username} />
              </p>
              {m.return_pct != null && <Delta value={m.return_pct} variant="text" className="text-xs" />}
              <div
                className={cn('animate-enter mt-2 flex w-full flex-col items-center justify-start rounded-t-xl border border-b-0 pt-2.5', place.bar)}
                style={{ animationDelay: place.delay }}
              >
                <span className={cn('num flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold', place.medal)}>{rank}</span>
                <span className="mt-1 text-[11px] font-medium text-muted">{place.label}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
