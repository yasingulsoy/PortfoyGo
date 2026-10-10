'use client';

import { useCallback } from 'react';
import { GlobeAltIcon, LockClosedIcon, StarIcon } from '@heroicons/react/20/solid';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn } from '@portfoygo/shared/format';
import { LEAGUE_STATUS_LABEL } from '@/lib/competition';
import type { LeagueRole, LeagueStatus, LeagueVisibility, PublicLeagueFilter } from '@/types';

/** Kullanıcının lig listesi için SWR anahtarı. */
export const LEAGUES_KEY = 'leagues:mine';
export const leagueKey = (id: string) => ['leagues:detail', id] as const;
export const leagueFeedKey = (id: string) => ['leagues:feed', id] as const;
export const publicLeaguesKey = (search: string, status: PublicLeagueFilter, page: number) => ['leagues:public', search, status, page] as const;
/** Keşfet listesinin tüm sayfalarını yenilemek için anahtar eşleştirici. */
export const isPublicLeaguesKey = (key: unknown) => Array.isArray(key) && key[0] === 'leagues:public';

export const LIMITS = { joined: 10, owned: 5, members: 50 } as const;

/** Field bileşeniyle aynı görünümde textarea / select. */
export const controlClass =
  'w-full rounded-lg border border-line bg-surface px-4 text-sm text-fg placeholder:text-subtle shadow-card transition-[border-color,box-shadow] hover:border-line-strong focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10 disabled:opacity-60';

export function RoleBadge({ role }: { role: LeagueRole }) {
  return role === 'owner' ? (
    <Badge tone="brand">
      <StarIcon className="h-3 w-3" aria-hidden="true" /> Kurucu
    </Badge>
  ) : (
    <Badge>Üye</Badge>
  );
}

const STATUS_TONE = { upcoming: 'brand', active: 'up', finished: 'neutral' } as const;

/** Lig durumu rozeti; devam eden ligde nabız atan "canlı" noktası (azaltılmış harekette sabit). */
export function StatusBadge({ status, className }: { status: LeagueStatus; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status]} className={className}>
      {status === 'active' ? (
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-up" />
        </span>
      ) : (
        <span className={cn('h-1.5 w-1.5 rounded-full', status === 'upcoming' ? 'bg-brand' : 'bg-subtle')} aria-hidden="true" />
      )}
      {LEAGUE_STATUS_LABEL[status]}
    </Badge>
  );
}

export function VisibilityBadge({ visibility }: { visibility: LeagueVisibility }) {
  const Icon = visibility === 'public' ? GlobeAltIcon : LockClosedIcon;
  return (
    <Badge>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {visibility === 'public' ? 'Herkese açık' : 'Özel'}
    </Badge>
  );
}

/** Doluluk çubuğu: "12/50 oyuncu". */
export function MemberBar({ count, max, className }: { count: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((count / max) * 100)) : 0;
  const full = count >= max;
  return (
    <div className={className}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Oyuncular</span>
        <span className={cn('num font-medium', full ? 'text-down' : 'text-fg')}>
          {count}/{max}
          {full && ' · Dolu'}
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-label="Doluluk"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={count}
      >
        <div className={cn('h-full rounded-full transition-[width] duration-500', full ? 'bg-down' : 'bg-brand')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Panoya kopyalar ve sonucu bildirimle gösterir. */
export function useCopy() {
  const toast = useToast();
  return useCallback(
    async (text: string, successTitle: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(successTitle);
      } catch {
        toast.error('Kopyalanamadı', { description: 'Tarayıcın panoya erişime izin vermedi; metni seçip elle kopyalayabilirsin.' });
      }
    },
    [toast],
  );
}

export function inviteLink(code: string) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/leagues/join?code=${encodeURIComponent(code)}`;
}
