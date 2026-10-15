'use client';

import { ClockIcon, MegaphoneIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import { useNow } from '@/hooks/useNow';
import { formatClock, formatPrice, type FeedItem } from '@/components/arena/model';
import { Avatar } from '@/components/game/ui';
import { BOT_LABEL } from '@/components/game/ui/VsScreen';
import { PCT_TONE_CLASS, pctTone, signedPct, tugOfWar } from '@/components/game/model';
import type { ArenaHostMessage, ArenaQuote, ArenaRound, ArenaRoundInstrument } from '@/types';

const WARN_MS = 10_000;

/** Kalan süre (ms) ve ilerleme (0..1); sunucu saat farkı düzeltilmiş. */
export function roundClock(round: Pick<ArenaRound, 'starts_at' | 'ends_at' | 'duration_s' | 'status'>, now: number) {
  const start = Date.parse(round.starts_at);
  const end = Date.parse(round.ends_at);
  const total = Number.isFinite(end - start) && end > start ? end - start : round.duration_s * 1000;
  const finished = round.status === 'finished';
  const scheduled = round.status === 'scheduled' || (Number.isFinite(start) && now < start && !finished);
  const remaining = finished ? 0 : scheduled ? total : Math.max(0, end - now);
  const progress = finished ? 1 : scheduled ? 0 : Math.min(1, Math.max(0, 1 - remaining / total));
  return { remaining, progress, finished, scheduled, warn: !finished && !scheduled && remaining <= WARN_MS };
}

/** Büyük süre kapsülü + tur ilerleme çubuğu */
export function TimerPill({ round, clockOffset, className }: { round: ArenaRound; clockOffset: number; className?: string }) {
  const now = useNow(250) + clockOffset;
  const c = roundClock(round, now);
  return (
    <div className={cn('flex min-w-0 flex-col items-center gap-1.5', className)}>
      <div
        className={cn(
          'g-hud g-num h-12 px-4 text-[28px] leading-none',
          c.warn && 'border-(--g-gold-edge) bg-(--g-gold) text-(--g-gold-ink)',
        )}
        role="timer"
        aria-live="off"
        aria-label={c.finished ? 'Tur bitti' : `Kalan süre ${formatClock(c.remaining)}`}
      >
        <ClockIcon className={cn('h-6 w-6', c.warn && 'g-anim-wiggle-loop')} aria-hidden="true" />
        <span className={cn(c.warn && 'g-anim-pop')} key={c.warn ? Math.ceil(c.remaining / 1000) : 'n'}>
          {c.finished ? 'BİTTİ' : formatClock(c.remaining)}
        </span>
      </div>
      <div className="g-progress h-3 w-full max-w-[260px]" role="progressbar" aria-label="Tur ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(c.progress * 100)}>
        <span className="g-progress-fill !transition-[width] !duration-300 !ease-linear" style={{ width: `${c.progress * 100}%`, ['--p-color' as string]: c.warn ? 'var(--g-gold)' : 'var(--g-green)' }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Halat çekme                                                          */
/* ------------------------------------------------------------------ */

export interface TugSide {
  username: string;
  avatarId?: string | null;
  frameId?: string | null;
  returnPct: number | null;
  isBot?: boolean;
}

/** Düello göstergesi: iki uçta avatarlar, ortada getiri farkına göre kayan düğüm. */
export function TugOfWarBar({ me, opponent, finished, className }: { me: TugSide; opponent: TugSide; finished?: boolean; className?: string }) {
  const t = tugOfWar(me.returnPct, opponent.returnPct);
  const oppName = opponent.isBot ? BOT_LABEL : opponent.username;
  const status = finished
    ? t.leader === 'me'
      ? 'Kazandın! 🏆'
      : t.leader === 'opponent'
        ? 'Rakip kazandı'
        : 'Berabere'
    : t.leader === 'me'
      ? 'Öndesin! 💪'
      : t.leader === 'opponent'
        ? 'Rakip önde — toparlan!'
        : 'Başa baş';
  return (
    <section aria-label="Düello durumu" className={cn('g-panel px-3 pb-2.5 pt-3', className)}>
      <p className="sr-only" aria-live="polite">
        {status}. Sen {signedPct(me.returnPct)}, {oppName} {signedPct(opponent.returnPct)}.
      </p>
      <div className="flex items-center gap-2" aria-hidden="true">
        <Avatar avatarId={me.avatarId} seed={me.username} frameId={me.frameId} size={44} />
        <div className="relative h-11 min-w-0 flex-1">
          {/* İki takım yarısı */}
          <div className="absolute inset-x-0 top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded-full border-2 border-(--g-outline-soft)">
            <div className="absolute inset-y-0 left-0 w-1/2 bg-(--g-blue)" />
            <div className="absolute inset-y-0 right-0 w-1/2 bg-(--g-orange)" />
          </div>
          {/* Halat */}
          <div className="absolute inset-x-1 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[repeating-linear-gradient(135deg,var(--g-c-tan)_0_6px,var(--g-c-brown)_6px_10px)] shadow-[0_1px_0_var(--g-drop)]" />
          {/* Orta çizgi */}
          <div className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 rounded-full bg-(--g-on-color) opacity-80" />
          {/* Düğüm / bayrak */}
          <div className="absolute top-0 h-full -translate-x-1/2 transition-[left] duration-700 ease-out motion-reduce:transition-none" style={{ left: `${t.knot}%` }}>
            <span className="g-anim-wiggle-loop absolute -top-1 left-1/2 block h-6 w-1 -translate-x-1/2 rounded-full bg-(--g-c-brown-dark)" />
            <span
              className={cn(
                'absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-(--g-on-color) shadow-[0_3px_0_var(--g-drop)]',
                t.leader === 'me' ? 'bg-(--g-blue)' : t.leader === 'opponent' ? 'bg-(--g-orange)' : 'bg-(--g-red)',
              )}
            />
          </div>
        </div>
        <Avatar avatarId={opponent.avatarId} seed={opponent.username} frameId={opponent.frameId} size={44} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs font-extrabold">
        <span className="min-w-0 truncate">
          Sen <span className={cn('g-num', PCT_TONE_CLASS[pctTone(me.returnPct)])}>{signedPct(me.returnPct)}</span>
        </span>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px]', t.leader === 'me' ? 'bg-(--g-up-soft) text-(--g-up)' : t.leader === 'opponent' ? 'bg-(--g-panel-3)' : 'bg-(--g-panel-2)')}>
          {status}
        </span>
        <span className="min-w-0 truncate text-right">
          <span className={cn('g-num', PCT_TONE_CLASS[pctTone(opponent.returnPct)])}>{signedPct(opponent.returnPct)}</span> {oppName}
        </span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Sunucu mesajı                                                        */
/* ------------------------------------------------------------------ */

export function HostBanner({ message }: { message: ArenaHostMessage }) {
  return (
    <div key={message.at + message.text} className="g-anim-drop-in flex items-start gap-2 rounded-2xl border-2 border-(--g-purple-edge) bg-(--g-purple) px-3 py-2 text-(--g-on-color) shadow-[0_4px_0_var(--g-purple-edge)]" role="status" aria-live="polite">
      <MegaphoneIcon className="g-anim-wiggle mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 text-sm font-extrabold leading-snug">
        <span className="sr-only">Sunucu mesajı: </span>
        {message.text}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Enstrüman çipleri ve kotasyon akışı                                  */
/* ------------------------------------------------------------------ */

export function InstrumentChips({
  instruments,
  quotes,
  selected,
  onSelect,
}: {
  instruments: ArenaRoundInstrument[];
  quotes: Record<string, ArenaQuote>;
  selected: string;
  onSelect: (code: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Enstrümanlar" className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-2 pt-0.5">
      {instruments.map((ins, i) => {
        const q = quotes[ins.code];
        const ch = q?.change_pct_since_start ?? 0;
        const active = ins.code === selected;
        return (
          <button
            key={ins.code}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(ins.code)}
            className="g-chip shrink-0 flex-col !items-start gap-0 px-3 py-1.5 text-left"
            title={`Kısayol ${i + 1}`}
          >
            <span className="text-sm font-extrabold leading-tight">{ins.label}</span>
            <span className={cn('g-num text-[11px] font-extrabold leading-tight', !active && (ch >= 0 ? 'text-(--g-up)' : 'text-(--g-down)'))}>
              {formatPrice(q?.mid, ins.decimals)} · {signedPct(ch)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function GameQuoteFeed({ feed, instruments, className }: { feed: FeedItem[]; instruments: ArenaRoundInstrument[]; className?: string }) {
  const meta = (code: string) => instruments.find((i) => i.code === code) ?? { code, label: code, decimals: 2 };
  return (
    <section aria-label="Fiyat akışı" className={cn('g-panel flex min-h-0 flex-col p-3', className)}>
      <h2 className="g-ribbon g-ribbon--teal mb-2 self-start text-sm">Fiyat akışı</h2>
      {feed.length === 0 ? (
        <p className="py-4 text-center text-sm font-bold text-(--g-ink-soft)">Tur başlayınca fiyatlar akar.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto font-sans" aria-live="off">
          {feed.slice(0, 24).map((f) => {
            const m = meta(f.code);
            return (
              <li key={f.id} className="g-anim-drop-in flex items-center justify-between gap-2 rounded-xl bg-(--g-panel-2) px-2.5 py-1 text-xs">
                <span className="truncate font-bold">{m.label}</span>
                <span className={cn('g-num font-bold', f.dir === 'up' ? 'text-(--g-up)' : f.dir === 'down' ? 'text-(--g-down)' : 'text-(--g-ink-soft)')}>
                  {f.dir === 'up' ? '▲' : f.dir === 'down' ? '▼' : '•'} {formatPrice((f.bid + f.ask) / 2, m.decimals)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
