'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { ArenaApiError, arenaApi } from '@/lib/api';

export interface ArenaLimit {
  message: string;
  /** İstemci saatiyle tekrar deneme anı (ms) */
  retryAt: number | null;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** 409 ARENA_ROUND_ACTIVE yanıtından devam eden turun kimliği (gövde, mesaj ya da /active). */
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

/**
 * Hızlı tur başlatma: başarıda tur ekranına gider. Devam eden tur varsa (409) ona yönlendirir;
 * günlük sınır (429) mesajı ve tekrar deneme zamanı `limit` içinde döner.
 */
export function useArenaStart() {
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [starting, setStarting] = useState(false);
  const [limit, setLimit] = useState<ArenaLimit | null>(null);

  const start = useCallback(
    async (duration: number, instruments?: string[]) => {
      setStarting(true);
      try {
        const state = await arenaApi.startRound(duration, instruments);
        void mutate(arenaApi.activeKey, state, { revalidate: false });
        setLimit(null);
        router.push(`/arena/round/${encodeURIComponent(state.round.id)}`);
      } catch (err) {
        if (err instanceof ArenaApiError && err.status === 409 && (err.code === 'ARENA_ROUND_ACTIVE' || err.code == null)) {
          const id = await activeRoundId(err);
          if (id) {
            toast.info('Devam eden bir turun var', { description: 'Kaldığın yerden devam ediyorsun.' });
            router.push(`/arena/round/${encodeURIComponent(id)}`);
            return;
          }
        }
        if (err instanceof ArenaApiError && err.status === 429) {
          setLimit({ message: err.message, retryAt: err.retryAfter ? Date.now() + err.retryAfter * 1000 : null });
          toast.info('Tur sınırına ulaştın', { description: err.message });
          return;
        }
        toast.error('Tur başlatılamadı', { description: err instanceof Error ? err.message : 'Lütfen tekrar dene.' });
      } finally {
        setStarting(false);
      }
    },
    [router, toast, mutate],
  );

  return { start, starting, limit };
}
