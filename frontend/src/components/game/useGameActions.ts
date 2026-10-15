'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { ApiError, ArenaApiError, GameApiError, arenaApi, arenaSocialApi } from '@/lib/api';
import { responsibleError } from './model';

export interface GameProblem {
  title: string;
  text: string;
  /** Sorumlu oyun sayfasına bağlantı gösterilsin mi */
  responsible: boolean;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Hata → oyun dilinde mesaj (sorumlu oyun kodları ayrıca işaretlenir). */
export function toProblem(err: unknown, fallbackTitle = 'Bir şeyler ters gitti'): GameProblem {
  const code = err instanceof ArenaApiError || err instanceof GameApiError ? err.code : null;
  const status = err instanceof ApiError ? err.status : undefined;
  const r = responsibleError(code, status);
  if (r) return { ...r, responsible: true };
  if (status === 403 && /yaş|onay|mola/i.test(err instanceof Error ? err.message : '')) {
    return { title: 'Önce kısa bir onay', text: err instanceof Error ? err.message : '', responsible: true };
  }
  return { title: fallbackTitle, text: err instanceof Error && err.message ? err.message : 'Lütfen biraz sonra tekrar dene.', responsible: false };
}

/** 409 ARENA_ROUND_ACTIVE yanıtından devam eden turun kimliği. */
async function activeRoundId(err: ArenaApiError): Promise<string | null> {
  const data = err.data ?? {};
  const direct = data.round_id ?? data.id ?? data.round?.id ?? data.data?.round_id;
  if (typeof direct === 'string' && direct) return direct;
  const fromMessage = UUID.exec(err.message)?.[0];
  if (fromMessage) return fromMessage;
  try {
    return (await arenaApi.active())?.round.id ?? null;
  } catch {
    return null;
  }
}

/** Solo tur başlatma ve düello daveti oluşturma (oyun yolları; hatalar oyun penceresinde gösterilir). */
export function useGameActions() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState<'solo' | 'invite' | null>(null);
  const [problem, setProblem] = useState<GameProblem | null>(null);

  const startSolo = useCallback(
    async (duration: number, instruments?: string[]) => {
      if (busy) return;
      setBusy('solo');
      try {
        const state = await arenaApi.startRound(duration, instruments);
        void mutate(arenaApi.activeKey, state, { revalidate: false });
        router.push(`/oyun/tur/${encodeURIComponent(state.round.id)}`);
      } catch (err) {
        if (err instanceof ArenaApiError && err.status === 409 && (err.code === 'ARENA_ROUND_ACTIVE' || err.code == null)) {
          const id = await activeRoundId(err);
          if (id) {
            router.push(`/oyun/tur/${encodeURIComponent(id)}`);
            return;
          }
        }
        setProblem(toProblem(err, 'Tur başlatılamadı'));
      } finally {
        setBusy(null);
      }
    },
    [busy, mutate, router],
  );

  const createInvite = useCallback(
    async (duration: number) => {
      if (busy) return;
      setBusy('invite');
      try {
        const invite = await arenaSocialApi.createDuel(duration);
        const code = invite.code || invite.duel.code;
        router.push(`/oyun/duello/${encodeURIComponent(code)}?yeni=1`);
      } catch (err) {
        setProblem(toProblem(err, 'Davet oluşturulamadı'));
      } finally {
        setBusy(null);
      }
    },
    [busy, router],
  );

  return { startSolo, createInvite, busy, problem, setProblem, clearProblem: () => setProblem(null) };
}
