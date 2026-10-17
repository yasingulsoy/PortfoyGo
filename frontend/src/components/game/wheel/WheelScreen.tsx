'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@portfoygo/shared/format';
import GameButton from '@/components/game/ui/GameButton';
import GameColumns from '@/components/game/ui/GameColumns';
import GamePanel from '@/components/game/ui/GamePanel';
import GameScreen from '@/components/game/ui/GameScreen';
import RewardPopup, { type RewardItem } from '@/components/game/ui/RewardPopup';
import Avatar from '@/components/game/ui/Avatar';
import { FlameIcon, ShieldIcon } from '@/components/game/ui/icons';
import { useReducedMotion } from '@/components/game/ui/hooks';
import { playSound } from '@/components/game/ui/sound';
import { useGameProfile } from '@/hooks/useGameProfile';
import { useGameWheel } from '@/hooks/useGameEconomy';
import { GameApiError, gameEconomyApi } from '@/lib/api';
import type { GameReward, GameWheelSegment, GameWheelSpinResult, GameWheelState } from '@/types';
import { Countdown } from '../quests/Countdown';
import { ErrorPanel } from '../quests/screenParts';
import { nextIstanbulMidnight } from '../quests/time';
import { formatPct, rewardSummary, sliceColor, spinTargetRotation } from './model';
import { SpinWheel } from './SpinWheel';

const SPIN_MS = 5600;
const REDUCED_SPIN_MS = 450;
const SPIN_TURNS = 7;

/** Kısa sorumluluk notu (her zaman görünür) */
export const WHEEL_DISCLAIMER = 'Çark ücretsizdir; ödüller yalnızca oyun içinde geçerlidir, gerçek değeri yoktur.';

type Phase = 'idle' | 'requesting' | 'spinning' | 'done';

function rewardItems(reward: GameReward, segment: GameWheelSegment, avatarId?: string | null): RewardItem[] {
  const items: RewardItem[] = [];
  if (reward.coins) items.push({ kind: 'coins', amount: reward.coins, label: 'Jeton' });
  if (reward.xp) items.push({ kind: 'xp', amount: reward.xp, label: 'XP' });
  if (reward.extra_spin) items.push({ kind: 'spin', amount: reward.extra_spin, label: 'Ekstra çevirme' });
  if (reward.item_id)
    items.push({
      kind: 'item',
      label: segment.label || 'Yeni kozmetik',
      art: <Avatar avatarId={avatarId} frameId={reward.item_id} size="lg" label={segment.label} />,
    });
  if (reward.converted_coins) items.push({ kind: 'coins', amount: reward.converted_coins, label: 'Jeton (zaten sahiptin)' });
  return items.length ? items : [{ kind: 'coins', label: segment.label || 'Ödül' }];
}

/** Günlük Çark: sunucu sonucu belirler, çark tam o dilimde durur; olasılıklar her zaman görünür. */
export default function WheelScreen() {
  const { data: wheel, error, isLoading, mutate } = useGameWheel();
  const { profile, mutate: mutateProfile } = useGameProfile();
  const reduced = useReducedMotion();

  const [rotation, setRotation] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<GameWheelSpinResult | null>(null);
  const [popup, setPopup] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [fallbackReset, setFallbackReset] = useState(() => nextIstanbulMidnight());
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finished = useRef(true);

  const segments = wheel?.segments ?? [];
  const free = wheel?.free_available ?? false;
  const extra = wheel?.extra_spins ?? 0;
  const hasSpin = free || extra > 0;
  const busy = phase === 'requesting' || phase === 'spinning';

  const finish = (res: GameWheelSpinResult | null) => {
    if (finished.current) return;
    finished.current = true;
    if (finishTimer.current) clearTimeout(finishTimer.current);
    setPhase('done');
    if (res) {
      setAnnounce(`Çark durdu: ${res.segment.label}. ${rewardSummary(res.reward, res.segment.label)}`);
      setPopup(true);
    }
    void mutate();
    void mutateProfile();
  };

  const spin = async () => {
    if (busy || !hasSpin || segments.length === 0) return;
    setPhase('requesting');
    setMessage(null);
    setAnnounce('Çark dönüyor…');
    try {
      const res = await gameEconomyApi.spin(segments);
      const ms = reduced ? REDUCED_SPIN_MS : SPIN_MS;
      const target = spinTargetRotation(rotation, res.segment_index, segments.length, reduced ? 0 : SPIN_TURNS, Math.random() * 2 - 1);
      finished.current = false;
      setResult(res);
      setDurationMs(ms);
      setRotation(target);
      setPhase('spinning');
      playSound('go');
      // Hak sayısını hemen düşür (sunucu yanıtı dönüş bitince yeniden çekilir)
      void mutate(
        (w?: GameWheelState) => (w ? { ...w, free_available: false, extra_spins: w.free_available ? w.extra_spins : Math.max(0, w.extra_spins - 1) } : w),
        { revalidate: false },
      );
      // transitionend gelmezse (sekme gizli, aynı açı vb.) yine de bitir
      finishTimer.current = setTimeout(() => finish(res), ms + 600);
    } catch (err) {
      setPhase('idle');
      setAnnounce('');
      if (err instanceof GameApiError && (err.code === 'ADULT_CONFIRM_REQUIRED' || err.code === 'ARENA_BREAK')) {
        void mutateProfile();
        setMessage(err.message);
      } else if (err instanceof GameApiError && err.code === 'NO_SPINS') {
        setMessage('Çevirme hakkın kalmadı. Yeni ücretsiz hakkın gece yarısı gelecek.');
        void mutate();
      } else {
        setMessage(err instanceof Error ? err.message : 'Çark çevrilemedi. Lütfen tekrar dene.');
      }
    }
  };

  const nextFree = wheel?.next_free_at ? Date.parse(wheel.next_free_at) : fallbackReset;

  return (
    <GameScreen topBar back="/oyun" backLabel="Oyun Merkezi’ne dön" title="Günlük Çark" layout="wide">
      <div className="space-y-5">
        <p className="g-title-sm -mt-2 text-base">Her gün 1 ücretsiz çevirme. Şansını dene!</p>

        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {announce}
        </p>

        {/* Telefonda tek sütun; masaüstünde solda çark (kaydırırken sabit), sağda olasılıklar ve bilgiler */}
        <GameColumns
          split="6/6"
          stickyMain
          main={
            <section aria-labelledby="wheel-heading" className="flex flex-col items-center gap-5">
              <h2 id="wheel-heading" className="sr-only">
                Şans çarkı
              </h2>
              <div className="w-full max-w-[22rem] px-2 pt-4 lg:max-w-[26rem] xl:max-w-[28rem]">
                {error && !wheel ? (
                  <div className="g-panel p-4">
                    <ErrorPanel error={error} onRetry={() => void mutate()} />
                  </div>
                ) : isLoading && !wheel ? (
                  <div
                    className="mx-auto aspect-square w-full animate-pulse rounded-full border-8 border-(--g-gold) bg-(--g-glass) motion-reduce:animate-none"
                    role="status"
                    aria-label="Çark yükleniyor"
                  />
                ) : (
                  <SpinWheel
                    segments={segments}
                    rotation={rotation}
                    durationMs={durationMs}
                    spinning={phase === 'spinning'}
                    highlight={phase === 'done' && result ? result.segment_index : null}
                    onSpinEnd={() => finish(result)}
                  />
                )}
              </div>

              {wheel && (
                <div className="flex w-full max-w-sm flex-col items-center gap-3">
                  <div className="flex flex-wrap items-center justify-center gap-2" aria-label="Çevirme hakların">
                    <span className={cn('g-hud h-9 px-3 text-sm', !free && 'opacity-70')}>Ücretsiz: {free ? 1 : 0}</span>
                    <span className={cn('g-hud h-9 px-3 text-sm', extra === 0 && 'opacity-70')}>Ekstra: {extra}</span>
                  </div>

                  {hasSpin || busy ? (
                    <GameButton
                      variant="green"
                      size="xl"
                      block
                      loading={phase === 'requesting'}
                      disabled={busy || !hasSpin}
                      onClick={spin}
                      sound="tap"
                      aria-describedby="wheel-odds-note"
                      className={cn(!busy && 'g-anim-bounce')}
                    >
                      {phase === 'spinning' ? 'DÖNÜYOR…' : 'ÇEVİR!'}
                    </GameButton>
                  ) : (
                    <div className="g-panel w-full px-4 py-3 text-center">
                      <p className="font-extrabold">Bugünkü hakkını kullandın</p>
                      <p className="g-font text-xl font-extrabold">
                        Yarın tekrar gel —{' '}
                        <Countdown
                          target={nextFree}
                          onDone={() => {
                            setFallbackReset(nextIstanbulMidnight());
                            void mutate();
                            void mutateProfile();
                          }}
                        />
                      </p>
                    </div>
                  )}
                  <p className="g-title-sm text-center text-sm">
                    {free ? 'Bugünkü ücretsiz hakkın hazır!' : extra > 0 ? `${extra} ekstra hakkın var.` : 'Ekstra hakları oynayarak kazanabilirsin.'}
                  </p>
                  {message && (
                    <p role="alert" className="w-full rounded-2xl bg-(--g-down-soft) px-3 py-2 text-center text-sm font-bold text-(--g-down)">
                      {message}
                    </p>
                  )}
                </div>
              )}
            </section>
          }
          side={
            <>
              <GamePanel title="Olasılıklar" accent="purple">
                <OddsTable segments={segments} loading={isLoading && !wheel} />
                <p id="wheel-odds-note" className="mt-3 flex items-start gap-2 text-sm font-semibold">
                  <ShieldIcon size={22} className="mt-0.5" />
                  <span>{WHEEL_DISCLAIMER}</span>
                </p>
                {wheel?.disclaimer && wheel.disclaimer !== WHEEL_DISCLAIMER && <p className="mt-2 text-xs text-(--g-ink-soft)">{wheel.disclaimer}</p>}
              </GamePanel>

              <GamePanel title="Ekstra hak nasıl kazanılır?" accent="orange">
                <ul className="space-y-2.5 text-sm">
                  <li className="flex items-start gap-3">
                    <FlameIcon size={28} />
                    <span>
                      <strong>7 günlük seri:</strong> her gün bir Arena turu bitir ya da portföyünde işlem yap; 7. günde <strong>+1 çevirme</strong> ve 100 jeton.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--g-teal) text-xs font-black text-(--g-on-color)"
                    >
                      +1
                    </span>
                    <span>
                      Çarktaki <strong>+1 Çevirme</strong> dilimi sana hemen bir hak daha verir (en fazla 10 hak birikir).
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--g-green) text-xs font-black text-(--g-on-color)"
                    >
                      ✓
                    </span>
                    <span>
                      <Link href="/oyun/gorevler" className="font-extrabold text-(--g-ink) underline decoration-(--g-blue) decoration-2 underline-offset-2">
                        Günlük görevler
                      </Link>{' '}
                      jeton ve XP kazandırır, serini sürdürmene yardım eder.
                    </span>
                  </li>
                </ul>
                <p className="mt-3 text-xs font-semibold text-(--g-ink-soft)">Çevirme hakkı hiçbir zaman parayla satılmaz.</p>
              </GamePanel>
            </>
          }
        />

        {result && (
          <RewardPopup
            open={popup}
            title={result.reward.extra_spin ? 'Bir hak daha!' : result.reward.item_id ? 'Nadir ödül!' : 'Tebrikler!'}
            subtitle={`Çark “${result.segment.label}” diliminde durdu.`}
            rewards={rewardItems(result.reward, result.segment, profile?.avatar_id)}
            cta={result.reward.extra_spin ? 'HARİKA!' : 'TOPLA!'}
            onClose={() => setPopup(false)}
          >
            {result.reward.item_id && (
              <p className="mt-3 text-center text-sm font-bold">
                Yeni çerçeven envanterinde.{' '}
                <Link href="/oyun/magaza" className="text-(--g-ink) underline decoration-(--g-blue) decoration-2 underline-offset-2">
                  Mağazada kuşan
                </Link>
              </p>
            )}
          </RewardPopup>
        )}
      </div>
    </GameScreen>
  );
}

function OddsTable({ segments, loading }: { segments: GameWheelSegment[]; loading: boolean }) {
  const total = segments.reduce((s, x) => s + x.probability_pct, 0);
  return (
    <table className="w-full border-separate border-spacing-y-1 text-sm">
      <caption className="sr-only">Çark dilimlerinin olasılıkları</caption>
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-(--g-ink-soft)">
          <th scope="col" className="pb-1 font-extrabold">
            Ödül
          </th>
          <th scope="col" className="pb-1 text-right font-extrabold">
            Olasılık
          </th>
        </tr>
      </thead>
      <tbody>
        {loading
          ? Array.from({ length: 8 }, (_, i) => (
              <tr key={i}>
                <td colSpan={2}>
                  <div className="h-7 animate-pulse rounded-lg bg-(--g-panel-2) motion-reduce:animate-none" />
                </td>
              </tr>
            ))
          : segments.map((s, i) => {
              const col = sliceColor(i);
              return (
                <tr key={s.id} className="bg-(--g-panel-2)">
                  <th scope="row" className="rounded-l-xl py-1.5 pl-2 text-left font-bold">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 rounded-md border-2"
                        style={{ background: `var(${col.face})`, borderColor: `var(${col.edge})` }}
                      />
                      {s.label}
                    </span>
                  </th>
                  <td className="g-num rounded-r-xl py-1.5 pr-3 text-right font-extrabold">{formatPct(s.probability_pct)}</td>
                </tr>
              );
            })}
      </tbody>
      {!loading && segments.length > 0 && (
        <tfoot>
          <tr className="text-(--g-ink-soft)">
            <th scope="row" className="pl-2 pt-1 text-left text-xs font-extrabold uppercase">
              Toplam
            </th>
            <td className="g-num pr-3 pt-1 text-right text-xs font-extrabold">{formatPct(total)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
