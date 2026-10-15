'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { ApiError, GameApiError, idleApi } from '@/lib/api';
import { TAP_BATCH_MAX, TAP_FLUSH_MS, cashAt, takeTapBatch, type CashAnchor } from '@/components/game/idle/model';
import type { IdleBuyQuantity, IdleState } from '@/types';

/** Sunucuyla tam senkron aralığı (sayaç arada istemcide ara değerlenir) */
export const IDLE_SYNC_MS = 30_000;
/** Sunucudaki dokunuş sınırının istemci aynası (saniyede 10, en fazla 20 birikir) */
const TAP_RATE = 10;
const TAP_BURST = TAP_BATCH_MAX;

const retryUnlessMissing = (err: unknown) => !(err instanceof ApiError && [400, 401, 403, 404].includes(err.status));

export function useIdleState() {
  return useSWR(idleApi.stateKey, () => idleApi.state(), {
    refreshInterval: IDLE_SYNC_MS,
    revalidateOnFocus: true,
    dedupingInterval: 2_000,
    shouldRetryOnError: retryUnlessMissing,
  });
}

export function useIdleLeaderboard(enabled: boolean) {
  return useSWR(enabled ? idleApi.leaderboardKey : null, () => idleApi.leaderboard(), {
    refreshInterval: 60_000,
    shouldRetryOnError: retryUnlessMissing,
  });
}

export type IdleActionResult = { ok: true; state: IdleState } | { ok: false; message: string; code: string | null };

const errorResult = (err: unknown, fallback: string): IdleActionResult => ({
  ok: false,
  message: err instanceof Error && err.message ? err.message : fallback,
  code: err instanceof GameApiError ? err.code : null,
});

/**
 * Yatırım İmparatorluğu oyun döngüsü.
 *  - Bakiye: sunucu durumu çapa alınır, arada gelir/sn ile istemcide ilerletilir (`getCash`); her 30 sn'de ve her işlemden sonra
 *    sunucuyla eşitlenir. Satın almaları her zaman sunucu doğrular.
 *  - Dokunuşlar biriktirilir ve ~1 sn'de bir en fazla 20'lik partiler hâlinde gönderilir (sunucu sınırı istemcide de uygulanır).
 */
export function useIdleGame() {
  const swr = useIdleState();
  const { data: state, mutate } = swr;

  const anchor = useRef<CashAnchor>({ cash: 0, income_per_sec: 0, at: 0 });
  const tapValue = useRef(1);
  const pending = useRef(0);
  const inflight = useRef(0);
  const flushing = useRef<Promise<void> | null>(null);
  const bucket = useRef({ tokens: TAP_BURST, last: 0 });
  const [busy, setBusy] = useState<string | null>(null);

  // Yeni sunucu durumu → sayacı yeniden çapala (ref yazımı; durum güncellemesi yok)
  useEffect(() => {
    if (!state) return;
    anchor.current = { cash: state.cash, income_per_sec: state.income_per_sec, at: performance.now() };
    tapValue.current = state.tap_value || 1;
  }, [state]);

  /** Şu anki tahmini bakiye (gösterim için) */
  const getCash = useCallback(
    (now: number = performance.now()) => cashAt(anchor.current, now, (pending.current + inflight.current) * tapValue.current),
    [],
  );

  const flush = useCallback((): Promise<void> => {
    if (flushing.current) return flushing.current;
    const { send, rest } = takeTapBatch(pending.current);
    if (send <= 0) return Promise.resolve();
    pending.current = rest;
    inflight.current += send;
    const p = (async () => {
      try {
        const res = await idleApi.tap(send);
        inflight.current = Math.max(0, inflight.current - send);
        if (Number.isFinite(res.cash)) {
          anchor.current = { ...anchor.current, cash: res.cash, at: performance.now() };
          void mutate((prev) => (prev ? { ...prev, cash: res.cash } : prev), { revalidate: false });
        }
      } catch {
        // Sınır aşıldı / ağ hatası: bu partinin kazancı düşer, sayaç bir sonraki senkronda düzelir
        inflight.current = Math.max(0, inflight.current - send);
      } finally {
        flushing.current = null;
      }
    })();
    flushing.current = p;
    return p;
  }, [mutate]);

  // Dokunuşları ~1 sn'de bir gönder; sekme gizlenince kalanları hemen gönder
  useEffect(() => {
    const id = setInterval(() => {
      if (pending.current > 0) void flush();
    }, TAP_FLUSH_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden' && pending.current > 0) void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flush]);

  /** Bir dokunuş: kabul edilirse kazanılan (tahmini) tutarı döndürür; çok hızlıysa null. */
  const tap = useCallback((): number | null => {
    const now = performance.now();
    const b = bucket.current;
    b.tokens = Math.min(TAP_BURST, b.tokens + (b.last ? ((now - b.last) / 1000) * TAP_RATE : TAP_BURST));
    b.last = now;
    if (b.tokens < 1) return null;
    b.tokens -= 1;
    pending.current += 1;
    return tapValue.current;
  }, []);

  /** Bekleyen dokunuşları gönderip bitmesini bekler (satın almadan önce bakiye doğru olsun) */
  const settleTaps = useCallback(async () => {
    for (let i = 0; i < 5 && (pending.current > 0 || flushing.current); i++) {
      await (flushing.current ?? flush());
    }
  }, [flush]);

  const run = useCallback(
    async (key: string, fn: () => Promise<IdleState>, fallback: string): Promise<IdleActionResult> => {
      setBusy(key);
      try {
        await settleTaps();
        const next = await fn();
        await mutate(next, { revalidate: false });
        return { ok: true, state: next };
      } catch (err) {
        void mutate();
        return errorResult(err, fallback);
      } finally {
        setBusy(null);
      }
    },
    [mutate, settleTaps],
  );

  const buy = useCallback(
    (buildingId: string, quantity: IdleBuyQuantity) => run(`buy:${buildingId}:${quantity}`, () => idleApi.buy(buildingId, quantity), 'Satın alınamadı.'),
    [run],
  );
  const upgrade = useCallback((upgradeId: string) => run(`upgrade:${upgradeId}`, () => idleApi.upgrade(upgradeId), 'Yükseltme alınamadı.'), [run]);
  const prestige = useCallback(() => run('prestige', () => idleApi.prestige(), 'Halka arz yapılamadı.'), [run]);

  return { ...swr, state: state ?? null, getCash, tap, buy, upgrade, prestige, busy };
}

/**
 * Bakiyeyi belirli aralıkla React durumuna yansıtır (satın alma çiplerinin uygunluğu için).
 * Durum yalnızca zamanlayıcı geri çağrısında güncellenir.
 */
export function useLiveCash(getCash: (now?: number) => number, intervalMs = 400): number {
  const [cash, setCash] = useState(0);
  useEffect(() => {
    const tick = () => setCash(getCash());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [getCash, intervalMs]);
  return cash;
}
