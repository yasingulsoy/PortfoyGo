'use client';

// Oyun derisi yalnızca bu pencere açılınca yüklenir (oyun dışı sayfalarda da doğru görünsün)
import '@/app/oyun/game.css';
import { useRouter } from 'next/navigation';
import { gameFont } from '@/components/game/ui/font';
import GameButton from '@/components/game/ui/GameButton';
import RewardPopup, { type RewardItem } from '@/components/game/ui/RewardPopup';
import TierBadge from '@/components/game/ui/TierBadge';
import type { AppNotification } from '@/lib/api';
import { tierLabel } from '../shop/model';
import { celebrationCopy } from './celebrations';

function LevelStar({ level }: { level: number | null }) {
  return (
    <svg viewBox="0 0 64 64" width={72} height={72} aria-hidden="true">
      <path
        d="M32 4l8.3 17 18.7 2.6-13.5 13.1 3.2 18.6L32 46.6l-16.7 8.7 3.2-18.6L5 23.6 23.7 21z"
        fill="var(--g-xp)"
        stroke="var(--g-xp-edge)"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <text
        x="32"
        y="40"
        textAnchor="middle"
        fontSize="20"
        fontWeight={800}
        fill="var(--g-on-color)"
        stroke="var(--g-xp-edge)"
        strokeWidth={3}
        paintOrder="stroke"
        style={{ fontFamily: 'var(--font-game), ui-rounded, sans-serif' }}
      >
        {level ?? '★'}
      </text>
    </svg>
  );
}

/** Seviye / kademe atlama kutlaması (bildirim akışından bir kez). */
export default function CelebrationPopup({ item, onClose }: { item: AppNotification; onClose: () => void }) {
  const router = useRouter();
  const c = celebrationCopy(item);
  const rewards: RewardItem[] = [];
  if (c.tier) rewards.push({ kind: 'item', label: `${tierLabel(c.tier)} kademe`, art: <TierBadge tier={c.tier} size="lg" /> });
  else rewards.push({ kind: 'xp', label: c.level ? `Seviye ${c.level}` : 'Yeni seviye', art: <LevelStar level={c.level} /> });
  if (c.coins > 0) rewards.push({ kind: 'coins', amount: c.coins, label: 'Jeton' });

  return (
    <div data-skin="game" className={gameFont.variable}>
      <RewardPopup open title={c.title} subtitle={c.subtitle} rewards={rewards} cta="HARİKA!" onClose={onClose}>
        <GameButton
          variant="blue"
          size="md"
          block
          className="mt-3"
          onClick={() => {
            onClose();
            router.push(c.href);
          }}
        >
          {c.tier ? 'Sıralamaya bak' : 'Oyun Merkezi’ne git'}
        </GameButton>
      </RewardPopup>
    </div>
  );
}
