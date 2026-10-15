'use client';

import { useState } from 'react';
import { cn } from '@portfoygo/shared/format';
import Avatar from '@/components/game/ui/Avatar';
import GameButton from '@/components/game/ui/GameButton';
import GamePanel from '@/components/game/ui/GamePanel';
import { CoinIcon, StarIcon, TrophyIcon } from '@/components/game/ui/icons';
import type { PicksWeek, WeeklyPick } from '@/types';
import { beatText, displayRank, formatClock, podiumPicks, rewardForRank, sortStandings, voidText } from './model';
import { MeTag } from './PickCard';
import { DirectionPill, LiveDot, ReturnText } from './parts';

const LIMIT = 10;

function StandingRow({ pick, rank, showReturn = true }: { pick: WeeklyPick; rank: number | null; showReturn?: boolean }) {
  return (
    <li
      className={cn('flex items-center gap-2.5 px-3 py-2.5', pick.is_me && 'bg-(--g-panel-2) shadow-[inset_4px_0_0_var(--g-blue)]', pick.status === 'void' && 'opacity-60')}
      aria-current={pick.is_me ? 'true' : undefined}
    >
      <span className="g-font g-num w-7 shrink-0 text-center text-lg font-extrabold text-(--g-ink-soft)">
        <span aria-hidden={rank == null || undefined}>{rank ?? '—'}</span>
        <span className="sr-only">{rank != null ? '. sıra' : 'Sıralama dışı'}</span>
      </span>
      <Avatar avatarId={pick.avatar_id} seed={pick.username} frameId={pick.frame_id} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-1.5 font-extrabold leading-tight">
          <span className="truncate">{pick.username}</span>
          {pick.is_me && <MeTag />}
        </p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-bold text-(--g-ink-soft)">
          <span className="truncate">{pick.symbol}</span>
          <DirectionPill direction={pick.direction} size="sm" className="!px-1.5 !py-0.5 text-[10px]" />
        </p>
      </div>
      {showReturn &&
        (pick.status === 'void' ? (
          <span className="shrink-0 text-right text-xs font-extrabold leading-tight text-(--g-ink-soft)" title={voidText(pick)}>
            Fiyat yok
            <span className="block text-[10px] font-bold">sıralama dışı</span>
          </span>
        ) : (
          <ReturnText value={pick.return_pct} className="shrink-0 text-right text-[15px]" />
        ))}
    </li>
  );
}

/** Sıralama listesi: ilk 10 (+ ben listede değilsem altta ben); tümünü göster. */
export function Standings({ week, live, title, className }: { week: PicksWeek; live?: boolean; title?: string; className?: string }) {
  const [all, setAll] = useState(false);
  const list = sortStandings(week.picks);
  const meIdx = list.findIndex((p) => p.is_me);
  const shown = all ? list : list.slice(0, LIMIT);
  const meOutside = !all && meIdx >= LIMIT;

  return (
    <GamePanel
      title={title ?? (live ? 'Canlı sıralama' : 'Sıralama')}
      accent="blue"
      padded={false}
      className={className}
      action={
        live ? (
          <span className="mr-4 inline-flex items-center gap-1.5 text-xs font-extrabold uppercase text-(--g-up)">
            <LiveDot /> Canlı
          </span>
        ) : undefined
      }
    >
      {list.length === 0 ? (
        <p className="px-4 pb-4 text-sm font-bold text-(--g-ink-soft)">Bu hafta seçim yapılmadı.</p>
      ) : (
        // Kurdele panelin üstüne taştığı için kırpma panelde değil, iç sarmalayıcıda
        <div className="overflow-hidden rounded-b-[21px]">
          {week.standings_updated_at && (
            <p className="px-4 pb-2 text-xs font-bold text-(--g-ink-soft)">
              Son güncelleme {formatClock(week.standings_updated_at)}
              {live && ' · dakikada bir yenilenir'}
            </p>
          )}
          <ol aria-label="Sıralama" className="divide-y-2 divide-(--g-panel-2) border-t-2 border-(--g-panel-2)">
            {shown.map((p, i) => (
              <StandingRow key={p.id || `${p.username}:${p.symbol}`} pick={p} rank={displayRank(p, i)} />
            ))}
          </ol>
          {meOutside && (
            <ol aria-label="Senin sıran" className="border-t-[3px] border-dashed border-(--g-panel-3)">
              <StandingRow pick={list[meIdx]} rank={displayRank(list[meIdx], meIdx)} />
            </ol>
          )}
          {list.length > LIMIT && (
            <div className="border-t-2 border-(--g-panel-2) p-3">
              <GameButton variant="plain" size="sm" block onClick={() => setAll((v) => !v)} aria-expanded={all}>
                {all ? 'İlk 10’u göster' : `Tümünü göster (${list.length})`}
              </GameButton>
            </div>
          )}
        </div>
      )}
    </GamePanel>
  );
}

/* ------------------------------------------------------------------ */

const PEDESTAL: Record<number, { h: string; face: string; edge: string }> = {
  1: { h: 'h-24', face: '--g-tier-gold', edge: '--g-tier-gold-edge' },
  2: { h: 'h-16', face: '--g-tier-silver', edge: '--g-tier-silver-edge' },
  3: { h: 'h-12', face: '--g-tier-bronze', edge: '--g-tier-bronze-edge' },
};

/** Kürsü: ilk üç (avatar + çerçeve, getiri, seçilen varlık) */
export function Podium({ week, className }: { week: PicksWeek; className?: string }) {
  const podium = podiumPicks(week.picks);
  if (!podium.length) return null;
  return (
    <ol className={cn('flex items-end justify-center gap-2 px-1 pt-4', className)} aria-label="İlk üç">
      {podium.map((p) => {
        const rank = p.rank ?? 3;
        const ped = PEDESTAL[rank] ?? PEDESTAL[3];
        const first = rank === 1;
        return (
          <li key={p.id || p.username} className="flex min-w-0 flex-1 flex-col items-center" aria-label={`${rank}. ${p.username}, ${p.symbol} ${p.direction === 'up' ? 'yükselir' : 'düşer'}`}>
            <div className="relative flex flex-col items-center" aria-hidden="true">
              {first && (
                <svg viewBox="0 0 32 20" className="g-anim-float -mb-1 h-6 w-9">
                  <path d="M2 18L4 4l7 7 5-9 5 9 7-7 2 14z" fill="var(--g-gold)" stroke="var(--g-gold-edge)" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              )}
              <Avatar avatarId={p.avatar_id} seed={p.username} frameId={p.frame_id} size={first ? 72 : 56} />
            </div>
            <p className="g-title-sm mt-1 flex max-w-full items-center gap-1 text-sm" aria-hidden="true">
              <span className="truncate">{p.username}</span>
            </p>
            <p className="g-num rounded-full bg-(--g-panel) px-2 py-0.5 text-xs shadow-[0_2px_0_var(--g-drop)]" aria-hidden="true">
              <ReturnText value={p.return_pct} />
            </p>
            <p className="mt-0.5 max-w-full truncate text-[11px] font-extrabold text-(--g-on-color)" aria-hidden="true">
              {p.symbol} {p.direction === 'up' ? '▲' : '▼'}
            </p>
            <div
              aria-hidden="true"
              className={cn('mt-1 flex w-full items-start justify-center rounded-t-2xl border-[3px] border-b-0 pt-1', ped.h)}
              style={{ background: `var(${ped.face})`, borderColor: `var(${ped.edge})`, boxShadow: 'inset 0 3px 0 rgb(255 255 255 / 0.35)' }}
            >
              <span className="g-title text-2xl">{rank}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Ödül tablosu: ilk üç + katılım XP */
export function RewardsTable({ week, className }: { week: PicksWeek; className?: string }) {
  const tiers = week.rewards.top;
  if (!tiers.length && !week.rewards.participation_xp) return null;
  return (
    <GamePanel title="Ödüller" accent="gold" className={className}>
      <ul className="space-y-2">
        {tiers.map((t) => (
          <li key={t.rank} className="g-panel-inset flex items-center gap-3 px-3 py-2">
            <span className="g-font g-num flex w-8 shrink-0 items-center gap-0.5 text-lg font-extrabold">
              {t.rank === 1 && <TrophyIcon size={18} />}
              {t.rank}.
            </span>
            <span className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm font-extrabold">
              {t.coins > 0 && (
                <span className="inline-flex items-center gap-1">
                  <CoinIcon size={20} />
                  <span className="g-num">{t.coins.toLocaleString('tr-TR')}</span> jeton
                </span>
              )}
              {t.xp > 0 && (
                <span className="inline-flex items-center gap-1">
                  <StarIcon size={20} />
                  <span className="g-num">{t.xp.toLocaleString('tr-TR')}</span> XP
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {week.rewards.participation_xp > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-(--g-ink-soft)">
          <StarIcon size={18} /> Seçim yapan herkese +{week.rewards.participation_xp} XP
        </p>
      )}
    </GamePanel>
  );
}

/** Hafta sonucu: kürsü, benim sonucum, kitle içgörüsü, ödüller ve sıralama. */
export function ResultsPanel({ week, className }: { week: PicksWeek; className?: string }) {
  const settling = week.phase === 'settling';
  const my = week.my_pick;
  const rank = week.my_rank ?? my?.rank ?? null;
  const tier = rewardForRank(week, rank);
  const insight = beatText(week.crowd?.beat_pct);
  const total = week.crowd?.participants || week.participants;

  return (
    <div className={cn('space-y-4', className)}>
      {settling ? (
        <div className="g-panel flex flex-col items-center gap-2 p-5 text-center" role="status">
          <span className="g-anim-bounce inline-flex">
            <TrophyIcon size={52} />
          </span>
          <h3 className="g-ribbon g-ribbon--orange text-lg">Sonuçlar hesaplanıyor…</h3>
          <p className="text-sm font-semibold text-(--g-ink-soft)">Kapanış fiyatları alınıyor. Kürsü ve ödüller birazdan burada.</p>
        </div>
      ) : (
        <Podium week={week} />
      )}

      <GamePanel title="Senin sonucun" accent={rank != null && rank <= 3 && !settling ? 'gold' : 'blue'}>
        {my ? (
          my.status === 'void' ? (
            <p className="text-sm font-bold text-(--g-ink-soft)">
              {my.symbol}: {voidText(my)}
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold">
                  {my.symbol} · {my.direction === 'up' ? 'Yükselir' : 'Düşer'}
                </p>
                <p className="text-xs font-bold text-(--g-ink-soft)">
                  {rank != null ? (
                    <>
                      <span className="g-num">{rank}.</span> sıra{total ? <> / {total.toLocaleString('tr-TR')} kişi</> : null}
                    </>
                  ) : settling ? (
                    'Sıran hesaplanıyor'
                  ) : (
                    'Sıra yok'
                  )}
                </p>
                {tier && !settling && (
                  <p className="mt-1 inline-flex flex-wrap items-center gap-2 text-xs font-extrabold">
                    <span className="inline-flex items-center gap-1">
                      <CoinIcon size={16} /> +{tier.coins}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <StarIcon size={16} /> +{tier.xp} XP
                    </span>
                  </p>
                )}
              </div>
              <ReturnText value={my.return_pct} className="g-font shrink-0 text-2xl" />
            </div>
          )
        ) : (
          <p className="text-sm font-bold text-(--g-ink-soft)">Bu hafta seçim yapmadın. Bir sonraki hafta zarfını bırakmayı unutma!</p>
        )}
      </GamePanel>

      {(insight || week.crowd?.crowd_return_pct != null) && (
        <GamePanel title="Kitlelerin bilgeliği" accent="teal">
          <div className="flex items-center gap-3">
            <div className="shrink-0 text-center">
              <p className="text-[11px] font-extrabold uppercase text-(--g-ink-soft)">Kitle</p>
              <ReturnText value={week.crowd?.crowd_return_pct} className="g-font text-2xl" />
            </div>
            <p className="min-w-0 text-sm font-bold">{insight ?? 'Kitle portföyünün sonucu.'}</p>
          </div>
        </GamePanel>
      )}

      <Standings week={week} title={settling ? 'Geçici sıralama' : 'Son sıralama'} />
    </div>
  );
}

