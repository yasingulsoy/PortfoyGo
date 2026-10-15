import type { Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { arenaBus, type ArenaBusEvent } from './bus';
import { ArenaService } from './service';
import { ArenaSocial } from './social';
import { publicUsers } from './users';

/**
 * GET /api/arena/broadcast/:token/stream — herkese açık yayın ekranı akışı (oturum gerekmez; CORS site
 * origin'leri için genel CORS ayarından gelir).
 *
 *  event: state        <BroadcastState>                 bağlanınca ve 2 sn'de bir
 *  event: trade        {username, instrument, side, at} yeni açılan pozisyon (TUTAR YOK)
 *  event: reaction     {emoji, username}
 *  event: host_message {text, at}
 *  event: end          <BroadcastState>                 tur bittiğinde / iptal edildiğinde; ardından bağlantı kapanır
 *  : ping                                               25 sn'de bir
 */

const STATE_EVERY_MS = 2000;
const HEARTBEAT_MS = 25_000;
export const MAX_BROADCAST_STREAMS_PER_IP = 6;
export const MAX_BROADCAST_STREAMS_PER_TOKEN = 300;
export const MAX_BROADCAST_STREAMS_TOTAL = 2000;

const byIp = new Map<string, number>();
const byToken = new Map<string, number>();
let total = 0;

const inc = (m: Map<string, number>, k: string, d: number) => {
  const n = (m.get(k) ?? 0) + d;
  if (n > 0) m.set(k, n);
  else m.delete(k);
};

export function broadcastStreamCount(): number {
  return total;
}

/** Kısa ömürlü kullanıcı adı önbelleği (yayın akışındaki işlem olayları için) */
const usernameCache = new Map<string, string>();
async function usernameOf(userId: string): Promise<string> {
  const hit = usernameCache.get(userId);
  if (hit) return hit;
  const name = (await publicUsers([userId])).get(userId)?.username ?? '—';
  usernameCache.set(userId, name);
  if (usernameCache.size > 5000) usernameCache.delete(usernameCache.keys().next().value as string);
  return name;
}

export async function openBroadcastStream(req: Request, res: Response, token: string): Promise<void> {
  const resolved = await ArenaSocial.resolveToken(token);
  if (!resolved) {
    res.status(404).json({ success: false, message: 'Yayın bulunamadı', code: 'NOT_FOUND' });
    return;
  }
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if ((byIp.get(ip) ?? 0) >= MAX_BROADCAST_STREAMS_PER_IP || (byToken.get(token) ?? 0) >= MAX_BROADCAST_STREAMS_PER_TOKEN || total >= MAX_BROADCAST_STREAMS_TOTAL) {
    res.status(429).json({ success: false, message: 'Çok fazla açık yayın bağlantısı var. Biraz sonra tekrar deneyin.', code: 'RATE_LIMITED' });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);
  inc(byIp, ip, 1);
  inc(byToken, token, 1);
  total++;

  let closed = false;
  let ended = false;
  let busy = false;
  const roundId = resolved.roundId;

  const write = (chunk: string) => {
    if (closed || res.writableEnded) return;
    try {
      res.write(chunk);
    } catch {
      cleanup();
    }
  };
  const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const end = async () => {
    if (ended || closed) return;
    ended = true;
    try {
      if (roundId) await ArenaService.finalizeRound(roundId).catch(() => false);
      const st = await ArenaSocial.broadcastState(token, { fresh: true });
      send('end', st);
    } catch (err: any) {
      logger.warn({ err }, `[arena] yayın bitiş olayı gönderilemedi: ${err?.message || err}`);
    } finally {
      cleanup();
      if (!res.writableEnded) res.end();
    }
  };

  const pushState = async () => {
    if (closed || ended || busy) return;
    busy = true;
    try {
      const st = await ArenaSocial.broadcastState(token);
      if (st.status === 'finished' || st.status === 'cancelled') {
        await end();
        return;
      }
      send('state', st);
    } catch (err: any) {
      if (err?.status === 404) {
        // Jeton yenilendi → eski bağlantı kapanır
        send('end', { revoked: true });
        cleanup();
        if (!res.writableEnded) res.end();
      } else {
        logger.warn({ err }, `[arena] yayın durumu hesaplanamadı: ${err?.message || err}`);
      }
    } finally {
      busy = false;
    }
  };

  const unsubscribe = roundId
    ? arenaBus.subscribe(roundId, (e: ArenaBusEvent) => {
        if (closed) return;
        if (e.kind === 'trade') {
          void usernameOf(e.userId).then((username) => send('trade', { username, instrument: e.instrument, side: e.side, at: e.at }));
        } else if (e.kind === 'reaction') {
          send('reaction', { emoji: e.emoji, username: e.username });
        } else if (e.kind === 'host_message') {
          send('host_message', { text: e.text, at: e.at });
        } else if (e.kind === 'finished') {
          void end();
        }
      })
    : () => undefined;

  const interval = setInterval(() => void pushState(), STATE_EVERY_MS);
  interval.unref?.();
  const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);
  heartbeat.unref?.();

  function cleanup() {
    if (closed) return;
    closed = true;
    clearInterval(interval);
    clearInterval(heartbeat);
    unsubscribe();
    inc(byIp, ip, -1);
    inc(byToken, token, -1);
    total = Math.max(0, total - 1);
  }
  res.on('close', cleanup);
  res.on('error', cleanup);

  write('retry: 5000\n\n');
  await pushState();
}
