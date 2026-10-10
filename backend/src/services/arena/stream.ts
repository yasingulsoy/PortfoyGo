import type { Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { arenaBus, type ArenaBusEvent } from './bus';
import {
  ArenaService,
  anyTrigger,
  computeMe,
  displayQuote,
  formatPosition,
  loadEntry,
  loadOpenPositions,
  loadRound,
  quoteFor,
  roundLeaderboard,
  roundPaths,
  tickAt,
} from './service';
import type { EntryRow, PositionRow, RoundRow } from './types';

/**
 * GET /api/arena/rounds/:id/stream — Server-Sent Events (bildirim akışıyla aynı başlıklar/heartbeat/temizlik).
 *
 *  event: countdown   {starts_in_ms}                     başlangıçtan önce saniyede bir
 *  event: tick        {tick, server_now, quotes}         her tick (saniyede bir)
 *  event: me          {cash, equity, return_pct, rank}   değişiklikte ve 5 tick'te bir
 *  event: position    <Position>                         açıldı / kapandı / SL / TP / tasfiye
 *  event: leaderboard [...]                              meydan okuma, 5 sn'de bir
 *  event: end         {final, reveal, leaderboard?}      ardından bağlantı kapanır
 *  : ping                                                25 sn'de bir
 */

const HEARTBEAT_MS = 25_000;
const LOOP_MS = 200;
const ME_EVERY_TICKS = 5;
const LEADERBOARD_EVERY_MS = 5000;
const MAX_STREAMS_PER_USER = 5;

const streamsByUser = new Map<string, number>();

export function arenaStreamCount(userId: string): number {
  return streamsByUser.get(userId) ?? 0;
}

export async function openRoundStream(req: Request, res: Response, roundId: string, userId: string): Promise<void> {
  let round = await loadRound(roundId);
  if (!round || (round.kind === 'solo' && round.user_id !== userId)) {
    res.status(404).json({ success: false, message: 'Tur bulunamadı', code: 'NOT_FOUND' });
    return;
  }
  if (arenaStreamCount(userId) >= MAX_STREAMS_PER_USER) {
    res.status(429).json({ success: false, message: 'Çok fazla açık Arena bağlantısı var. Bazı sekmeleri kapatın.' });
    return;
  }
  round = await ArenaService.refreshLifecycle(round);

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);
  streamsByUser.set(userId, arenaStreamCount(userId) + 1);

  let closed = false;
  let ended = false;
  let busy = false;
  let lastTick = -1;
  let lastCountdownSec = -1;
  let lastLeaderboardAt = 0;
  let myRank: number | null = null;
  let entry: EntryRow | null = null;
  let open: PositionRow[] = [];
  let current: RoundRow = round;

  const write = (chunk: string) => {
    if (closed || res.writableEnded) return;
    try {
      res.write(chunk);
    } catch {
      cleanup();
    }
  };
  const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const refreshMine = async () => {
    entry = await loadEntry(roundId, userId);
    open = entry ? await loadOpenPositions(roundId, userId) : [];
  };

  const meNow = () => {
    const paths = roundPaths(current);
    const m = computeMe(current, paths, entry, open, tickAt(current), myRank);
    return { cash: m.cash, equity: m.equity, return_pct: m.return_pct, rank: m.rank };
  };

  // Olayları sırayla işle (eski "me" yenisinin ardından gelmesin)
  let chain: Promise<void> = Promise.resolve();
  const enqueue = (fn: () => Promise<void>) => {
    chain = chain.then(fn).catch((err) => logger.warn({ err }, `[arena] SSE olayı işlenemedi: ${err?.message || err}`));
    return chain;
  };

  const finish = async () => {
    if (ended || closed) return;
    ended = true;
    try {
      await ArenaService.finalizeRound(roundId).catch(() => false);
      current = (await loadRound(roundId)) ?? current;
      await refreshMine();
      const paths = roundPaths(current);
      const final = computeMe(current, paths, entry, open, current.duration_s, entry?.rank ?? null);
      const payload: Record<string, unknown> = { final, reveal: ArenaService.reveal(current) ?? null };
      if (current.status === 'cancelled') payload.cancelled = true;
      if (current.kind === 'challenge') payload.leaderboard = (await roundLeaderboard(current, userId)).items;
      send('end', payload);
    } catch (err: any) {
      logger.warn({ err }, `[arena] SSE bitiş olayı gönderilemedi: ${err?.message || err}`);
    } finally {
      cleanup();
      if (!res.writableEnded) res.end();
    }
  };

  const loop = async () => {
    if (closed || ended || busy) return;
    busy = true;
    try {
      const now = Date.now();
      if (current.status === 'finished' || current.status === 'cancelled' || now >= current.ends_at.getTime()) {
        await enqueue(finish);
        return;
      }
      if (now < current.starts_at.getTime()) {
        const sec = Math.ceil((current.starts_at.getTime() - now) / 1000);
        if (sec !== lastCountdownSec) {
          lastCountdownSec = sec;
          send('countdown', { starts_in_ms: current.starts_at.getTime() - now });
        }
        return;
      }
      if (!current.window) {
        current = await ArenaService.refreshLifecycle(current);
        if (!current.window) return;
      }
      const paths = roundPaths(current);
      if (!paths) return;
      const tick = tickAt(current, now);
      if (tick === lastTick) return;
      lastTick = tick;

      const quotes: Record<string, { bid: number; ask: number; mid: number }> = {};
      for (const code of current.instruments) {
        const q = quoteFor(paths, code, tick);
        if (q) quotes[code] = displayQuote(code, q);
      }
      send('tick', { tick, server_now: new Date(now).toISOString(), quotes });

      if (entry && open.length > 0 && anyTrigger(open, paths, tick)) {
        // Olaylar (position + me) yol üzerinden gelir
        await ArenaService.evaluateEntry(roundId, userId);
      }
      if (current.kind === 'challenge' && now - lastLeaderboardAt >= LEADERBOARD_EVERY_MS) {
        lastLeaderboardAt = now;
        const lb = await roundLeaderboard(current, userId);
        myRank = lb.myRank;
        send('leaderboard', lb.items);
      }
      if (entry && tick % ME_EVERY_TICKS === 0) send('me', meNow());
    } catch (err: any) {
      logger.warn({ err, roundId }, `[arena] SSE döngü hatası: ${err?.message || err}`);
    } finally {
      busy = false;
    }
  };

  const unsubscribe = arenaBus.subscribe(roundId, (e: ArenaBusEvent) => {
    if (closed) return;
    if (e.kind === 'position' && e.userId === userId) {
      const p = e.position;
      open = p.status === 'open' ? [p, ...open.filter((x) => x.id !== p.id)] : open.filter((x) => x.id !== p.id);
      send('position', formatPosition(p, roundPaths(current), tickAt(current)));
    } else if (e.kind === 'me' && e.userId === userId) {
      void enqueue(async () => {
        await refreshMine();
        if (!ended) send('me', meNow());
      });
    } else if (e.kind === 'started') {
      void enqueue(async () => {
        current = (await loadRound(roundId)) ?? current;
      });
    } else if (e.kind === 'finished') {
      void enqueue(finish);
    }
  });

  const interval = setInterval(() => void loop(), LOOP_MS);
  interval.unref?.();
  const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);
  heartbeat.unref?.();

  function cleanup() {
    if (closed) return;
    closed = true;
    clearInterval(interval);
    clearInterval(heartbeat);
    unsubscribe();
    const n = arenaStreamCount(userId) - 1;
    if (n > 0) streamsByUser.set(userId, n);
    else streamsByUser.delete(userId);
  }
  res.on('close', cleanup);
  res.on('error', cleanup);

  write('retry: 3000\n\n');
  await refreshMine();
  if (entry) send('me', meNow());
  void loop();
}
