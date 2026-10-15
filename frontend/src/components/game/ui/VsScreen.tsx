'use client';

import { useEffect, type ReactNode } from 'react';
import { cn } from '@portfoygo/shared/format';
import Avatar from './Avatar';
import TierBadge from './TierBadge';
import { TrophyIcon } from './icons';
import { playSound } from './sound';

export interface VsPlayer {
  username: string;
  avatarId?: string | null;
  frameId?: string | null;
  rating?: number | null;
  tier?: { id?: string; label?: string } | string | null;
  isBot?: boolean;
  level?: number | null;
}

interface Props {
  me: VsPlayer;
  opponent: VsPlayer;
  /** Alt satır (ör. "3 dk · Maç başlıyor…") */
  subtitle?: ReactNode;
  /** Tam ekran yerine kapsayıcıyı kaplar */
  contained?: boolean;
  children?: ReactNode;
}

/** Botun açıkça etiketlenmiş adı */
export const BOT_LABEL = 'Antrenman Botu 🤖';

function Side({ p, side }: { p: VsPlayer; side: 'left' | 'right' }) {
  const name = p.isBot ? BOT_LABEL : p.username;
  return (
    <div className={cn('flex min-w-0 flex-col items-center gap-2 px-3 text-center', side === 'left' ? 'g-anim-slide-left' : 'g-anim-slide-right')}>
      <Avatar avatarId={p.avatarId} seed={p.username} frameId={p.frameId} size={112} label={name} className="sm:!h-[140px] sm:!w-[140px]" />
      <p className="g-title max-w-full truncate text-2xl sm:text-3xl">{name}</p>
      {p.isBot && <p className="max-w-[16rem] text-xs font-bold text-(--g-on-color) opacity-90">Gerçek oyuncu bulunamadı; pratik için bota karşı oynuyorsun.</p>}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {p.tier && !p.isBot && <TierBadge tier={p.tier} size="sm" />}
        {p.rating != null && !p.isBot && (
          <span className="g-hud g-num h-7 text-sm">
            <TrophyIcon size={20} />
            {Math.round(p.rating).toLocaleString('tr-TR')}
          </span>
        )}
      </div>
    </div>
  );
}

/** Eşleşme ekranı: iki yarım (mavi / turuncu), kayarak gelen avatarlar ve ortada sallanan "VS". */
export default function VsScreen({ me, opponent, subtitle, contained, children }: Props) {
  useEffect(() => {
    playSound('match');
  }, []);

  return (
    <div className={cn('z-50 overflow-hidden', contained ? 'absolute inset-0' : 'fixed inset-0')} role="dialog" aria-modal="true" aria-label={`Eşleşme: ${me.username} ve ${opponent.isBot ? BOT_LABEL : opponent.username}`}>
      {/* Arka plan yarımları (dar ekranda üst/alt, genişte sol/sağ; çapraz kesik) */}
      <div className="absolute inset-0 bg-[linear-gradient(160deg,var(--g-blue-top),var(--g-blue)_55%,var(--g-blue-edge))] [clip-path:polygon(0_0,100%_0,100%_44%,0_56%)] sm:[clip-path:polygon(0_0,56%_0,44%_100%,0_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(200deg,var(--g-orange-top),var(--g-orange)_50%,var(--g-red-edge))] [clip-path:polygon(0_56%,100%_44%,100%_100%,0_100%)] sm:[clip-path:polygon(56%_0,100%_0,100%_100%,44%_100%)]" />
      <div className="absolute inset-0 bg-[repeating-conic-gradient(from_0deg_at_50%_50%,var(--g-ray)_0deg_7deg,transparent_7deg_18deg)]" aria-hidden="true" />

      <div className="relative grid h-full grid-rows-2 items-center sm:grid-cols-2 sm:grid-rows-1">
        <div className="flex justify-center pt-6 sm:pt-0">
          <Side p={me} side="left" />
        </div>
        <div className="flex justify-center pb-16 sm:pb-0">
          <Side p={opponent} side="right" />
        </div>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="g-anim-pulse-ring absolute inset-0 rounded-full bg-(--g-gold-top)" aria-hidden="true" />
        <span className="g-anim-pop relative flex h-24 w-24 items-center justify-center rounded-full border-4 border-(--g-gold-edge) bg-[radial-gradient(circle_at_35%_30%,var(--g-gold-top),var(--g-gold))] shadow-[0_6px_0_var(--g-gold-edge)] sm:h-28 sm:w-28">
          <span className="g-title g-anim-shake text-5xl sm:text-6xl" style={{ animationDelay: '500ms' }}>
            VS
          </span>
        </span>
      </div>

      {(subtitle || children) && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] text-center">
          {subtitle && <p className="g-title-sm text-lg">{subtitle}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
