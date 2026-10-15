'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ApiError, GameApiError, scenariosApi } from '@/lib/api';

const retryUnlessMissing = (err: unknown) => !(err instanceof ApiError && [400, 401, 403, 404].includes(err.status));

/** Yayındaki senaryolar (oturum varsa en iyi getirim ile) */
export function useScenarioList() {
  return useSWR(scenariosApi.listKey, () => scenariosApi.list(), { revalidateOnFocus: false, shouldRetryOnError: retryUnlessMissing });
}

/** Senaryo ayrıntısı: brifing + (bitirildiyse) "Ne oldu?" */
export function useScenarioDetail(idOrSlug: string | null) {
  return useSWR(idOrSlug ? scenariosApi.detailKey(idOrSlug) : null, () => scenariosApi.detail(idOrSlug!), {
    revalidateOnFocus: false,
    shouldRetryOnError: retryUnlessMissing,
  });
}

/** Bir turun senaryo bilgisi (başlık, brifing, debrief, sonuç) */
export function useScenarioRound(roundId: string | null) {
  return useSWR(roundId ? scenariosApi.roundKey(roundId) : null, () => scenariosApi.round(roundId!), {
    revalidateOnFocus: false,
    shouldRetryOnError: retryUnlessMissing,
  });
}

/** Son bitmiş senaryo turları */
export function useRecentScenarioRounds() {
  return useSWR(scenariosApi.recentKey, () => scenariosApi.recent(), { revalidateOnFocus: false, shouldRetryOnError: retryUnlessMissing });
}

export interface ScenarioStartError {
  message: string;
  code: string | null;
  /** Devam eden turun kimliği (ARENA_ROUND_ACTIVE) */
  activeRoundId: string | null;
  retryAfter: number | null;
}

function toStartError(err: unknown): ScenarioStartError {
  const code = err instanceof GameApiError ? err.code : null;
  const data = err instanceof GameApiError ? err.data : null;
  const active = data?.round_id ?? data?.active_round_id ?? data?.round?.id ?? null;
  const retry = Number(data?.retry_after);
  let message = err instanceof Error && err.message ? err.message : 'Tur başlatılamadı.';
  if (code === 'ARENA_ROUND_ACTIVE') message = 'Devam eden bir turun var. Önce onu bitir.';
  else if (code === 'ARENA_LIMIT' || code === 'ARENA_PERSONAL_LIMIT') message = err instanceof Error && err.message ? err.message : 'Bu saat için tur sınırına ulaştın. Biraz mola ver.';
  return { message, code, activeRoundId: active ? String(active) : null, retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null };
}

/** Senaryo turunu başlatır ve oyun tur ekranına geçer. */
export function useStartScenario() {
  const router = useRouter();
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<ScenarioStartError | null>(null);

  const start = useCallback(
    async (scenarioId: string, durationS: number) => {
      setStarting(scenarioId);
      setError(null);
      try {
        const state = await scenariosApi.start(scenarioId, durationS);
        const id = state.round.id;
        if (!id) throw new Error('Tur oluşturulamadı.');
        router.push(`/oyun/tur/${encodeURIComponent(id)}`);
        return true;
      } catch (err) {
        setError(toStartError(err));
        setStarting(null);
        return false;
      }
    },
    [router],
  );

  return { start, starting, error, clearError: () => setError(null) };
}
