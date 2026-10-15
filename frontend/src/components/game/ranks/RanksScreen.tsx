'use client';

import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import useSWR from 'swr';
import { cn } from '@portfoygo/shared/format';
import Avatar from '@/components/game/ui/Avatar';
import GamePanel from '@/components/game/ui/GamePanel';
import GameScreen from '@/components/game/ui/GameScreen';
import TierBadge from '@/components/game/ui/TierBadge';
import { useAuth } from '@/context/AuthContext';
import { useGameProfile } from '@/hooks/useGameProfile';
import { useGameLeaderboard } from '@/hooks/useGameEconomy';
import { arenaSocialApi } from '@/lib/api';
import type { GameLeaderboard, GameLeaderboardRow, GameLeaderboardType } from '@/types';
import { ErrorPanel, LoadingPanel } from '../quests/screenParts';
import { DEFAULT_TIERS, podiumOrder, tierProgress } from './model';

const TABS: { type: GameLeaderboardType; label: string }[] = [
  { type: 'rating', label: 'Puan' },
  { type: 'level', label: 'Seviye' },
];

const fmt = (n: number) => Math.round(n).toLocaleString('tr-TR');

function valueText(row: Pick<GameLeaderboardRow, 'value' | 'level'>, type: GameLeaderboardType) {
  return type === 'rating' ? `${fmt(row.value)} puan` : `Sv. ${row.level ?? '?'} · ${fmt(row.value)} XP`;
}

/** Sıralama: puan / seviye tabloları, kürsü, kademe merdiveni ve düello kaydı. */
export default function RanksScreen() {
  const [type, setType] = useState<GameLeaderboardType>('rating');
  const { data, error, isLoading, mutate } = useGameLeaderboard(type, 50);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = type === 'rating' ? 'level' : 'rating';
    setType(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <GameScreen topBar back="/oyun" backLabel="Oyun Merkezi’ne dön" title="Sıralama">
      <div className="space-y-5">
        <MyStanding board={type === 'rating' ? data : undefined} />

        <div role="tablist" aria-label="Sıralama türü" className="grid grid-cols-2 gap-2">
          {TABS.map((t) => (
            <button
              key={t.type}
              ref={(el) => {
                tabRefs.current[t.type] = el;
              }}
              type="button"
              role="tab"
              id={`rank-tab-${t.type}`}
              aria-selected={type === t.type}
              aria-controls="rank-panel"
              tabIndex={type === t.type ? 0 : -1}
              onClick={() => setType(t.type)}
              onKeyDown={onTabKey}
              className="g-chip h-11 text-base"
            >
              {t.label}
            </button>
          ))}
        </div>

        <div id="rank-panel" role="tabpanel" aria-labelledby={`rank-tab-${type}`} className="space-y-5">
          {error && !data ? (
            <div className="g-panel p-4">
              <ErrorPanel error={error} onRetry={() => void mutate()} />
            </div>
          ) : isLoading && !data ? (
            <LoadingPanel rows={4} className="g-panel p-3" />
          ) : data && data.items.length === 0 ? (
            <div className="g-panel p-6 text-center font-bold text-(--g-ink-soft)">Henüz sıralamada kimse yok. İlk sen ol!</div>
          ) : (
            data && <Board board={data} type={type} />
          )}
        </div>

        <TierLadder />
      </div>
    </GameScreen>
  );
}

/* ------------------------------------------------------------------ */

function MyStanding({ board }: { board?: GameLeaderboard }) {
  const { user } = useAuth();
  const { profile } = useGameProfile();
  const duels = useSWR(arenaSocialApi.myDuelsKey(8), () => arenaSocialApi.myDuels(8), { shouldRetryOnError: false, revalidateOnFocus: true });
  const rec = duels.data?.record;
  const rank = board?.me?.rank ?? null;

  return (
    <section aria-label="Senin durumun" className="g-panel flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <Avatar avatarId={profile?.avatar_id} seed={user?.username} frameId={profile?.frame_id} size="lg" label={user?.username ?? 'Avatarın'} />
        <div className="min-w-0 flex-1">
          <p className="g-font truncate text-xl font-extrabold leading-tight">{user?.username ?? 'Oyuncu'}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {profile && <TierBadge tier={profile.tier} size="sm" />}
            {profile && <span className="g-num text-sm font-extrabold text-(--g-ink-soft)">{fmt(profile.rating)} puan</span>}
          </div>
        </div>
        <div className="g-panel-inset flex shrink-0 flex-col items-center px-3 py-1.5 text-center">
          <span className="text-[11px] font-extrabold uppercase text-(--g-ink-soft)">Sıran</span>
          <span className="g-font g-num text-2xl font-extrabold leading-none">{rank ? `#${rank}` : '—'}</span>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center" aria-label="Düello kaydın">
        {[
          { k: 'Galibiyet', v: rec?.wins, c: '--g-up' },
          { k: 'Beraberlik', v: rec?.draws, c: '--g-ink-soft' },
          { k: 'Mağlubiyet', v: rec?.losses, c: '--g-down' },
        ].map((x) => (
          <div key={x.k} className="g-panel-inset py-1.5">
            <dt className="text-[11px] font-extrabold uppercase text-(--g-ink-soft)">{x.k}</dt>
            <dd className="g-font g-num text-xl font-extrabold leading-tight" style={{ color: `var(${x.c})` }}>
              {x.v ?? (duels.error ? '—' : '…')}
            </dd>
          </div>
        ))}
      </dl>
      {!rank && board && <p className="text-xs font-bold text-(--g-ink-soft)">Puan sıralamasına girmek için bir Arena turu ya da düello oyna.</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ */

const PODIUM: Record<number, { h: string; face: string; edge: string; label: string }> = {
  1: { h: 'h-24', face: '--g-tier-gold', edge: '--g-tier-gold-edge', label: '1' },
  2: { h: 'h-16', face: '--g-tier-silver', edge: '--g-tier-silver-edge', label: '2' },
  3: { h: 'h-12', face: '--g-tier-bronze', edge: '--g-tier-bronze-edge', label: '3' },
};

function Board({ board, type }: { board: GameLeaderboard; type: GameLeaderboardType }) {
  const { user } = useAuth();
  const me = user?.username?.toLowerCase();
  const podium = podiumOrder(board.items);
  const rest = board.items.filter((r) => r.rank > 3);
  const meListed = board.items.some((r) => r.username.toLowerCase() === me);

  return (
    <>
      {/* Kürsü */}
      <ol className="flex items-end justify-center gap-2 px-1 pt-4" aria-label="İlk üç">
        {podium.map((r) => {
          const p = PODIUM[r.rank] ?? PODIUM[3];
          const first = r.rank === 1;
          return (
            <li
              key={r.username}
              className={cn('flex min-w-0 flex-1 flex-col items-center', first && 'order-none')}
              aria-label={`${r.rank}. ${r.username}, ${valueText(r, type)}`}
            >
              <div className="relative flex flex-col items-center" aria-hidden="true">
                {first && (
                  <svg viewBox="0 0 32 20" className="g-anim-float -mb-1 h-6 w-9">
                    <path d="M2 18L4 4l7 7 5-9 5 9 7-7 2 14z" fill="var(--g-gold)" stroke="var(--g-gold-edge)" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                )}
                <Avatar avatarId={r.avatar_id} seed={r.username} frameId={r.frame_id} size={first ? 76 : 58} />
              </div>
              <p className="g-title-sm mt-1 max-w-full truncate text-sm" aria-hidden="true">
                {r.username}
              </p>
              <p className="g-num text-xs font-extrabold text-(--g-on-color) opacity-90" aria-hidden="true">
                {type === 'rating' ? fmt(r.value) : `Sv. ${r.level ?? '?'}`}
              </p>
              <div
                aria-hidden="true"
                className={cn('mt-1 flex w-full items-start justify-center rounded-t-2xl border-[3px] border-b-0 pt-1', p.h)}
                style={{ background: `var(${p.face})`, borderColor: `var(${p.edge})`, boxShadow: `inset 0 3px 0 rgb(255 255 255 / 0.35)` } as CSSProperties}
              >
                <span className="g-title text-2xl">{p.label}</span>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Liste */}
      {(rest.length > 0 || (board.me && !meListed)) && (
        <GamePanel padded={false} className="overflow-hidden">
          <ol aria-label="Sıralama listesi" className="divide-y-2 divide-(--g-panel-2)">
            {rest.map((r) => (
              <Row key={r.username} row={r} type={type} me={r.username.toLowerCase() === me} />
            ))}
          </ol>
          {board.me && !meListed && (
            <div className="border-t-[3px] border-dashed border-(--g-panel-3)">
              <Row row={board.me} type={type} me />
            </div>
          )}
        </GamePanel>
      )}
    </>
  );
}

function Row({ row, type, me }: { row: Omit<GameLeaderboardRow, 'rank'> & { rank: number | null }; type: GameLeaderboardType; me: boolean }) {
  const Tag = row.rank ? 'li' : 'div';
  return (
    <Tag className={cn('flex items-center gap-3 px-3 py-2.5', me && 'bg-(--g-panel-2)')} aria-current={me ? 'true' : undefined}>
      <span className="g-font g-num w-8 shrink-0 text-center text-lg font-extrabold text-(--g-ink-soft)">{row.rank ?? '—'}</span>
      <Avatar avatarId={row.avatar_id} seed={row.username} frameId={row.frame_id} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-extrabold leading-tight">
          {row.username}
          {me && <span className="ml-1.5 rounded-full bg-(--g-blue) px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-(--g-on-color)">Sen</span>}
        </p>
        {row.tier && <TierBadge tier={row.tier} size="sm" className="mt-0.5" />}
      </div>
      <span className="g-num shrink-0 text-right text-sm font-extrabold">{valueText(row, type)}</span>
    </Tag>
  );
}

/* ------------------------------------------------------------------ */

function TierLadder() {
  const { profile } = useGameProfile();
  const rating = profile?.rating ?? null;
  const prog = rating !== null ? tierProgress(rating, DEFAULT_TIERS) : null;
  const steps = [...DEFAULT_TIERS].reverse();

  return (
    <GamePanel title="Kademeler" accent="purple">
      <p className="mb-3 text-sm font-semibold text-(--g-ink-soft)">
        Arena maçları ve düellolar puanını değiştirir. Puanın yükseldikçe kademe atlarsın; kademe çerçeveleri kendiliğinden açılır.
      </p>
      <ol className="space-y-2">
        {steps.map((t, i) => {
          const next = steps[i - 1];
          const here = prog?.current.id === t.id;
          const reached = prog ? prog.index >= DEFAULT_TIERS.findIndex((d) => d.id === t.id) : false;
          return (
            <li
              key={t.id}
              className={cn('flex items-center gap-3 rounded-2xl border-[3px] px-3 py-2', here ? 'border-(--g-gold) bg-(--g-panel-2)' : 'border-transparent')}
              aria-current={here ? 'step' : undefined}
            >
              <TierBadge tier={{ id: t.id, label: t.label }} size="md" className="w-28 shrink-0" />
              <span className={cn('g-num flex-1 text-sm font-extrabold', !reached && 'text-(--g-ink-soft)')}>
                {next ? `${fmt(t.min)}–${fmt(next.min - 1)}` : `${fmt(t.min)}+`} puan
              </span>
              {here && <span className="rounded-full bg-(--g-gold) px-2 py-0.5 text-[11px] font-extrabold uppercase text-(--g-gold-ink)">Buradasın</span>}
            </li>
          );
        })}
      </ol>
      {prog && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs font-extrabold text-(--g-ink-soft)">
            <span>{prog.current.label}</span>
            <span>{prog.next ? `${prog.next.label} kademesine ${fmt(prog.toNext)} puan` : 'En üst kademedesin!'}</span>
          </div>
          <div
            className="g-progress h-4"
            role="progressbar"
            aria-label="Sonraki kademeye ilerleme"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={prog.pct}
          >
            <div className="g-progress-fill" style={{ width: `${prog.pct}%`, '--p-color': 'var(--g-purple)' } as CSSProperties} />
          </div>
        </div>
      )}
    </GamePanel>
  );
}
