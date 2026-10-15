'use client';

import { useState } from 'react';
import RewardPopup from '@/components/game/ui/RewardPopup';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { PicksWeek } from '@/types';
import { placedInWeek, rewardSeenKey, weekRangeLabel, weekRewardItems } from './model';

/**
 * Hafta bittiğinde ilk üçe girdiysem ödül penceresi — her hafta için bir kez
 * (localStorage; depolama kullanılamazsa yalnızca bu oturumda bir kez).
 */
export default function RewardCelebration({ week }: { week: PicksWeek | null }) {
  const eligible = week && placedInWeek(week) ? week : null;
  const [seen, setSeen] = useLocalStorage(rewardSeenKey(eligible?.week_id ?? '-'));
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!eligible) return null;

  const items = weekRewardItems(eligible);
  const rank = eligible.my_rank ?? eligible.my_pick?.rank ?? null;
  const open = !seen && dismissed !== eligible.week_id && items.length > 0;

  return (
    <RewardPopup
      open={open}
      title={rank === 1 ? 'Haftanın birincisi!' : `Kürsüdesin: ${rank}.`}
      subtitle={`${weekRangeLabel(eligible.starts_at, eligible.ends_at)} haftası · ${eligible.my_pick?.symbol ?? ''} seçiminle ${
        rank === 1 ? 'haftayı zirvede bitirdin.' : 'ilk üçe girdin.'
      }`}
      rewards={items}
      cta="TOPLA!"
      onClose={() => {
        setDismissed(eligible.week_id);
        setSeen('1');
      }}
    />
  );
}
