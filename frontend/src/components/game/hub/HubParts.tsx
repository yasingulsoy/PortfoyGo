'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { PlayIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import { useArenaChallenges } from '@/hooks/useArena';
import { useNow } from '@/hooks/useNow';
import { arenaSocialApi } from '@/lib/api';
import { durationLabel, formatCountdown } from '@/components/arena/model';
import {
  Avatar,
  FlameIcon,
  GameButton,
  GameDialog,
  GameLinkButton,
  GamePanel,
  ShieldIcon,
  TierBadge,
  TrophyIcon,
  XpBar,
} from '@/components/game/ui';
import { BOT_LABEL } from '@/components/game/ui/VsScreen';
import { outcomeCopy, PCT_TONE_CLASS, pctTone, signedPct } from '@/components/game/model';
import type { ArenaChallenge, ArenaDuelResult, GameProfile } from '@/types';

/* ------------------------------------------------------------------ */
/* Kahraman kartı                                                       */
/* ------------------------------------------------------------------ */

export function HubHero({ profile, username }: { profile: GameProfile | undefined; username: string }) {
  return (
    <section aria-label="Oyuncu kartı" className="g-glass relative mb-5 flex items-center gap-3 rounded-[28px] p-3 sm:gap-4 sm:p-4">
      <div className="g-anim-float shrink-0">
        <Avatar avatarId={profile?.avatar_id} seed={username} frameId={profile?.frame_id} size={96} label={`${username} avatarı`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="g-title truncate text-[26px] leading-tight">{username}</p>
        {profile?.title && <p className="truncate text-xs font-extrabold text-(--g-gold-top)">« {profile.title} »</p>}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {profile ? <TierBadge tier={profile.tier} /> : <span className="h-7 w-24 rounded-full bg-(--g-glass)" aria-hidden="true" />}
          {profile && (
            <span className="g-hud g-num h-7 text-sm" aria-label={`Puan ${Math.round(profile.rating)}`}>
              <TrophyIcon size={20} />
              {Math.round(profile.rating).toLocaleString('tr-TR')}
            </span>
          )}
          {profile && profile.streak.current > 0 && (
            <span className="g-hud g-num h-7 text-sm" aria-label={`${profile.streak.current} günlük seri`}>
              <FlameIcon size={20} />
              {profile.streak.current}
            </span>
          )}
        </div>
        <XpBar
          className="mt-2"
          level={profile?.level ?? 1}
          pct={profile?.level_progress.pct ?? 0}
          caption={profile ? `${Math.round(profile.level_progress.xp_in_level).toLocaleString('tr-TR')} / ${Math.round(profile.level_progress.needed).toLocaleString('tr-TR')} XP` : undefined}
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Süre seçici                                                          */
/* ------------------------------------------------------------------ */

export function DurationChips<T extends number>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center justify-center gap-2">
      {options.map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={value === d}
          data-active={value === d}
          onClick={() => onChange(d)}
          className="g-chip g-num h-9 min-w-[64px] px-3 text-sm"
        >
          {durationLabel(d)}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Devam eden tur                                                       */
/* ------------------------------------------------------------------ */

export function ActiveRoundBanner({ roundId, label }: { roundId: string; label: string }) {
  return (
    <div className="g-panel g-anim-drop-in mb-4 flex items-center gap-3 border-(--g-gold-edge) bg-[linear-gradient(180deg,var(--g-gold-top),var(--g-gold))] p-3 text-(--g-gold-ink)">
      <span className="g-anim-wiggle-loop inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-(--g-on-color) text-(--g-gold-edge)">
        <PlayIcon className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-extrabold leading-tight">Devam eden bir turun var!</p>
        <p className="truncate text-xs font-bold opacity-80">{label}</p>
      </div>
      <GameLinkButton href={`/oyun/tur/${encodeURIComponent(roundId)}`} variant="green" size="sm">
        Devam et
      </GameLinkButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Solo tur penceresi                                                   */
/* ------------------------------------------------------------------ */

const SOLO_DURATIONS = [60, 180, 300, 600] as const;

export function SoloDialog({ open, onClose, onStart, busy }: { open: boolean; onClose: () => void; onStart: (d: number) => void; busy: boolean }) {
  return (
    <GameDialog open={open} onClose={onClose} title="Solo Tur" accent="purple">
      <p className="mb-4 text-center text-sm font-semibold text-(--g-ink-soft)">
        10.000 $ sanal bakiyeyle başla. Fiyatlar gerçek bir geçmiş dönemin hızlandırılmış tekrarı.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {SOLO_DURATIONS.map((d, i) => (
          <GameButton
            key={d}
            variant={(['green', 'blue', 'purple', 'orange'] as const)[i]}
            size="lg"
            block
            loading={busy}
            onClick={() => onStart(d)}
            data-autofocus={d === 180 ? true : undefined}
          >
            {durationLabel(d)}
          </GameButton>
        ))}
      </div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] font-bold text-(--g-ink-faint)">
        <ShieldIcon size={16} />
        Sanal para — gerçek yatırım değildir.
      </p>
    </GameDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Meydan okumalar penceresi                                            */
/* ------------------------------------------------------------------ */

function ChallengeRow({ c, now }: { c: ArenaChallenge; now: number }) {
  const startsIn = Date.parse(c.starts_at) - now;
  const live = c.status === 'live' || startsIn <= 0;
  return (
    <li>
      <Link
        href={`/oyun/meydan-okuma/${encodeURIComponent(c.id)}`}
        className="g-panel-inset g-focus flex items-center gap-3 p-3 transition-transform active:translate-y-0.5"
      >
        <span
          className={cn(
            'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 text-lg font-extrabold',
            live ? 'border-(--g-red-edge) bg-(--g-red) text-(--g-on-color)' : 'border-(--g-blue-edge) bg-(--g-blue) text-(--g-on-color)',
          )}
          aria-hidden="true"
        >
          {live ? '●' : '⏰'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-extrabold">{c.title}</span>
          <span className="block truncate text-xs font-bold text-(--g-ink-soft)">
            {[c.sponsor, c.prize_text].filter(Boolean).join(' · ') || `${durationLabel(c.duration_s)} · ${c.participants} oyuncu`}
          </span>
        </span>
        <span className={cn('g-num shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold', live ? 'bg-(--g-down-soft) text-(--g-down)' : 'bg-(--g-panel-3) text-(--g-ink)')}>
          {live ? 'CANLI' : formatCountdown(startsIn)}
        </span>
      </Link>
    </li>
  );
}

export function ChallengesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const live = useArenaChallenges('live');
  const upcoming = useArenaChallenges('upcoming');
  const now = useNow(1000);
  const items = [...(live.data ?? []), ...(upcoming.data ?? [])];
  const loading = !live.data && !upcoming.data && !live.error && !upcoming.error;
  return (
    <GameDialog open={open} onClose={onClose} title="Meydan Okumalar" accent="orange">
      {loading ? (
        <p className="py-6 text-center font-bold text-(--g-ink-soft)">Yükleniyor…</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center font-bold text-(--g-ink-soft)">Şu an açık bir meydan okuma yok. Yakında yenileri gelecek!</p>
      ) : (
        <ul className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {items.map((c) => (
            <ChallengeRow key={c.id} c={c} now={now} />
          ))}
        </ul>
      )}
      <p className="mt-4 text-center text-[11px] font-bold text-(--g-ink-faint)">Herkes aynı fiyat akışıyla, aynı anda oynar. Ödüller sponsor tarafından verilir.</p>
    </GameDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Son düellolar şeridi                                                 */
/* ------------------------------------------------------------------ */

const RESULT_STYLE: Record<ArenaDuelResult, string> = {
  win: 'bg-(--g-green) border-(--g-green-edge)',
  loss: 'bg-(--g-blue) border-(--g-blue-edge)',
  draw: 'bg-(--g-purple) border-(--g-purple-edge)',
};

export function RecentDuels() {
  const { data, error } = useSWR(arenaSocialApi.myDuelsKey(8), () => arenaSocialApi.myDuels(8), { shouldRetryOnError: false, revalidateOnFocus: true });
  const record = data?.record;
  // Kabul edilmemiş / süresi dolmuş davetler şeritte yer almaz (bekleyen davet ayrıca gösterilir)
  const items = (data?.items ?? []).filter((d) => d.opponent || d.status === 'waiting');
  return (
    <GamePanel
      title="Son Maçlar"
      accent="purple"
      className="mt-8"
      action={
        record ? (
          <span className="g-num text-xs font-extrabold text-(--g-ink-soft)" aria-label={`${record.wins} galibiyet, ${record.losses} mağlubiyet, ${record.draws} beraberlik`}>
            {record.wins}G · {record.losses}M · {record.draws}B
          </span>
        ) : null
      }
    >
      {items.length === 0 ? (
        <p className="py-3 text-center text-sm font-bold text-(--g-ink-soft)">
          {error ? 'Maç geçmişi şu an yüklenemedi.' : data ? 'Henüz maç yok — Hızlı Maç ile ilk düellonu yap!' : 'Yükleniyor…'}
        </p>
      ) : (
        <ul className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-2 pt-1" aria-label="Son düellolar">
          {items.map((d) => {
            const result = d.result;
            const opp = d.opponent;
            if (!opp) {
              return (
                <li key={d.id} className="w-[104px] shrink-0 snap-start">
                  <Link href={`/oyun/duello/${encodeURIComponent(d.code)}`} className="g-panel-inset g-focus flex h-full flex-col items-center justify-center gap-1 px-2 py-2.5 text-center">
                    <span className="g-anim-bounce text-3xl" aria-hidden="true">
                      ✉️
                    </span>
                    <span className="text-xs font-extrabold">Davet bekliyor</span>
                    <span className="g-num text-[11px] font-bold text-(--g-ink-soft)">{d.code}</span>
                  </Link>
                </li>
              );
            }
            const name = opp.is_bot ? 'Bot 🤖' : opp.username;
            const card = (
              <>
                <Avatar avatarId={opp.avatar_id} seed={opp.username} size={44} />
                <span className="mt-1 block w-full truncate text-xs font-extrabold">{name}</span>
                {result ? (
                  <span className={cn('mt-1 rounded-full border-2 px-2 py-0.5 text-[10px] font-extrabold text-(--g-on-color)', RESULT_STYLE[result])}>
                    {outcomeCopy(result).title.replace('!', '')}
                  </span>
                ) : (
                  <span className="mt-1 rounded-full bg-(--g-panel-3) px-2 py-0.5 text-[10px] font-extrabold">SÜRÜYOR</span>
                )}
                <span className={cn('g-num mt-1 text-xs font-extrabold', PCT_TONE_CLASS[pctTone(d.my_return_pct)])}>{signedPct(d.my_return_pct)}</span>
              </>
            );
            return (
              <li key={d.id} className="w-[104px] shrink-0 snap-start">
                {d.round_id ? (
                  <Link
                    href={`/oyun/tur/${encodeURIComponent(d.round_id)}`}
                    className="g-panel-inset g-focus flex h-full flex-col items-center px-2 py-2.5 text-center"
                    aria-label={`${opp.is_bot ? BOT_LABEL : opp.username} ile maç: ${result ? outcomeCopy(result).title : 'sürüyor'}, getirin ${signedPct(d.my_return_pct)}`}
                  >
                    {card}
                  </Link>
                ) : (
                  <div className="g-panel-inset flex h-full flex-col items-center px-2 py-2.5 text-center">{card}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </GamePanel>
  );
}
