'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@portfoygo/shared/format';
import Confetti from '@/components/game/ui/Confetti';
import GameButton, { GameLinkButton } from '@/components/game/ui/GameButton';
import GameScreen from '@/components/game/ui/GameScreen';
import { GameLoader, GameNotice } from '@/components/game/ui/bits';
import { CoinIcon } from '@/components/game/ui/icons';
import { useReducedMotion } from '@/components/game/ui/hooks';
import { playSound } from '@/components/game/ui/sound';
import { useGameProfile } from '@/hooks/useGameProfile';
import { useSlotInfo } from '@/hooks/useSlot';
import { GameApiError, slotApi } from '@/lib/api';
import type { GameProfile, SlotInfo, SlotRealityCheck, SlotSpinResult, SlotSymbolId } from '@/types';
import { Countdown } from '../quests/Countdown';
import { ErrorPanel } from '../quests/screenParts';
import {
  appendHistoryPoint,
  betOptions,
  effectiveBet,
  formatSignedCoins,
  outcomeOf,
  reelStopTimes,
  reelStrip,
  shouldCelebrate,
  SLOT_SYMBOL_LABELS,
  toRealityCheck,
  winningReels,
  type SlotOutcome,
} from './model';
import RealityCheckDialog from './RealityCheckDialog';
import SlotEducation from './SlotEducation';
import SlotMachine, { type ReelAnim } from './SlotMachine';
import SlotPaytable from './SlotPaytable';
import s from './slot.module.css';

type Phase = 'idle' | 'requesting' | 'spinning' | 'done';

/** Başlangıç görünümü: eşleşme yok (makine "kazanmaya yakın" görünmez) */
const INITIAL_REELS: SlotSymbolId[] = ['boga', 'altin', 'dolar'];
/** Sunucu bekleme süresine küçük pay (saat / ağ farkı) */
const COOLDOWN_MARGIN_MS = 150;

const newRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

/**
 * Slot Makinesi — "Olasılık dersi". Sunucu sonucu belirler; makaralar soldan sağa, sonuçtan bağımsız sabit sürelerle
 * tam o sonuçta durur. Otomatik çevirme / hızlandırma yok; ses yalnızca oyuncu açtıysa. Olasılık tablosu ve ders her zaman görünür.
 */
export default function SlotScreen() {
  const { data: info, error, isLoading, mutate, disabled } = useSlotInfo();
  const { mutate: mutateProfile } = useGameProfile();
  const reduced = useReducedMotion();

  const [bet, setBet] = useState(10);
  const [phase, setPhase] = useState<Phase>('idle');
  const [shown, setShown] = useState<SlotSymbolId[]>(INITIAL_REELS);
  const [anim, setAnim] = useState<ReelAnim | null>(null);
  const [result, setResult] = useState<SlotSpinResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [reality, setReality] = useState<SlotRealityCheck | null>(null);
  const [ackNext, setAckNext] = useState(false);
  const [cooling, setCooling] = useState<{ id: number; ms: number } | null>(null);
  const [celebrate, setCelebrate] = useState(0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const frames = useRef<number[]>([]);
  const spinSeq = useRef(0);
  const coolSeq = useRef(0);
  /** Yanıtı alınamayan / işlenmemiş istek: yeniden denemede AYNI kimlik ve bahis gönderilir (sunucu idempotent; jeton iki kez düşmez) */
  const pending = useRef<{ id: string; bet: number } | null>(null);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      frames.current.forEach((f) => cancelAnimationFrame(f));
    },
    [],
  );

  const busy = phase === 'requesting' || phase === 'spinning';
  const limits = info?.limits;
  const coins = info?.coins ?? 0;
  const options = info && limits ? betOptions(info.bets, limits, coins) : [];
  const allowed = options.filter((o) => !o.disabled).map((o) => o.bet);
  // Seçili bahis artık yapılamıyorsa (bakiye / kayıp sınırı) izinli en yakın bahis
  const currentBet = effectiveBet(bet, options);
  const spinsLeft = limits?.spins_left_today ?? 0;
  const lossLeft = limits?.loss_remaining_today ?? 0;
  const minBet = info?.bets.length ? Math.min(...info.bets) : 5;
  const blockedReason: 'spins' | 'loss' | 'coins' | null = !info
    ? null
    : spinsLeft <= 0
      ? 'spins'
      : lossLeft < minBet
        ? 'loss'
        : coins < minBet
          ? 'coins'
          : null;
  const canSpin = !!info && !busy && !cooling && !blockedReason && allowed.length > 0;

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const startCooldown = (ms: number) => {
    const total = Math.max(0, ms) + COOLDOWN_MARGIN_MS;
    const id = (coolSeq.current += 1);
    setCooling({ id, ms: total });
    later(() => setCooling((c) => (c && c.id === id ? null : c)), total);
  };

  const applyResult = (res: SlotSpinResult) => {
    void mutate(
      (cur?: SlotInfo) =>
        cur
          ? {
              ...cur,
              coins: res.balance,
              limits: res.limits,
              today: res.stats.today,
              lifetime: res.stats.lifetime,
              session: res.stats.session,
              history: appendHistoryPoint(cur.history, res.stats.lifetime),
            }
          : cur,
      { revalidate: false },
    );
    void mutateProfile((p?: GameProfile) => (p ? { ...p, coins: res.balance } : p), { revalidate: false });
  };

  const finish = (res: SlotSpinResult, outcome: SlotOutcome) => {
    setAnim(null);
    setShown(res.reels);
    setPhase('done');
    setResult(res);
    applyResult(res);
    const names = res.reels.map((id) => SLOT_SYMBOL_LABELS[id]).join(', ');
    setAnnounce(`${names}. ${outcome.text}. ${outcome.detail}.`);
    if (outcome.net > 0) playSound(shouldCelebrate(res.bet, res.win, info?.celebrate_net_multiple) ? 'win' : 'coin');
    if (shouldCelebrate(res.bet, res.win, info?.celebrate_net_multiple)) setCelebrate((c) => c + 1);
    if (res.reality_check) setReality(res.reality_check);
  };

  const run = (res: SlotSpinResult) => {
    const id = (spinSeq.current += 1);
    const stops = reelStopTimes(3, reduced);
    const strips = res.reels.map((r, i) => reelStrip(shown[i] ?? r, r, i, id));
    const outcome = outcomeOf(res.bet, res.win, res.combo.label);
    setAnim({ id, strips, stopTimes: stops, running: false, stopped: [false, false, false] });
    setPhase('spinning');
    setResult(null);
    setAnnounce('Makaralar dönüyor…');
    // Bahis hemen düşer; kazanç makaralar durunca eklenir (sonuç önceden belli olmasın)
    void mutateProfile((p?: GameProfile) => (p ? { ...p, coins: res.balance - res.win } : p), { revalidate: false });

    const schedule = (offset: number) => {
      stops.forEach((t, i) =>
        later(() => {
          setShown((cur) => cur.map((sym, k) => (k === i ? res.reels[i] : sym)));
          setAnim((a) => (a && a.id === id ? { ...a, stopped: a.stopped.map((v, k) => v || k === i) } : a));
        }, t + offset),
      );
      later(() => finish(res, outcome), stops[stops.length - 1] + offset + 120);
    };

    if (reduced) {
      schedule(0);
    } else {
      // İlk kare şeridi 0'da çizer; ikinci karede geçiş başlar → duruşlar geçişle aynı anda
      const f1 = requestAnimationFrame(() => {
        const f2 = requestAnimationFrame(() => {
          setAnim((a) => (a && a.id === id ? { ...a, running: true } : a));
          schedule(30);
        });
        frames.current.push(f2);
      });
      frames.current.push(f1);
    }
  };

  const spin = async () => {
    if (!canSpin || !info) return;
    if (info.session.reality_check_due && !ackNext) {
      setReality({ ...info.session });
      return;
    }
    const req = pending.current ?? { id: newRequestId(), bet: currentBet };
    pending.current = req;
    setPhase('requesting');
    setMessage(null);
    try {
      const res = await slotApi.spin({ bet: req.bet, request_id: req.id, ...(ackNext ? { reality_check_ack: true } : {}) });
      pending.current = null;
      setAckNext(false);
      startCooldown(info.limits.min_interval_ms);
      run(res);
    } catch (err) {
      setPhase('idle');
      if (!(err instanceof GameApiError)) {
        setMessage('Çevirme yapılamadı. Lütfen tekrar dene.');
        return;
      }
      const data = err.data ?? {};
      switch (err.code) {
        case 'SLOT_REALITY_CHECK': {
          // İstek işlenmedi: aynı kimlik onayla yeniden gönderilir
          const rc = toRealityCheck(data.session);
          if (rc) setReality(rc);
          return;
        }
        case 'SLOT_COOLDOWN':
          startCooldown(Number(data.retry_after_ms) || info.limits.min_interval_ms);
          return;
        case 'SLOT_DISABLED':
          pending.current = null;
          void mutate();
          return;
        case 'ADULT_CONFIRM_REQUIRED':
        case 'ARENA_BREAK':
          pending.current = null;
          setMessage(err.message);
          void mutateProfile();
          return;
        default:
          // Ağ / sunucu hatası: çevirme işlenmiş olabilir → aynı istek yeniden gönderilir (idempotent)
          if (err.status === 0 || err.status >= 500) {
            setMessage('Bağlantı sorunu oldu. Tekrar denediğinde aynı çevirme gönderilir; jeton iki kez düşmez.');
            return;
          }
          pending.current = null;
          setMessage(err.message);
          void mutate();
      }
    }
  };

  const continueAfterCheck = () => {
    setReality(null);
    setAckNext(true);
  };

  if (disabled) {
    return (
      <GameScreen topBar back="/oyun" backLabel="Oyun Merkezi’ne dön" title="Slot Makinesi">
        <GameNotice
          title="Şu an kapalı"
          tone="purple"
          actions={
            <GameLinkButton href="/oyun" variant="blue" size="md">
              Oyun Merkezi’ne dön
            </GameLinkButton>
          }
        >
          Slot Makinesi geçici olarak kullanılamıyor. Diğer oyun modlarına göz atabilirsin.
        </GameNotice>
      </GameScreen>
    );
  }

  const outcome = result ? outcomeOf(result.bet, result.win, result.combo.label) : null;
  const highlight = result ? winningReels(result.reels, result.win) : [false, false, false];
  const resetsAt = limits?.resets_at ? Date.parse(limits.resets_at) : null;

  return (
    <GameScreen topBar back="/oyun" backLabel="Oyun Merkezi’ne dön" title="Slot Makinesi" layout="wide">
      <p className="g-title-sm -mt-3 mb-4 text-base">Olasılık dersi · Kasa her zaman kazanır</p>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </p>

      {error && !info ? (
        <div className="g-panel mx-auto max-w-xl p-4">
          <ErrorPanel error={error} onRetry={() => void mutate()} />
        </div>
      ) : (
        <div className="grid gap-x-5 gap-y-8 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(340px,1.12fr)_minmax(0,1fr)] lg:items-start xl:gap-x-7">
          {/* Makine (telefonda ilk; masaüstünde ortada) */}
          <section aria-labelledby="slot-machine-h" className="md:col-span-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
            <h2 id="slot-machine-h" className="sr-only">
              Makine
            </h2>
            <div className="mx-auto w-full max-w-xl lg:max-w-none">
              {isLoading && !info ? (
                <div className="g-panel p-6">
                  <GameLoader label="Slot Makinesi yükleniyor…" />
                </div>
              ) : (
                <SlotMachine
                  shown={shown}
                  anim={anim}
                  reduced={reduced}
                  highlight={highlight}
                  rtpPct={info?.rtp_pct ?? 95}
                  houseEdgePct={info?.house_edge_pct ?? 5}
                  outcome={outcome}
                  spinning={busy}
                />
              )}

              {info && (
                <div className="mt-4 space-y-3">
                  <fieldset className="g-panel px-3 pb-3 pt-2.5">
                    <legend className="sr-only">Bahis (jeton)</legend>
                    <p aria-hidden="true" className="text-center text-xs font-extrabold uppercase tracking-wide text-(--g-ink-soft)">
                      Bahis (jeton)
                    </p>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      {options.map((o) => {
                        const active = currentBet === o.bet && !o.disabled;
                        return (
                          <label
                            key={o.bet}
                            title={o.reason ?? undefined}
                            className={cn(
                              'flex cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--g-focus) items-center justify-center gap-1.5 rounded-2xl border-[3px] px-2 py-2 text-lg font-extrabold transition-colors',
                              active ? 'border-(--g-gold-edge) bg-(--g-gold) text-(--g-gold-ink)' : 'border-(--g-panel-edge) bg-(--g-panel-2) text-(--g-ink)',
                              (o.disabled || busy) && 'cursor-not-allowed opacity-50',
                            )}
                          >
                            <input
                              type="radio"
                              name="slot-bet"
                              value={o.bet}
                              checked={active}
                              disabled={o.disabled || busy}
                              onChange={() => setBet(o.bet)}
                              className="sr-only"
                              aria-describedby={o.reason ? `slot-bet-${o.bet}-why` : undefined}
                            />
                            <CoinIcon size={20} />
                            <span className="g-num">{o.bet}</span>
                            {o.reason && (
                              <span id={`slot-bet-${o.bet}-why`} className="sr-only">
                                {o.reason}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  {blockedReason ? (
                    <BlockedNotice reason={blockedReason} resetsAt={resetsAt} onReset={() => void mutate()} />
                  ) : (
                    <div>
                      <GameButton
                        variant="purple"
                        size="xl"
                        block
                        loading={phase === 'requesting'}
                        disabled={!canSpin}
                        onClick={() => void spin()}
                        aria-describedby="slot-spin-note"
                      >
                        {phase === 'spinning' ? 'DÖNÜYOR…' : `ÇEVİR · ${currentBet} JETON`}
                      </GameButton>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-(--g-glass)" aria-hidden="true">
                        {cooling && <div key={cooling.id} className={cn(s.cooldown, 'h-full w-full rounded-full bg-(--g-glass-strong)')} style={{ animationDuration: `${cooling.ms}ms` }} />}
                      </div>
                      <p id="slot-spin-note" className="sr-only">
                        Her çevirme seçili bahsi düşer. İki çevirme arasında en az 1,5 saniye beklenir; otomatik çevirme yoktur.
                      </p>
                    </div>
                  )}

                  {message && (
                    <p role="alert" className="rounded-2xl bg-(--g-down-soft) px-3 py-2 text-center text-sm font-bold text-(--g-down)">
                      {message}
                    </p>
                  )}

                  <TodayStats info={info} />
                </div>
              )}
            </div>
          </section>

          <SlotPaytable info={info} loading={isLoading} className="mt-4 lg:col-start-1 lg:row-start-1" />
          <SlotEducation info={info} className="lg:col-start-3 lg:row-start-1" />
        </div>
      )}

      <RealityCheckDialog check={reality} onContinue={continueAfterCheck} />
      {celebrate > 0 && <Confetti key={celebrate} pieces={90} duration={2200} />}
    </GameScreen>
  );
}

function TodayStats({ info }: { info: SlotInfo }) {
  const { today, limits } = info;
  return (
    <dl className="grid grid-cols-3 gap-2 text-center text-(--g-on-color)">
      <div className="rounded-2xl border-2 border-(--g-hud-edge) bg-(--g-hud) px-1 py-2">
        <dt className="text-[10px] font-extrabold uppercase tracking-wide opacity-85">Bugün</dt>
        <dd className="g-num font-extrabold">
          {today.spins}/{limits.max_spins_per_day} çevirme
        </dd>
      </div>
      <div className="rounded-2xl border-2 border-(--g-hud-edge) bg-(--g-hud) px-1 py-2">
        <dt className="text-[10px] font-extrabold uppercase tracking-wide opacity-85">Bugünkü net</dt>
        <dd className="g-num font-extrabold">{formatSignedCoins(today.net)} jeton</dd>
      </div>
      <div className="rounded-2xl border-2 border-(--g-hud-edge) bg-(--g-hud) px-1 py-2">
        <dt className="text-[10px] font-extrabold uppercase tracking-wide opacity-85">Kalan kayıp hakkı</dt>
        <dd className="g-num font-extrabold">{limits.loss_remaining_today} jeton</dd>
      </div>
    </dl>
  );
}

function BlockedNotice({ reason, resetsAt, onReset }: { reason: 'spins' | 'loss' | 'coins'; resetsAt: number | null; onReset: () => void }) {
  if (reason === 'coins') {
    return (
      <div className="g-panel px-4 py-3 text-center text-sm font-bold">
        <p>Bu bahis için jetonun yetmiyor.</p>
        <p className="mt-1 font-semibold text-(--g-ink-soft)">
          Jetonlar satın alınamaz;{' '}
          <Link href="/oyun/gorevler" className="g-focus underline decoration-(--g-blue) decoration-2 underline-offset-2">
            görevler
          </Link>{' '}
          ve{' '}
          <Link href="/oyun/cark" className="g-focus underline decoration-(--g-blue) decoration-2 underline-offset-2">
            günlük çark
          </Link>{' '}
          ile kazanılır.
        </p>
      </div>
    );
  }
  return (
    <div className="g-panel px-4 py-3 text-center" role="status">
      <p className="font-extrabold">{reason === 'spins' ? 'Bugünkü çevirme hakkın bitti.' : 'Bugünkü kayıp sınırına ulaştın.'}</p>
      {resetsAt && (
        <p className="g-font mt-1 text-lg font-extrabold">
          Yeniden açılış: <Countdown target={resetsAt} onDone={onReset} />
        </p>
      )}
      <p className="mt-1 text-xs font-semibold text-(--g-ink-soft)">Sınır gece yarısı (İstanbul) sıfırlanır. Ara vermek iyi bir fikir.</p>
    </div>
  );
}
