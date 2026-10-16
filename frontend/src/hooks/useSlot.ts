'use client';

import useSWR from 'swr';
import { useAuth } from '@/context/AuthContext';
import { GameApiError, slotApi } from '@/lib/api';

/** 4xx (kapalı / yetki / onay) yeniden denenmez. */
const retryUnlessClientError = (err: unknown) => !(err instanceof GameApiError && err.status >= 400 && err.status < 500);

/**
 * Slot Makinesi bilgisi (tablo, RTP, sınırlar, istatistikler). Anahtar `/game/slot`: hub kutusu ve slot ekranı paylaşır.
 * Yönetici kapattıysa sunucu 410 SLOT_DISABLED döner → `disabled` true.
 */
export function useSlotInfo() {
  const { user } = useAuth();
  const swr = useSWR(user ? slotApi.key : null, () => slotApi.info(), {
    shouldRetryOnError: retryUnlessClientError,
    revalidateOnFocus: false,
    dedupingInterval: 5_000,
  });
  const err = swr.error as unknown;
  const disabled = (err instanceof GameApiError && (err.code === 'SLOT_DISABLED' || err.status === 410)) || swr.data?.enabled === false;
  return { ...swr, disabled };
}
