'use client';

import type { CSSProperties, ReactNode } from 'react';
import { EyeSlashIcon, LockClosedIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import Avatar from '@/components/game/ui/Avatar';
import GamePanel, { type GameAccent } from '@/components/game/ui/GamePanel';
import type { PicksPhase, WeeklyPick } from '@/types';
import { NOTE_HIDDEN_TEXT, formatDayTime, formatQuote, formatShortDateTime, voidText } from './model';
import { AssetBadge, DirectionPill, ReturnText, assetTypeLabel } from './parts';
import styles from './picks.module.css';

/** "Sen" etiketi */
export function MeTag({ className }: { className?: string }) {
  return <span className={cn('shrink-0 rounded-full bg-(--g-blue) px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-(--g-on-color)', className)}>Sen</span>;
}

/** Yöneticinin gizlediği not */
export function HiddenNote({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-center gap-1.5 text-xs font-bold italic text-(--g-ink-faint)', className)}>
      <EyeSlashIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {NOTE_HIDDEN_TEXT}
    </p>
  );
}

/** Varlık satırı: rozet + ad + sembol · tür */
export function AssetLine({ pick, size = 44, className }: { pick: Pick<WeeklyPick, 'asset_type' | 'symbol' | 'name'>; size?: number; className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <AssetBadge type={pick.asset_type} symbol={pick.symbol} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-extrabold leading-tight">{pick.name}</span>
        <span className="block truncate text-xs font-bold text-(--g-ink-soft)">
          {pick.symbol} · {assetTypeLabel(pick.asset_type)}
        </span>
      </span>
    </span>
  );
}

/** Seçimin fiyat özeti (giriş → güncel / kapanış → getiri) */
function PriceStrip({ pick, phase }: { pick: WeeklyPick; phase: PicksPhase }) {
  const closed = phase === 'finished' || phase === 'settling';
  const last = closed ? (pick.exit_price ?? pick.current_price) : pick.current_price;
  const cells = [
    { k: 'Giriş', v: formatQuote(pick.entry_price, pick.quote_currency, pick.asset_type) },
    { k: closed ? 'Kapanış' : 'Güncel', v: formatQuote(last, pick.quote_currency, pick.asset_type) },
  ];
  return (
    <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
      {cells.map((c) => (
        <div key={c.k} className="g-panel-inset min-w-0 px-1.5 py-1.5">
          <dt className="text-[10.5px] font-extrabold uppercase text-(--g-ink-soft)">{c.k}</dt>
          <dd className="g-num truncate text-sm font-extrabold" title={c.v}>
            {c.v}
          </dd>
        </div>
      ))}
      <div className="g-panel-inset min-w-0 px-1.5 py-1.5">
        <dt className="text-[10.5px] font-extrabold uppercase text-(--g-ink-soft)">Getiri</dt>
        <dd className="text-sm">
          <ReturnText value={pick.return_pct} />
        </dd>
      </div>
    </dl>
  );
}

/** Benim seçimim (gizli evrede mühürlü; yarışta fiyat ve getiriyle) */
export function MyPickCard({
  pick,
  phase,
  revealAt,
  rank,
  actions,
  title = 'Senin seçimin',
  accent = 'green',
  className,
}: {
  pick: WeeklyPick;
  phase: PicksPhase;
  revealAt?: string;
  rank?: number | null;
  actions?: ReactNode;
  title?: string;
  accent?: GameAccent;
  className?: string;
}) {
  const hidden = phase === 'submit' || phase === 'upcoming';
  const showPrices = phase === 'live' || phase === 'settling' || phase === 'finished';
  return (
    <GamePanel title={title} accent={accent} className={className}>
      <div className="flex items-center gap-3">
        <AssetLine pick={pick} size={52} className="flex-1 text-lg" />
        <DirectionPill direction={pick.direction} size="lg" />
      </div>
      {pick.note ? (
        <p className="g-panel-inset mt-3 break-words px-3 py-2 text-sm font-semibold italic text-(--g-ink-soft)">“{pick.note}”</p>
      ) : (
        pick.note_hidden && <HiddenNote className="mt-3" />
      )}
      {showPrices && pick.status !== 'void' && <PriceStrip pick={pick} phase={phase} />}
      {showPrices && rank != null && pick.status !== 'void' && (
        <p className="mt-2 text-center text-sm font-extrabold">
          Sıran: <span className="g-num">{rank}.</span>
        </p>
      )}
      {pick.status === 'void' && (
        <p className="mt-3 rounded-2xl bg-(--g-down-soft) px-3 py-2 text-center text-sm font-bold text-(--g-down)">
          {voidText(pick)}
        </p>
      )}
      {hidden && (
        <p className="mt-3 flex items-start gap-2 text-xs font-bold text-(--g-ink-soft)">
          <LockClosedIcon className="mt-0.5 h-4 w-4 shrink-0 text-(--g-purple)" aria-hidden="true" />
          <span>
            Mühürlü: açılışa {revealAt ? <>({formatDayTime(revealAt)}) </> : null}kadar yalnızca sen görebilirsin.
            {pick.submitted_at && <> Gönderildi: {formatShortDateTime(pick.submitted_at)}.</>}
          </span>
        </p>
      )}
      {actions && <div className="mt-4">{actions}</div>}
    </GamePanel>
  );
}

/** Açılıştaki seçim kartı; `flip` verilirse arka yüzden çevrilerek gelir (bir kez). */
export function PickTile({ pick, flipDelayMs, showReturn }: { pick: WeeklyPick; flipDelayMs?: number | null; showReturn?: boolean }) {
  const flip = flipDelayMs != null;
  return (
    <li className={cn('min-w-0', flip && styles.flipCard)} style={flip ? ({ '--flip-delay': `${flipDelayMs}ms` } as CSSProperties) : undefined}>
      <div className={cn('h-full', flip && styles.flipInner)}>
        <article
          className={cn(
            'g-panel-inset flex h-full flex-col gap-2 p-3',
            flip && styles.flipFace,
            pick.is_me && 'border-(--g-blue) shadow-[0_0_0_2px_var(--g-blue)]',
            pick.status === 'void' && 'opacity-60',
          )}
          aria-label={`${pick.username}: ${pick.name}, ${pick.direction === 'up' ? 'yükselir' : 'düşer'}`}
        >
          <header className="flex min-w-0 items-center gap-2">
            <Avatar avatarId={pick.avatar_id} seed={pick.username} frameId={pick.frame_id} size={32} />
            <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{pick.username}</span>
            {pick.is_me && <MeTag />}
          </header>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <AssetLine pick={pick} size={36} className="text-sm" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <DirectionPill direction={pick.direction} size="sm" />
            {showReturn && pick.status !== 'void' && <ReturnText value={pick.return_pct} className="text-sm" />}
            {pick.status === 'void' && (
              <span className="text-[11px] font-extrabold text-(--g-ink-soft)" title={voidText(pick)}>
                Sıralama dışı
              </span>
            )}
          </div>
          {pick.note ? (
            <p className="line-clamp-4 break-words text-[13px] font-semibold leading-snug text-(--g-ink-soft)">“{pick.note}”</p>
          ) : (
            pick.note_hidden && <HiddenNote />
          )}
        </article>
        {flip && (
          <div aria-hidden="true" className={cn(styles.flipBack, 'flex items-center justify-center rounded-2xl border-[3px] border-(--g-purple-edge) bg-(--g-purple)')}>
            <span className="flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-(--g-red-edge) bg-(--g-red) text-(--g-on-color)">
              <LockClosedIcon className="h-6 w-6" />
            </span>
          </div>
        )}
      </div>
    </li>
  );
}
