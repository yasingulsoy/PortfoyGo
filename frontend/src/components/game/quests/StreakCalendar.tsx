import { cn } from '@portfoygo/shared/format';
import { FlameIcon } from '@/components/game/ui/icons';
import { streakCalendar, type StreakInfo } from './model';

/** 7 günlük seri takvimi: tamamlanan günler alevli, 7. gün bonus (ek çevirme + jeton). */
export function StreakCalendar({ streak, best }: { streak: StreakInfo; best?: number }) {
  const days = streakCalendar(streak);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5">
          <FlameIcon size={30} className={cn(streak.current > 0 && 'g-anim-float')} />
          <span className="g-font text-2xl font-extrabold leading-none">
            {streak.current} <span className="text-base">günlük seri</span>
          </span>
        </span>
        {best !== undefined && best > 0 && <span className="g-chip h-7 px-2 text-xs">En iyi: {best} gün</span>}
      </div>
      <ol className="grid grid-cols-7 gap-1.5" aria-label="Haftalık seri takvimi">
        {days.map((d) => (
          <li
            key={d.day}
            className={cn(
              'relative flex aspect-[3/4] flex-col items-center justify-center rounded-2xl border-[3px] text-center',
              d.state === 'done' && 'border-(--g-orange-edge) bg-(--g-gold-top)',
              d.state === 'today' && 'border-dashed border-(--g-orange) bg-(--g-panel-2)',
              d.state === 'upcoming' && 'border-(--g-panel-3) bg-(--g-panel-2) opacity-75',
            )}
            aria-label={`${d.day}. gün: ${d.state === 'done' ? 'tamamlandı' : d.state === 'today' ? 'bugün, henüz oynamadın' : 'sırada'}${d.bonus ? ' (bonus günü: +1 çevirme ve 100 jeton)' : ''}`}
          >
            {d.state === 'done' ? (
              <FlameIcon size={24} />
            ) : d.bonus ? (
              <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                <rect x="3" y="9" width="18" height="12" rx="2" fill="var(--g-pink)" stroke="var(--g-pink-edge)" strokeWidth="2" />
                <rect x="2" y="6" width="20" height="5" rx="1.5" fill="var(--g-pink-top)" stroke="var(--g-pink-edge)" strokeWidth="2" />
                <path d="M12 6v15M12 6c-2-4-6-3-5-1 .6 1.2 3 1 5 1zm0 0c2-4 6-3 5-1-.6 1.2-3 1-5 1z" fill="none" stroke="var(--g-pink-edge)" strokeWidth="2" />
              </svg>
            ) : (
              <span aria-hidden="true" className="h-5 w-5 rounded-full border-[3px] border-(--g-panel-3)" />
            )}
            <span
              aria-hidden="true"
              className={cn('mt-0.5 text-[11px] font-extrabold leading-none', d.state === 'done' ? 'text-(--g-gold-ink)' : 'text-(--g-ink-soft)')}
            >
              {d.bonus ? 'Bonus' : `${d.day}. gün`}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-(--g-ink-soft)">
        {streak.todayDone ? 'Bugünkü serini aldın, yarın tekrar gel!' : 'Serini sürdürmek için bugün bir Arena turu bitir ya da portföyünde bir işlem yap.'} 7.
        günde <strong>+1 çark hakkı</strong> ve <strong>100 jeton</strong>.
      </p>
    </div>
  );
}
