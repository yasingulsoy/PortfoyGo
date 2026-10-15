'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ApiError, GameApiError, picksApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { mergeComments, picksErrorText } from '@/components/game/picks/model';
import { toProblem, type GameProblem } from '@/components/game/useGameActions';
import type { PickInput, PicksComment, PicksCommentPage, PicksCurrent, PicksWeek } from '@/types';

/* Haftalık Seçim (Kitlelerin Bilgeliği) veri kancaları. */

/** 429 yanıtlarındaki bekleme süresi (sn) */
export function retryAfterOf(err: unknown): number | null {
  const v = err instanceof GameApiError ? Number(err.data?.retry_after) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Uç henüz yoksa / yetki yoksa sürekli yeniden denenmesin. */
const retryUnlessClientError = (err: unknown) => !(err instanceof ApiError && err.status >= 400 && err.status < 500);

/** Canlı yarışta sıralama dakikada bir, diğer evrelerde seyrek yenilenir. */
function refreshFor(week: PicksWeek | null | undefined): number {
  if (!week) return 0;
  return week.phase === 'live' || week.phase === 'settling' ? 60_000 : 5 * 60_000;
}

/** GET /picks/current — sayfayı ve Oyun Merkezi rozetini besler. */
export function usePicksCurrent() {
  const { user } = useAuth();
  return useSWR(user ? picksApi.currentKey : null, () => picksApi.current(), {
    shouldRetryOnError: retryUnlessClientError,
    refreshInterval: (data?: PicksCurrent) => {
      if (!data) return 0;
      const active = refreshFor(data.active);
      return data.previous?.phase === 'settling' ? Math.min(active, 60_000) : active;
    },
    revalidateOnFocus: true,
    dedupingInterval: 4_000,
  });
}

/** Geçmiş haftalar (sayfalı) */
export function usePicksWeeks(limit = 20, offset = 0) {
  return useSWR(picksApi.weeksKey(limit, offset), () => picksApi.weeks(limit, offset), {
    shouldRetryOnError: retryUnlessClientError,
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
}

/** Tek bir haftanın görünümü */
export function usePicksWeek(weekId: string | null) {
  return useSWR(weekId ? picksApi.weekKey(weekId) : null, () => picksApi.week(weekId!), {
    shouldRetryOnError: retryUnlessClientError,
    refreshInterval: (data?: PicksWeek) => refreshFor(data),
    revalidateOnFocus: false,
  });
}

/** Değeri `ms` boyunca değişmezse yansıtır (arama kutusu → sunucu sorgusu). */
export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Seçilebilir varlık araması (GET /picks/assets?q=&type=) */
export function usePicksAssets(q: string, type: string | null, enabled = true) {
  const query = useDebouncedValue(q.trim(), 300);
  return useSWR(enabled ? picksApi.assetsKey(query, type) : null, () => picksApi.assets(query, type), {
    shouldRetryOnError: retryUnlessClientError,
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
}

/* ------------------------------------------------------------------ */
/* Seçim gönder / geri çek                                              */
/* ------------------------------------------------------------------ */

/** Bir haftanın seçim işlemleri; sorumlu oyun hataları (403) oyun penceresinde gösterilir. */
export function usePickActions(weekId: string) {
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState<'submit' | 'withdraw' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<GameProblem | null>(null);

  const refresh = useCallback(
    (week?: PicksWeek | null) => {
      if (week) {
        void mutate(picksApi.currentKey, (cur?: PicksCurrent) => (cur && cur.active.week_id === week.week_id ? { ...cur, active: week } : cur), { revalidate: true });
      } else {
        void mutate(picksApi.currentKey);
      }
      void mutate(picksApi.weekKey(weekId));
    },
    [mutate, weekId],
  );

  const fail = useCallback((err: unknown, title: string) => {
    const code = err instanceof GameApiError ? err.code : null;
    if (code === 'ADULT_CONFIRM_REQUIRED' || code === 'ARENA_BREAK' || (err instanceof ApiError && err.status === 403)) {
      setProblem(toProblem(err, title));
      return;
    }
    setError(picksErrorText(code, err instanceof Error ? err.message : null, retryAfterOf(err)));
  }, []);

  const submit = useCallback(
    async (input: PickInput): Promise<boolean> => {
      if (busy) return false;
      setBusy('submit');
      setError(null);
      try {
        const res = await picksApi.submit(weekId, input);
        refresh(res.week);
        return true;
      } catch (err) {
        fail(err, 'Seçim gönderilemedi');
        if (err instanceof GameApiError && err.code === 'PICKS_CLOSED') refresh();
        return false;
      } finally {
        setBusy(null);
      }
    },
    [busy, fail, refresh, weekId],
  );

  const withdraw = useCallback(async (): Promise<boolean> => {
    if (busy) return false;
    setBusy('withdraw');
    setError(null);
    try {
      const res = await picksApi.withdraw(weekId);
      refresh(res.week);
      return true;
    } catch (err) {
      fail(err, 'Seçim geri çekilemedi');
      if (err instanceof GameApiError && err.code === 'PICKS_CLOSED') refresh();
      return false;
    } finally {
      setBusy(null);
    }
  }, [busy, fail, refresh, weekId]);

  return { submit, withdraw, busy, error, clearError: () => setError(null), problem, clearProblem: () => setProblem(null) };
}

/* ------------------------------------------------------------------ */
/* Tartışma                                                             */
/* ------------------------------------------------------------------ */

interface OlderState {
  weekId: string;
  items: PicksComment[];
  hasMore: boolean | null;
}

/**
 * Haftanın tartışması: son sayfa SWR ile (30 sn'de bir), daha eskiler istek üzerine yüklenir.
 * 409 PICKS_HIDDEN → `hidden` (tartışma açılıştan sonra başlar).
 */
export function usePicksComments(weekId: string | null, enabled = true) {
  const key = weekId && enabled ? picksApi.commentsKey(weekId) : null;
  const latest = useSWR<PicksCommentPage>(key, () => picksApi.comments(weekId!), {
    shouldRetryOnError: retryUnlessClientError,
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });
  const [older, setOlder] = useState<OlderState | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);

  // Hafta değişince eski sayfalar geçersiz (render sırasında türetilir; efekt yok)
  const own = older && older.weekId === weekId ? older : null;
  const items = useMemo(() => mergeComments(own?.items ?? [], latest.data?.items ?? [], removed), [own, latest.data, removed]);
  const hasMore = own ? own.hasMore === true : latest.data?.has_more === true;
  const hidden = latest.error instanceof GameApiError ? latest.error.code === 'PICKS_HIDDEN' || latest.error.status === 409 : latest.error instanceof ApiError && latest.error.status === 409;

  const loadOlder = useCallback(async () => {
    if (!weekId || loadingOlder || !items.length) return;
    setLoadingOlder(true);
    setOlderError(null);
    try {
      // İmleç: en eski yorumun kimliği (sunucu ISO zamanı da kabul eder)
      const page = await picksApi.comments(weekId, 50, items[0].id || items[0].created_at);
      setOlder((prev) => ({
        weekId,
        items: mergeComments(page.items, prev && prev.weekId === weekId ? prev.items : []),
        hasMore: page.has_more,
      }));
    } catch (err) {
      setOlderError(err instanceof Error && err.message ? err.message : 'Eski yorumlar yüklenemedi.');
    } finally {
      setLoadingOlder(false);
    }
  }, [items, loadingOlder, weekId]);

  const post = useCallback(
    async (text: string) => {
      if (!weekId) throw new Error('Hafta bulunamadı.');
      const comment = await picksApi.postComment(weekId, text);
      await latest.mutate((page) => ({ items: mergeComments(page?.items ?? [], comment.id ? [{ ...comment, is_me: true }] : []), has_more: page?.has_more ?? false }), {
        revalidate: true,
      });
      return comment;
    },
    [latest, weekId],
  );

  const remove = useCallback(
    async (id: string) => {
      await picksApi.deleteComment(id);
      setRemoved((prev) => new Set(prev).add(id));
      void latest.mutate();
    },
    [latest],
  );

  return {
    items,
    hasMore,
    hidden,
    error: hidden ? null : (latest.error as unknown),
    isLoading: latest.isLoading && !latest.data,
    loadOlder,
    loadingOlder,
    olderError,
    post,
    remove,
    refresh: () => void latest.mutate(),
  };
}
