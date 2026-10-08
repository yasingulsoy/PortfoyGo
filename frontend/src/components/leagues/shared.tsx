'use client';

import { useCallback } from 'react';
import { StarIcon } from '@heroicons/react/20/solid';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { formatRemaining } from '@/lib/competition';
import type { LeagueRole } from '@/types';

/** Kullanıcının lig listesi için SWR anahtarı. */
export const LEAGUES_KEY = 'leagues:mine';
export const leagueKey = (id: string) => ['leagues:detail', id] as const;

export const LIMITS = { joined: 10, owned: 5, members: 50 } as const;

/** Field bileşeniyle aynı görünümde textarea / select. */
export const controlClass =
  'w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-fg placeholder:text-subtle transition-colors hover:border-line-strong focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60';

export function RoleBadge({ role }: { role: LeagueRole }) {
  return role === 'owner' ? (
    <Badge tone="brand">
      <StarIcon className="h-3 w-3" aria-hidden="true" /> Kurucu
    </Badge>
  ) : (
    <Badge>Üye</Badge>
  );
}

/** Lig bitişini kısa metin olarak verir: "Süresiz", "Sona erdi" ya da "3 gün 4 sa kaldı". */
export function leagueTimeLabel(endsAt: string | null, now: number): { text: string; ended: boolean } {
  if (!endsAt) return { text: 'Süresiz', ended: false };
  const remaining = formatRemaining(endsAt, now);
  return remaining ? { text: `${remaining} kaldı`, ended: false } : { text: 'Sona erdi', ended: true };
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
