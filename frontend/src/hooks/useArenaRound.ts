'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { arenaApi, type ArenaOpenRequest } from '@/lib/api';
import {
  INITIAL_STORE,
  roundReducer,
  toFinal,
  toLeaderboardRows,
  toPosition,
  toQuotes,
  toReveal,
} from '@/components/arena/model';
import { toHostMessage, toRoundDuel } from '@/components/game/model';
import type { ArenaMe, ArenaPosition } from '@/types';

const MAX_BACKOFF_MS = 15_000;
/** Bu süreden uzun gizli kalan sekme görünür olunca durum sunucudan yeniden alınır */
const RESYNC_AFTER_HIDDEN_MS = 1_500;

function parse(e: Event): any {
  try {
    return JSON.parse((e as MessageEvent).data);
  } catch {
    return null;
  }
}

const ME_KEYS = ['cash', 'equity', 'return_pct', 'rank', 'trades_count'] as const;

function toMePatch(raw: any): Partial<ArenaMe> {
  const out: Partial<ArenaMe> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of ME_KEYS) {
    if (raw[key] == null) continue;
    const n = Number(raw[key]);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

/**
 * Canlı arena turu: REST anlık görüntüsü + SSE akışı (`/arena/rounds/:id/stream`).
 * - Bağlantı koparsa durum sunucudan yeniden alınır ve üstel geri çekilmeyle yeniden bağlanılır.
 * - Sekme bir süre gizli kaldıysa görünür olunca yeniden eşitlenir.
 * - Tur bitince (`end`) akış kapatılır ve son durum bir kez daha alınır.
 * Kimlik değişirse bileşen `key` ile yeniden kurulmalıdır (durum kimliğe özeldir).
 */
export function useArenaRound(
  id: string,
  opts: {
    onServerClose?: (p: ArenaPosition) => void;
    /** Düello / meydan okumada gelen emoji tepkisi */
    onReaction?: (r: { emoji: string; username: string }) => void;
  } = {},
) {
  const [store, dispatch] = useReducer(roundReducer, INITIAL_STORE);
  const [live, setLive] = useState(false);
  const reloadRef = useRef<() => void>(() => undefined);
  const onServerCloseRef = useRef(opts.onServerClose);
  const onReactionRef = useRef(opts.onReaction);
  useEffect(() => {
    onServerCloseRef.current = opts.onServerClose;
    onReactionRef.current = opts.onReaction;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let disposed = false;
    let finished = false;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let hiddenAt = 0;

    const load = () =>
      arenaApi
        .round(id)
        .then((state) => {
          if (disposed) return;
          dispatch({ type: 'snapshot', state, now: Date.now() });
          if (state.round.status === 'finished') {
            finished = true;
            es?.close();
            es = null;
            setLive(false);
          }
        })
        .catch((error) => {
          if (!disposed) dispatch({ type: 'error', error });
        });
    reloadRef.current = () => void load();

    const connect = () => {
      if (disposed || finished || typeof EventSource === 'undefined') return;
      const source = new EventSource(arenaApi.streamUrl(id), { withCredentials: true });
      es = source;

      source.addEventListener('open', () => {
        // Yeniden bağlanırken kaçırılan tick'ler / pozisyonlar için tam durum
        if (attempt > 0) void load();
        attempt = 0;
        setLive(true);
      });
      source.addEventListener('countdown', (e) => {
        const d = parse(e);
        const ms = Number(d?.starts_in_ms);
        if (Number.isFinite(ms)) dispatch({ type: 'countdown', starts_in_ms: ms, now: Date.now() });
      });
      source.addEventListener('tick', (e) => {
        const d = parse(e);
        const tick = Number(d?.tick);
        if (!d || !Number.isFinite(tick)) return;
        dispatch({ type: 'tick', tick, server_now: typeof d.server_now === 'string' ? d.server_now : undefined, quotes: toQuotes(d.quotes), now: Date.now() });
      });
      source.addEventListener('me', (e) => {
        const patch = toMePatch(parse(e));
        if (Object.keys(patch).length) dispatch({ type: 'me', me: patch });
      });
      source.addEventListener('position', (e) => {
        const d = parse(e);
        if (!d?.id) return;
        const position = toPosition(d);
        dispatch({ type: 'position', position });
        // Sunucunun kendiliğinden kapattığı pozisyonlar (SL / TP / tasfiye) için bildirim
        if (position.status === 'closed' && position.close_reason && position.close_reason !== 'manual' && position.close_reason !== 'round_end') {
          onServerCloseRef.current?.(position);
        }
      });
      source.addEventListener('leaderboard', (e) => {
        const d = parse(e);
        if (d) dispatch({ type: 'leaderboard', rows: toLeaderboardRows(d) });
      });
      source.addEventListener('opponent', (e) => {
        const d = parse(e);
        if (!d) return;
        const equity = Number(d.equity);
        const ret = Number(d.return_pct);
        dispatch({ type: 'opponent', equity: Number.isFinite(equity) ? equity : null, return_pct: Number.isFinite(ret) ? ret : null });
      });
      source.addEventListener('reaction', (e) => {
        const d = parse(e);
        if (d && typeof d.emoji === 'string') onReactionRef.current?.({ emoji: d.emoji, username: typeof d.username === 'string' ? d.username : '' });
      });
      source.addEventListener('host_message', (e) => {
        const message = toHostMessage(parse(e));
        if (message) dispatch({ type: 'host_message', message });
      });
      source.addEventListener('end', (e) => {
        const d = parse(e) ?? {};
        finished = true;
        source.close();
        es = null;
        setLive(false);
        dispatch({
          type: 'end',
          final: d.final ? toFinal(d.final) : null,
          reveal: toReveal(d.reveal),
          leaderboard: d.leaderboard ? toLeaderboardRows(d.leaderboard) : undefined,
          cancelled: d.cancelled === true,
          duel: d.duel ? toRoundDuel(d.duel) : undefined,
          debrief: typeof d.reveal?.debrief === 'string' ? d.reveal.debrief : typeof d.debrief === 'string' ? d.debrief : null,
        });
        // Tur sonunda kapanan pozisyonlar ve kesin sonuçlar
        timer = setTimeout(() => void load(), 600);
      });
      source.addEventListener('error', () => {
        // Tarayıcının kendi yeniden bağlanmasını bırakıp kontrollü geri çekilme uygula
        source.close();
        if (es === source) es = null;
        if (disposed || finished) return;
        attempt += 1;
        setLive(false);
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5);
        timer = setTimeout(() => {
          void load();
          connect();
        }, delay);
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (disposed || finished) return;
      const wasHidden = hiddenAt && Date.now() - hiddenAt > RESYNC_AFTER_HIDDEN_MS;
      hiddenAt = 0;
      if (!wasHidden && es) return;
      void load();
      if (!es) {
        if (timer) clearTimeout(timer);
        attempt = Math.max(attempt, 1);
        connect();
      }
    };

    void load();
    connect();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      es?.close();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [id]);

  const reload = useCallback(() => reloadRef.current(), []);

  const actions = useMemo(
    () => ({
      open: async (body: ArenaOpenRequest) => {
        const res = await arenaApi.openPosition(id, body);
        if (res.position.id) dispatch({ type: 'position', position: res.position });
        if (res.me) dispatch({ type: 'me', me: res.me });
        return res.position;
      },
      close: async (pid: string) => {
        const res = await arenaApi.closePosition(id, pid);
        if (res.position.id) dispatch({ type: 'position', position: res.position });
        if (res.me) dispatch({ type: 'me', me: res.me });
        return res.position;
      },
      closeAll: async () => {
        const res = await arenaApi.closeAll(id);
        if (res.closed.length) dispatch({ type: 'positions', positions: res.closed });
        if (res.me) dispatch({ type: 'me', me: res.me });
        return res.closed;
      },
      updateStops: async (pid: string, body: { stop_loss?: number | null; take_profit?: number | null }) => {
        const position = await arenaApi.updateStops(id, pid, body);
        if (position.id) dispatch({ type: 'position', position });
        return position;
      },
    }),
    [id],
  );

  return { store, live, reload, actions };
}
