'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { useGameResponsible } from '@/hooks/useGameEconomy';
import { gameEconomyApi } from '@/lib/api';
import type { GameBreakDuration, GameResponsibleSettings } from '@/types';

/**
 * Sorumlu oyun ayarları (GET/PUT /game/responsible) ve mola. Değişiklikten sonra oyun profili de
 * yenilenir (kapı / hatırlatıcı / üst çubuk aynı veriyi kullanır).
 */
export function useResponsibleSettings() {
  const { data, error, isLoading, mutate } = useGameResponsible();
  const { mutate: globalMutate } = useSWRConfig();
  const [saving, setSaving] = useState<keyof GameResponsibleSettings | 'break' | null>(null);

  const refreshProfile = () => globalMutate(gameEconomyApi.profileKey);

  const save = async (patch: Partial<GameResponsibleSettings>) => {
    const field = (Object.keys(patch)[0] as keyof GameResponsibleSettings | undefined) ?? null;
    setSaving(field);
    try {
      const next = await gameEconomyApi.updateResponsible(patch);
      await mutate(next, { revalidate: false });
      void refreshProfile();
      return next;
    } finally {
      setSaving(null);
    }
  };

  const takeBreak = async (duration: GameBreakDuration) => {
    setSaving('break');
    try {
      const next = await gameEconomyApi.takeBreak(duration);
      await mutate(next, { revalidate: false });
      await refreshProfile();
      return next;
    } finally {
      setSaving(null);
    }
  };

  return { settings: data, error, loading: isLoading && !data, saving, save, takeBreak };
}
