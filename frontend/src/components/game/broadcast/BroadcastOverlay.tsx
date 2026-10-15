'use client';

import { useEffect, useState } from 'react';
import { ClockIcon, GiftIcon, MegaphoneIcon, SparklesIcon, UsersIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import { useNow } from '@/hooks/useNow';
import { ApiError, arenaSocialApi } from '@/lib/api';
import { formatClock, formatCountdown } from '@/components/arena/model';
import { Avatar } from '@/components/game/ui';
import { PCT_TONE_CLASS, pctTone, rankMoves, signedPct, toBroadcastState, toBroadcastTrade, toHostMessage } from '@/components/game/model';
import { FloatingLayer, useFloatingReactions } from '@/components/game/round/Reactions';
import type { ArenaBroadcastRow, ArenaBroadcastState, ArenaBroadcastTrade, ArenaHostMessage } from '@/types';

const MAX_TRADES = 20;
const MAX_BACKOFF_MS = 20_000;

function parse(e: Event): any {
  try {
    return JSON.parse((e as MessageEvent).data);
  } catch {
    return null;
  }
}

interface Board {
  state: ArenaBroadcastState | null;
  moves: Record<string, number>;
  trades: ArenaBroadcastTrade[];
  message: ArenaHostMessage | null;
  /** sunucu saati − istemci saati */
  offset: number;
  ended: boolean;
}

const EMPTY: Board = { state: null, moves: {}, trades: [], message: null, offset: 0, ended: false };

function applyState(b: Board, next: ArenaBroadcastState, ended = false): Board {
  const serverNow = next.server_now ? Date.parse(next.server_now) : NaN;
  const latest = next.messages[next.messages.length - 1] ?? null;
  // Akıştan gelen işlemler ile anlık görüntüdekileri birleştir (en yeni üstte)
  const seen = new Set<string>();
  const trades = [...b.trades, ...next.recent_trades]
    .sort((x, y) => Date.parse(y.at) - Date.parse(x.at))
    .filter((t) => {
      const key = `${t.username}|${t.instrument}|${t.side}|${t.at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_TRADES);
  return {
    state: next,
    moves: b.state ? rankMoves(b.state.leaderboard, next.leaderboard) : {},
    trades,
    message: latest && (!b.message || Date.parse(latest.at) >= Date.parse(b.message.at)) ? latest : b.message,
    offset: Number.isFinite(serverNow) ? serverNow - Date.now() : b.offset,
    ended: b.ended || ended,
  };
}

/** OBS yayın katmanı (16:9): başlık / sponsor / ödül, sayaç, ilk 10, son işlemler şeridi, tepkiler ve sunucu mesajı. */
export default function BroadcastOverlay({ token, transparent }: { token: string; transparent: boolean }) {
  const [board, setBoard] = useState<Board>(EMPTY);
  const [error, setError] = useState<'missing' | 'failed' | null>(null);
  const floating = useFloatingReactions('');

  useEffect(() => {
    let disposed = false;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let finished = false;

    arenaSocialApi
      .broadcast(token)
      .then((s) => {
        if (!disposed) setBoard((b) => applyState(b, s));
      })
      .catch((err) => {
        if (!disposed) setError(err instanceof ApiError && [400, 404].includes(err.status) ? 'missing' : 'failed');
      });

    const connect = () => {
      if (disposed || finished || typeof EventSource === 'undefined') return;
      const source = new EventSource(arenaSocialApi.broadcastStreamUrl(token));
      es = source;
      source.addEventListener('open', () => {
        attempt = 0;
        setError(null);
      });
      source.addEventListener('state', (e) => {
        const d = parse(e);
        if (d) setBoard((b) => applyState(b, toBroadcastState(d)));
      });
      source.addEventListener('trade', (e) => {
        const d = parse(e);
        if (!d) return;
        const t = toBroadcastTrade(d, Date.now());
        setBoard((b) => ({ ...b, trades: [t, ...b.trades].slice(0, MAX_TRADES) }));
      });
      source.addEventListener('reaction', (e) => {
        const d = parse(e);
        if (d && typeof d.emoji === 'string') floating.push(d.emoji, typeof d.username === 'string' ? d.username : '');
      });
      source.addEventListener('host_message', (e) => {
        const m = toHostMessage(parse(e));
        if (m) setBoard((b) => ({ ...b, message: m }));
      });
      source.addEventListener('end', (e) => {
        const d = parse(e);
        finished = true;
        source.close();
        es = null;
        if (d?.revoked) setError('missing');
        else if (d) setBoard((b) => applyState(b, toBroadcastState(d), true));
        else setBoard((b) => ({ ...b, ended: true }));
      });
      source.addEventListener('error', () => {
        source.close();
        if (es === source) es = null;
        if (disposed || finished) return;
        attempt += 1;
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (attempt - 1));
        timer = setTimeout(connect, delay);
      });
    };
    connect();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
    // floating.push kararlıdır (useCallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const bg = transparent ? 'bg-transparent' : 'g-screen g-bg-night';
  // OBS'te saydam kaynak: sayfa gövdesinin zemini de kaldırılır
  const transparentStyle = transparent ? (
    <style href="g-broadcast-transparent" precedence="default">
      {'html,body{background:transparent!important}'}
    </style>
  ) : null;

  if (error === 'missing') {
    return (
      <div className={cn('flex min-h-dvh items-center justify-center p-8 text-center', bg)}>
        <div>
          <p className="g-title text-[clamp(32px,5vw,80px)]">Yayın bulunamadı</p>
          <p className="mt-3 text-[clamp(14px,1.4vw,24px)] font-bold text-(--g-ink-soft)">Bağlantı geçersiz ya da yayın kapatıldı.</p>
        </div>
      </div>
    );
  }

  const s = board.state;
  if (!s) {
    return (
      <div className={cn('flex min-h-dvh items-center justify-center', bg)} role="status">
        <p className="g-title text-[clamp(28px,4vw,64px)]">{error === 'failed' ? 'Bağlantı kuruluyor…' : 'Yayın yükleniyor…'}</p>
      </div>
    );
  }

  return (
    <div className={cn('relative flex min-h-dvh flex-col gap-[1.6vh] overflow-hidden p-[2.2vh_2.4vw] text-(--g-ink)', bg)}>
      {transparentStyle}
      <FloatingLayer items={floating.items} />

      {/* Üst çubuk */}
      <header className="flex items-start justify-between gap-[2vw]">
        <div className="min-w-0">
          <p className="text-[clamp(12px,1.1vw,20px)] font-extrabold uppercase tracking-[0.25em] text-(--g-gold-top)">PortfoyGo Arena · Canlı meydan okuma</p>
          <h1 className="g-title mt-[0.6vh] truncate text-[clamp(28px,3.6vw,72px)]">{s.challenge.title}</h1>
          <div className="mt-[1vh] flex flex-wrap items-center gap-[0.8vw]">
            {s.challenge.sponsor && (
              <span className="inline-flex items-center gap-2 rounded-full border-2 border-(--g-purple-edge) bg-(--g-purple) px-[1vw] py-[0.4vh] text-[clamp(12px,1.2vw,22px)] font-extrabold text-(--g-on-color)">
                <SparklesIcon className="h-[1.2em] w-[1.2em]" aria-hidden="true" />
                Sponsor: {s.challenge.sponsor}
              </span>
            )}
            {s.challenge.prize_text && (
              <span className="inline-flex items-center gap-2 rounded-full border-2 border-(--g-gold-edge) bg-(--g-gold) px-[1vw] py-[0.4vh] text-[clamp(12px,1.2vw,22px)] font-extrabold text-(--g-gold-ink)">
                <GiftIcon className="h-[1.2em] w-[1.2em]" aria-hidden="true" />
                {s.challenge.prize_text}
              </span>
            )}
            <span className="g-hud h-auto px-[1vw] py-[0.4vh] text-[clamp(12px,1.2vw,22px)]">
              <UsersIcon className="h-[1.2em] w-[1.2em]" aria-hidden="true" />
              {s.participants} oyuncu
            </span>
          </div>
        </div>
        <BroadcastClock state={s} offset={board.offset} ended={board.ended} />
      </header>

      {board.message && (
        <div key={board.message.at + board.message.text} className="g-anim-drop-in flex items-center gap-[1vw] rounded-[2vh] border-[3px] border-(--g-purple-edge) bg-(--g-purple) px-[1.4vw] py-[1.2vh] text-(--g-on-color) shadow-[0_6px_0_var(--g-purple-edge)]">
          <MegaphoneIcon className="g-anim-wiggle h-[4vh] w-[4vh] shrink-0" aria-hidden="true" />
          <p className="text-[clamp(16px,1.8vw,36px)] font-extrabold leading-tight">{board.message.text}</p>
        </div>
      )}

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-[1.6vw] md:grid-cols-[1.5fr_1fr]">
        <section className="g-panel min-h-0 p-[1.6vh_1.2vw]" aria-label="İlk 10">
          <h2 className="g-ribbon g-ribbon--gold mb-[1.2vh] text-[clamp(14px,1.4vw,26px)]">İlk 10</h2>
          <Leaderboard rows={s.leaderboard.slice(0, 10)} moves={board.moves} />
        </section>
        <section className="g-panel flex min-h-0 flex-col p-[1.6vh_1.2vw]" aria-label="Son işlemler">
          <h2 className="g-ribbon g-ribbon--teal mb-[1.2vh] self-start text-[clamp(14px,1.4vw,26px)]">Son işlemler</h2>
          {board.trades.length === 0 ? (
            <p className="text-[clamp(14px,1.3vw,24px)] font-bold text-(--g-ink-soft)">İlk işlemler bekleniyor…</p>
          ) : (
            <ul className="min-h-0 flex-1 space-y-[0.8vh] overflow-hidden">
              {board.trades.slice(0, 9).map((t) => (
                <li key={t.id} className="g-anim-drop-in flex items-center gap-[0.8vw] rounded-[1.4vh] bg-(--g-panel-2) px-[0.9vw] py-[0.7vh] text-[clamp(13px,1.25vw,24px)] font-extrabold">
                  <Avatar seed={t.username} size={36} ring={false} />
                  <span className="min-w-0 flex-1 truncate">{t.username}</span>
                  <span className={cn('rounded-lg px-[0.6vw] text-(--g-on-color)', t.side === 'long' ? 'bg-(--g-green)' : 'bg-(--g-red)')}>{t.side === 'long' ? 'AL ▲' : 'SAT ▼'}</span>
                  <span className="shrink-0 text-(--g-ink-soft)">{t.instrument}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <TradeTicker trades={board.trades} />
      <p className="text-center text-[clamp(11px,0.9vw,16px)] font-bold text-(--g-ink-soft)">Sanal para ile oynanan eğitsel bir yarışmadır · Gerçek yatırım değildir · Yatırım tavsiyesi değildir</p>
    </div>
  );
}

function BroadcastClock({ state, offset, ended }: { state: ArenaBroadcastState; offset: number; ended: boolean }) {
  const now = useNow(250) + offset;
  const r = state.round;
  const start = r ? Date.parse(r.starts_at) : NaN;
  const end = r ? Date.parse(r.ends_at) : NaN;
  const finished = ended || state.status === 'finished';
  const before = Number.isFinite(start) && now < start;
  const remaining = finished ? 0 : before ? start - now : Number.isFinite(end) ? Math.max(0, end - now) : 0;
  const total = Number.isFinite(end - start) ? end - start : 1;
  const progress = finished ? 1 : before ? 0 : Math.min(1, Math.max(0, 1 - remaining / total));
  const warn = !finished && !before && remaining <= 10_000;
  return (
    <div className="flex shrink-0 flex-col items-end gap-[0.8vh]">
      <span className={cn('rounded-full px-[1vw] py-[0.3vh] text-[clamp(12px,1.1vw,22px)] font-extrabold text-(--g-on-color)', finished ? 'bg-(--g-purple)' : before ? 'bg-(--g-blue)' : 'bg-(--g-red)')}>
        {finished ? 'BİTTİ' : before ? 'BAŞLIYOR' : '● CANLI'}
      </span>
      <span className={cn('g-hud g-num h-auto px-[1.2vw] py-[0.6vh] text-[clamp(28px,4vw,80px)] leading-none', warn && 'bg-(--g-gold) text-(--g-gold-ink)')} role="timer">
        <ClockIcon className="h-[0.8em] w-[0.8em]" aria-hidden="true" />
        {finished ? '0:00' : before ? formatCountdown(remaining) : formatClock(remaining)}
      </span>
      <div className="g-progress h-[1.2vh] w-[18vw] min-w-[160px]">
        <span className="g-progress-fill" style={{ width: `${progress * 100}%`, ['--p-color' as string]: warn ? 'var(--g-gold)' : 'var(--g-green)' }} />
      </div>
    </div>
  );
}

/** Sıra değişince satırlar yeni yerlerine kayar (FLIP: konum transform ile) */
function Leaderboard({ rows, moves }: { rows: ArenaBroadcastRow[]; moves: Record<string, number> }) {
  if (rows.length === 0) return <p className="text-[clamp(14px,1.3vw,24px)] font-bold text-(--g-ink-soft)">Sıralama tur başlayınca görünür.</p>;
  return (
    <ol className="relative" style={{ height: `calc(${rows.length} * var(--row))`, ['--row' as string]: 'clamp(40px, 5.6vh, 76px)' }}>
      {rows.map((r, i) => {
        const move = moves[r.username] ?? 0;
        return (
          <li
            key={r.username}
            className="absolute inset-x-0 top-0 flex items-center gap-[0.8vw] px-[0.4vw] transition-transform duration-700 ease-out motion-reduce:transition-none"
            style={{ transform: `translateY(calc(${i} * var(--row)))`, height: 'var(--row)' }}
          >
            <span
              className={cn(
                'g-num flex h-[80%] aspect-square shrink-0 items-center justify-center rounded-full border-[3px] text-[clamp(14px,1.5vw,28px)] font-extrabold',
                r.rank === 1 ? 'border-(--g-gold-edge) bg-(--g-gold) text-(--g-gold-ink)' : r.rank === 2 ? 'border-(--g-tier-silver-edge) bg-(--g-tier-silver) text-(--g-c-ink)' : r.rank === 3 ? 'border-(--g-tier-bronze-edge) bg-(--g-tier-bronze) text-(--g-on-color)' : 'border-(--g-panel-edge) bg-(--g-panel-2)',
              )}
            >
              {r.rank}
            </span>
            <Avatar seed={r.username} size={40} ring={false} />
            <span className="min-w-0 flex-1 truncate text-[clamp(15px,1.6vw,30px)] font-extrabold">{r.username}</span>
            {move !== 0 && (
              <span className={cn('g-anim-pop text-[clamp(12px,1.1vw,20px)] font-extrabold', move > 0 ? 'text-(--g-up)' : 'text-(--g-down)')} key={`${r.username}-${r.rank}`}>
                {move > 0 ? `▲${move}` : `▼${-move}`}
              </span>
            )}
            <span className={cn('g-num w-[8ch] text-right text-[clamp(15px,1.6vw,30px)] font-extrabold', PCT_TONE_CLASS[pctTone(r.return_pct)])}>{signedPct(r.return_pct)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Alt şerit: son işlemler kayan yazı (tutar yok). Hareket azaltmada sabit. */
function TradeTicker({ trades }: { trades: ArenaBroadcastTrade[] }) {
  if (!trades.length) return null;
  const items = trades.slice(0, 12);
  const line = items.map((t) => `${t.username} ${t.side === 'long' ? 'AL ▲' : 'SAT ▼'} ${t.instrument}`).join('   •   ');
  return (
    <div className="g-hud h-auto overflow-hidden rounded-full px-0 py-[0.6vh]" aria-hidden="true">
      <div className="flex w-max whitespace-nowrap text-[clamp(13px,1.2vw,22px)] motion-safe:animate-[g-ticker_40s_linear_infinite]">
        <span className="px-[2vw]">{line}</span>
        <span className="px-[2vw]">{line}</span>
      </div>
      <style href="g-ticker" precedence="default">
        {'@keyframes g-ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}'}
      </style>
    </div>
  );
}
