'use client';

import { useEffect, useState } from 'react';
import { useGameProfile } from '@/hooks/useGameProfile';
import type { GameResponsibleState } from '@/types';
import { toResponsibleState } from './model';

/**
 * Profildeki sorumlu oyun durumu (profile.responsible). Oyun profili önbelleğini (`/game/profile`)
 * paylaşır; `refresh` tüm profil tüketicilerini (üst çubuk vb.) yeniler.
 */
export function useResponsibleState() {
  const { profile, error, isLoading, mutate } = useGameProfile();
  const state: GameResponsibleState | null = profile ? toResponsibleState(profile.responsible) : null;
  return {
    state,
    /** Profil yüklendi mi (hata dahil, karar verilebilir mi) */
    settled: !!profile || !!error,
    loading: isLoading && !profile,
    error,
    refresh: () => mutate(),
  };
}

/** ISO zaman geçene kadar true; süre dolunca kendiliğinden false olur (yalnızca o an yeniden render). */
export function useUntil(iso: string | null | undefined): boolean {
  const [now, setNow] = useState(() => Date.now());
  const target = iso ? Date.parse(iso) : NaN;

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    // Süre dolmuşsa da (bayat `now`) bir sonraki tikte güncelle
    const ms = Math.max(0, target - Date.now());
    const id = setTimeout(() => setNow(Date.now()), Math.min(ms + 250, 2_147_000_000));
    return () => clearTimeout(id);
  }, [target]);

  return Number.isFinite(target) && target > now;
}
