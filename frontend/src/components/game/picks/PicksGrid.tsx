'use client';

import { useEffect, useState } from 'react';
import GameButton from '@/components/game/ui/GameButton';
import GamePanel from '@/components/game/ui/GamePanel';
import { useReducedMotion } from '@/components/game/ui/hooks';
import { writeLocal } from '@/hooks/useLocalStorage';
import type { PickDirection, PicksWeek } from '@/types';
import { revealSeenKey, sortStandings } from './model';
import { PickTile } from './PickCard';

const PAGE = 12;
const FLIP_STEP_MS = 90;

function readSeen(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * Açılan tüm seçimler. `revealMoment` ile, bu hafta ilk kez açılışı gören kullanıcıya kartlar
 * sırayla çevrilerek gelir (bir kez; hareket azaltmada animasyonsuz).
 */
export default function PicksGrid({ week, revealMoment, showReturns, className }: { week: PicksWeek; revealMoment?: boolean; showReturns?: boolean; className?: string }) {
  const reduced = useReducedMotion();
  const key = revealSeenKey(week.week_id);
  // İlk görüşte bir kez karar verilir (sonraki yenilemelerde animasyon tekrar etmez)
  const [animate] = useState(() => !!revealMoment && !readSeen(key));
  const [all, setAll] = useState(false);
  const [filter, setFilter] = useState<PickDirection | null>(null);

  useEffect(() => {
    if (animate) writeLocal(key, '1');
  }, [animate, key]);

  const picks = showReturns ? sortStandings(week.picks) : [...(week.picks ?? [])].sort((a, b) => Number(b.is_me) - Number(a.is_me));
  const filtered = filter ? picks.filter((p) => p.direction === filter) : picks;
  const shown = all ? filtered : filtered.slice(0, PAGE);
  const flip = animate && !reduced;

  return (
    <GamePanel title={`Tüm seçimler (${picks.length})`} accent="purple" className={className}>
      {picks.length === 0 ? (
        <p className="text-sm font-bold text-(--g-ink-soft)">Bu hafta kimse seçim yapmadı.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Yöne göre süz">
            {[
              { v: null, label: 'Tümü', icon: '' },
              { v: 'up' as const, label: 'Yükselir', icon: '▲' },
              { v: 'down' as const, label: 'Düşer', icon: '▼' },
            ].map((c) => (
              <button key={c.label} type="button" className="g-chip h-9 px-3 text-sm" aria-pressed={filter === c.v} onClick={() => setFilter(c.v)}>
                {c.icon && <span aria-hidden="true">{c.icon}</span>}
                {c.label}
              </button>
            ))}
          </div>
          <ul className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 @2xl:grid-cols-3" aria-label="Seçimler">
            {shown.map((p, i) => (
              <PickTile key={p.id || `${p.username}:${p.symbol}`} pick={p} flipDelayMs={flip && i < PAGE ? 150 + i * FLIP_STEP_MS : null} showReturn={showReturns} />
            ))}
          </ul>
          {filtered.length > PAGE && (
            <GameButton variant="plain" size="sm" block className="mt-3" onClick={() => setAll((v) => !v)} aria-expanded={all}>
              {all ? 'Daha az göster' : `Tümünü göster (${filtered.length})`}
            </GameButton>
          )}
        </>
      )}
    </GamePanel>
  );
}
