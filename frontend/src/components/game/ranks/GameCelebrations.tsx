'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useNotificationChanges } from '@/hooks/useNotifications';
import type { AppNotification } from '@/lib/api';
import { isCelebration, markCelebrated } from './celebrations';

const CelebrationPopup = dynamic(() => import('./CelebrationPopup'), { ssr: false });

/**
 * Uygulama geneli: canlı bildirim akışında `game.level_up` / `game.tier_up` gelince bir kez
 * kutlama penceresi (konfeti) gösterir. Sıradaki kutlamalar tek tek gösterilir.
 */
export default function GameCelebrations() {
  const [queue, setQueue] = useState<AppNotification[]>([]);

  useNotificationChanges((change) => {
    if (change.kind !== 'new' || !isCelebration(change.item)) return;
    if (!markCelebrated(change.item.id)) return;
    setQueue((q) => [...q, change.item]);
  });

  const current = queue[0];
  if (!current) return null;
  return <CelebrationPopup key={current.id} item={current} onClose={() => setQueue((q) => q.slice(1))} />;
}
