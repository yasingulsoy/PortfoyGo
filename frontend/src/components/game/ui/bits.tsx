'use client';

import type { ReactNode } from 'react';
import { ChevronLeftIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import Avatar from './Avatar';
import GameButton, { GameLinkButton } from './GameButton';
import { CoinIcon } from './icons';
import { useGameSound } from './sound';

/** Yuvarlak geri düğmesi */
export function BackButton({ href, label = 'Geri', className }: { href: string; label?: string; className?: string }) {
  return <GameLinkButton href={href} variant="ghost" size="md" iconOnly aria-label={label} title={label} icon={<ChevronLeftIcon aria-hidden="true" />} className={cn('w-[46px] shrink-0', className)} />;
}

/** Oyun seslerini aç / kapat (varsayılan kapalı) */
export function SoundToggle({ className }: { className?: string }) {
  const { enabled, setEnabled } = useGameSound();
  return (
    <GameButton
      variant="ghost"
      size="sm"
      iconOnly
      sound={false}
      aria-pressed={enabled}
      aria-label={enabled ? 'Oyun seslerini kapat' : 'Oyun seslerini aç'}
      title={enabled ? 'Ses açık' : 'Ses kapalı'}
      onClick={() => setEnabled(!enabled)}
      icon={enabled ? <SpeakerWaveIcon aria-hidden="true" /> : <SpeakerXMarkIcon aria-hidden="true" />}
      className={cn('w-9 shrink-0', className)}
    />
  );
}

/** Seviye halkalı avatar: avatarın çevresinde XP ilerlemesi, sağ altta seviye rozeti. */
export function LevelAvatar({
  avatarId,
  seed,
  frameId,
  level,
  pct,
  size = 48,
}: {
  avatarId?: string | null;
  seed?: string | null;
  frameId?: string | null;
  level?: number | null;
  pct?: number | null;
  size?: number;
}) {
  const ring = size + 10;
  const r = ring / 2 - 3;
  const c = 2 * Math.PI * r;
  const value = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: ring, height: ring }}>
      <svg width={ring} height={ring} viewBox={`0 0 ${ring} ${ring}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={ring / 2} cy={ring / 2} r={r} fill="none" stroke="var(--g-hud)" strokeWidth={5} />
        <circle
          cx={ring / 2}
          cy={ring / 2}
          r={r}
          fill="none"
          stroke="var(--g-xp)"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <Avatar avatarId={avatarId} seed={seed} frameId={frameId} size={size} ring={false} />
      {level != null && (
        <span
          className="g-title-sm g-num absolute -bottom-1 -right-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-(--g-on-color) bg-(--g-xp) px-1 text-[12px] shadow-[0_2px_0_var(--g-xp-edge)]"
          aria-label={`Seviye ${level}`}
        >
          {level}
        </span>
      )}
    </span>
  );
}

/** Zıplayan jetonla yükleniyor göstergesi */
export function GameLoader({ label = 'Yükleniyor…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-16', className)} role="status" aria-live="polite">
      <span className="g-anim-bounce inline-flex">
        <CoinIcon size={56} />
      </span>
      <p className="g-title-sm text-xl">{label}</p>
    </div>
  );
}

/** Bilgi / hata kutusu (oyun dilinde) */
export function GameNotice({
  icon,
  title,
  children,
  actions,
  tone = 'blue',
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: 'blue' | 'gold' | 'red' | 'green' | 'purple' | 'teal' | 'orange';
  className?: string;
}) {
  return (
    <div className={cn('g-panel flex flex-col items-center gap-2 p-5 text-center', className)} role={tone === 'red' ? 'alert' : 'status'}>
      {icon && <span className="g-anim-float inline-flex text-5xl [&>svg]:h-14 [&>svg]:w-14">{icon}</span>}
      <h2 className={cn('g-ribbon text-lg', `g-ribbon--${tone}`)}>{title}</h2>
      {children && <div className="text-sm font-semibold text-(--g-ink-soft)">{children}</div>}
      {actions && <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">{actions}</div>}
    </div>
  );
}
