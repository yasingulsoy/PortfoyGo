'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@portfoygo/shared/format';
import { useAuth } from '@/context/AuthContext';
import { useGameProfile } from '@/hooks/useGameProfile';
import { BackButton, LevelAvatar, SoundToggle } from './bits';
import { CoinCounter } from './CoinCounter';
import TierBadge from './TierBadge';

interface Props {
  /** Geri düğmesinin hedefi */
  back?: string;
  backLabel?: string;
  /** Sağda ek öğe (ör. ayar düğmesi) */
  right?: ReactNode;
  className?: string;
}

/**
 * Oyun üst çubuğu: (geri) · seviye halkalı avatar · kullanıcı adı + kademe/puan · jeton sayacı · ses.
 * Avatar dokununca mağazaya (görünüm) gider.
 */
export default function GameTopBar({ back, backLabel, right, className }: Props) {
  const { user } = useAuth();
  const { profile } = useGameProfile();
  const name = user?.username ?? '';

  return (
    <header className={cn('mb-3 flex items-center gap-2 pt-[max(env(safe-area-inset-top),0.25rem)]', className)}>
      {back && <BackButton href={back} label={backLabel} />}
      <Link href="/oyun/magaza" className="g-focus flex min-w-0 flex-1 items-center gap-2 rounded-full" aria-label={`${name || 'Profil'} — görünümü değiştir`}>
        <LevelAvatar avatarId={profile?.avatar_id} seed={name} frameId={profile?.frame_id} level={profile?.level} pct={profile?.level_progress.pct} size={44} />
        <span className="flex min-w-0 flex-col items-start gap-0.5">
          <span className="g-title-sm block max-w-full truncate text-[17px] leading-tight">{name || '…'}</span>
          {profile ? (
            <span className="flex max-w-full items-center gap-1">
              <TierBadge tier={profile.tier} size="sm" />
              <span className="g-num hidden text-xs font-extrabold text-(--g-on-color) opacity-90 min-[400px]:inline">{Math.round(profile.rating).toLocaleString('tr-TR')}</span>
            </span>
          ) : (
            <span className="h-6 w-20 rounded-full bg-(--g-glass)" aria-hidden="true" />
          )}
        </span>
      </Link>
      {profile ? <CoinCounter value={profile.coins} /> : <span className="g-hud w-20" aria-hidden="true" />}
      {right}
      <SoundToggle />
    </header>
  );
}
