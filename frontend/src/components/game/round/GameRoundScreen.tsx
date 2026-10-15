'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { cn, formatUSD } from '@portfoygo/shared/format';
import { useAuth } from '@/context/AuthContext';
import { useArenaRound } from '@/hooks/useArenaRound';
import { useGameProfile } from '@/hooks/useGameProfile';
import { ApiError, arenaSocialApi, gameProfileApi } from '@/lib/api';
import { anotherDialogOpen, isTypingTarget } from '@/components/command/events';
import { CLOSE_REASON_LABELS, durationLabel, formatPrice, stopPrice, timeToTick, type RoundModel } from '@/components/arena/model';
import { DEFAULT_TRADE_SETTINGS, effectiveAmount, type TradeSettingsValue } from '@/components/arena/TradePanel';
import type { ChartLine, ChartMarker } from '@/components/arena/ArenaChart';
import {
  Avatar,
  BackButton,
  CountdownOverlay,
  GameButton,
  GameLinkButton,
  GameLoader,
  GameNotice,
  GameScreen,
  RewardPopup,
  ShieldIcon,
  SoundToggle,
} from '@/components/game/ui';
import { PCT_TONE_CLASS, pctTone, rewardsFromRound, signedPct } from '@/components/game/model';
import ProblemDialog from '@/components/game/ProblemDialog';
import { toProblem, useGameActions, type GameProblem } from '@/components/game/useGameActions';
import type { ArenaPosition, ArenaSide } from '@/types';
import GameChart from './GameChart';
import { FloatingLayer, ReactionBar, useFloatingReactions } from './Reactions';
import ResultScreen from './ResultScreen';
import { GameQuoteFeed, HostBanner, InstrumentChips, TimerPill, TugOfWarBar } from './RoundHud';
import { AmountChips, BuySellButtons, PnlValue, PositionsPanel } from './TradePad';

/** Süre dolduğu hâlde `end` olayı gelmezse durum bu kadar sonra sunucudan alınır */
const END_GRACE_MS = 3_000;
const MIN_AMOUNT = 10;

type Actions = ReturnType<typeof useArenaRound>['actions'];

interface Notice {
  id: number;
  tone: 'good' | 'info' | 'bad';
  text: string;
}

/** Kısa oyun içi bildirim (AL/SAT düğmelerinin üstünde) */
function useGameNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const notify = useCallback((tone: Notice['tone'], text: string) => {
    clearTimeout(timer.current);
    setNotice({ id: Date.now(), tone, text });
    timer.current = setTimeout(() => setNotice(null), 2600);
  }, []);
  return { notice, notify };
}

function NoticeLine({ notice }: { notice: Notice | null }) {
  return (
    <p role="status" aria-live="polite" className="flex min-h-6 items-center justify-center">
      {notice && (
        <span
          key={notice.id}
          className={cn(
            'g-anim-pop max-w-full truncate rounded-full px-3 py-0.5 text-xs font-extrabold text-(--g-on-color)',
            notice.tone === 'good' ? 'bg-(--g-green-edge)' : notice.tone === 'bad' ? 'bg-(--g-red-edge)' : 'bg-(--g-blue-edge)',
          )}
        >
          {notice.text}
        </span>
      )}
    </p>
  );
}

/** Oyun derili tur ekranı (solo, düello, meydan okuma, senaryo). Kimlik değişince `key` ile yeniden kurulmalı. */
export default function GameRoundScreen({ id }: { id: string }) {
  const { user } = useAuth();
  const username = user?.username ?? '';
  const floating = useFloatingReactions(username);
  const { notice, notify } = useGameNotice();
  const { store, live, reload, actions } = useArenaRound(id, {
    onServerClose: (p) => {
      const label = store.model?.round.instruments.find((i) => i.code === p.instrument)?.label ?? p.instrument;
      const reason = p.close_reason ? CLOSE_REASON_LABELS[p.close_reason] : 'Kapanış';
      notify(p.pnl >= 0 ? 'good' : 'info', `${label}: ${reason.toLocaleLowerCase('tr')} · ${p.pnl >= 0 ? '+' : ''}${formatUSD(p.pnl)}`);
    },
    onReaction: (r) => floating.push(r.emoji, r.username),
  });
  const m = store.model;

  if (!m) {
    if (store.error) {
      const missing = store.error instanceof ApiError && [400, 403, 404].includes(store.error.status);
      return (
        <GameScreen back="/oyun" backLabel="Oyun Merkezi">
          <GameNotice
            icon={<ShieldIcon />}
            tone="orange"
            title={missing ? 'Tur bulunamadı' : 'Tur yüklenemedi'}
            actions={
              <>
                <GameLinkButton href="/oyun" variant="blue" size="md">
                  Oyun Merkezi
                </GameLinkButton>
                {!missing && (
                  <GameButton variant="green" size="md" onClick={reload}>
                    Tekrar dene
                  </GameButton>
                )}
              </>
            }
          >
            {missing ? 'Bu tur yok ya da sana ait değil.' : store.error instanceof Error ? store.error.message : 'Beklenmeyen bir hata oluştu.'}
          </GameNotice>
        </GameScreen>
      );
    }
    return (
      <GameScreen back="/oyun" backLabel="Oyun Merkezi">
        <GameLoader label="Tur hazırlanıyor…" />
      </GameScreen>
    );
  }
  return <RoundView id={id} m={m} live={live} reload={reload} actions={actions} username={username} floating={floating} notice={notice} notify={notify} />;
}

function RoundView({
  id,
  m,
  live,
  reload,
  actions,
  username,
  floating,
  notice,
  notify,
}: {
  id: string;
  m: RoundModel;
  live: boolean;
  reload: () => void;
  actions: Actions;
  username: string;
  floating: ReturnType<typeof useFloatingReactions>;
  notice: Notice | null;
  notify: (tone: Notice['tone'], text: string) => void;
}) {
  const router = useRouter();
  const { round, me, quotes, open, closed } = m;
  const duel = m.duel ?? null;
  const scenario = m.scenario ?? null;
  const instruments = round.instruments;
  const [selected, setSelected] = useState<string | null>(null);
  const code = selected && instruments.some((i) => i.code === selected) ? selected : (instruments[0]?.code ?? '');
  const ins = instruments.find((i) => i.code === code) ?? { code, label: code, decimals: 2 };
  const quote = quotes[code];

  const [settings, setSettings] = useState<TradeSettingsValue>(DEFAULT_TRADE_SETTINGS);
  const [submitting, setSubmitting] = useState<ArenaSide | null>(null);
  const [closing, setClosing] = useState<ReadonlySet<string>>(() => new Set());
  const [closingAll, setClosingAll] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [rewardsClaimed, setRewardsClaimed] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [problem, setProblem] = useState<GameProblem | null>(null);
  const [briefOpen, setBriefOpen] = useState(true);
  const solo = useGameActions();

  const finished = round.status === 'finished';
  const scheduled = round.status === 'scheduled';
  const canTrade = round.status === 'running' && me.joined;
  const challenge = round.kind === 'challenge' ? round.challenge : null;
  const social = !!duel || !!challenge;

  /* ---------------- Tur ödülleri (sunucu defteri) ---------------- */

  const { profile, mutate: refreshProfile } = useGameProfile();
  // Ödül penceresi yalnızca turu canlı izleyen oyuncuya bir kez açılır (eski turu açınca tekrar çıkmaz)
  const [sawLive, setSawLive] = useState(false);
  if (!sawLive && !finished) setSawLive(true);
  const [rewardPollDone, setRewardPollDone] = useState(false);
  useEffect(() => {
    if (!finished || !sawLive) return;
    // Ödüller tur kapanışından hemen sonra ayrı transaction'da yazılır; en fazla ~15 sn bekle
    const t = setTimeout(() => setRewardPollDone(true), 15_000);
    return () => clearTimeout(t);
  }, [finished, sawLive]);
  const { data: roundRewards } = useSWR(
    finished && sawLive ? gameProfileApi.roundRewardsKey(round.id) : null,
    () => gameProfileApi.roundRewards(round.id),
    {
      refreshInterval: (d) => (d?.ready || rewardPollDone ? 0 : 1_200),
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      onSuccess: (d) => {
        if (d.ready) void refreshProfile();
      },
    },
  );
  const rewards = useMemo(() => rewardsFromRound(roundRewards), [roundRewards]);

  /* ---------------- Süre dolduysa yeniden al ---------------- */

  useEffect(() => {
    if (finished) return;
    const end = Date.parse(round.ends_at);
    if (!Number.isFinite(end)) return;
    const wait = end - (Date.now() + m.clockOffset) + END_GRACE_MS;
    const t = setTimeout(reload, Math.max(END_GRACE_MS, wait));
    return () => clearTimeout(t);
  }, [finished, round.ends_at, m.clockOffset, reload]);

  /* ---------------- İşlemler ---------------- */

  const trade = async (side: ArenaSide) => {
    if (!canTrade || submitting || !quote) return;
    const amount = effectiveAmount(settings, me.cash);
    if (!(amount >= MIN_AMOUNT)) {
      notify('bad', `En az ${formatUSD(MIN_AMOUNT)} ile işlem açabilirsin.`);
      return;
    }
    if (amount > me.cash + 1e-9) {
      notify('bad', `Yetersiz nakit (${formatUSD(me.cash)})`);
      return;
    }
    const ref = side === 'long' ? quote.ask : quote.bid;
    setSubmitting(side);
    try {
      const p = await actions.open({
        instrument: code,
        side,
        amount,
        ...(settings.slPct ? { stop_loss: stopPrice(side, 'sl', ref, settings.slPct, ins.decimals) } : {}),
        ...(settings.tpPct ? { take_profit: stopPrice(side, 'tp', ref, settings.tpPct, ins.decimals) } : {}),
      });
      notify('good', `${ins.label} ${side === 'long' ? 'alındı ▲' : 'satıldı ▼'} · ${formatUSD(amount)} @ ${formatPrice(p.entry_price || ref, ins.decimals)}`);
    } catch (err) {
      notify('bad', err instanceof Error ? err.message : 'İşlem açılamadı');
    } finally {
      setSubmitting(null);
    }
  };

  const closeOne = async (p: ArenaPosition) => {
    setClosing((s) => new Set(s).add(p.id));
    try {
      const res = await actions.close(p.id);
      const label = instruments.find((i) => i.code === p.instrument)?.label ?? p.instrument;
      notify(res.pnl >= 0 ? 'good' : 'info', `${label} kapatıldı · ${res.pnl >= 0 ? '+' : ''}${formatUSD(res.pnl)}`);
    } catch (err) {
      notify('bad', err instanceof Error ? err.message : 'Pozisyon kapatılamadı');
    } finally {
      setClosing((s) => {
        const next = new Set(s);
        next.delete(p.id);
        return next;
      });
    }
  };

  const closeAll = async () => {
    if (!canTrade || closingAll || open.length === 0) return;
    setClosingAll(true);
    try {
      const list = await actions.closeAll();
      const total = list.reduce((s: number, p: ArenaPosition) => s + p.pnl, 0);
      notify(total >= 0 ? 'good' : 'info', `${list.length || open.length} pozisyon kapatıldı · ${total >= 0 ? '+' : ''}${formatUSD(total)}`);
    } catch (err) {
      notify('bad', err instanceof Error ? err.message : 'Pozisyonlar kapatılamadı');
    } finally {
      setClosingAll(false);
    }
  };

  const rematch = async () => {
    if (!duel || rematching) return;
    setRematching(true);
    try {
      const invite = await arenaSocialApi.rematch(duel.id);
      router.push(`/oyun/duello/${encodeURIComponent(invite.code || invite.duel.code)}?yeni=1`);
    } catch (err) {
      setProblem(toProblem(err, 'Rövanş başlatılamadı'));
      setRematching(false);
    }
  };

  /* ---------------- Klavye kısayolları (B / S / 1–4 / X) ---------------- */

  const keys = useRef({ trade, closeAll, select: (i: number) => instruments[i] && setSelected(instruments[i].code) });
  useEffect(() => {
    keys.current = { trade, closeAll, select: (i: number) => instruments[i] && setSelected(instruments[i].code) };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || e.repeat) return;
      if (isTypingTarget(e.target) || anotherDialogOpen()) return;
      const k = e.key.toLocaleLowerCase('tr');
      if (k === 'b') void keys.current.trade('long');
      else if (k === 's' || k === 'ş') void keys.current.trade('short');
      else if (k === 'x') void keys.current.closeAll();
      else if (/^[1-9]$/.test(k)) keys.current.select(Number(k) - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------------- Grafik işaretleri ---------------- */

  const markers = useMemo<ChartMarker[]>(() => {
    const list: ChartMarker[] = [];
    for (const p of [...open, ...closed]) {
      if (p.instrument !== code) continue;
      list.push({ t: timeToTick(p.opened_at, round), kind: p.side, text: p.side === 'long' ? 'AL' : 'SAT' });
      if (p.status === 'closed' && p.closed_at) list.push({ t: timeToTick(p.closed_at, round), kind: 'exit', text: p.close_reason === 'sl' ? 'SL' : p.close_reason === 'tp' ? 'TP' : 'K' });
    }
    return list;
  }, [open, closed, code, round]);

  const lines = useMemo<ChartLine[]>(() => {
    const list: ChartLine[] = [];
    for (const p of open) {
      if (p.instrument !== code) continue;
      list.push({ price: p.entry_price, kind: 'entry', title: p.side === 'long' ? 'Giriş (AL)' : 'Giriş (SAT)' });
      if (p.stop_loss != null) list.push({ price: p.stop_loss, kind: 'sl', title: 'SL' });
      if (p.take_profit != null) list.push({ price: p.take_profit, kind: 'tp', title: 'TP' });
    }
    return list;
  }, [open, code]);

  const points = m.series[code] ?? [];
  const change = quote?.change_pct_since_start ?? 0;
  const countdownTarget = m.countdownUntil ?? Date.parse(round.starts_at) - m.clockOffset;
  const buttonNote = scheduled ? 'Tur başlamak üzere…' : finished ? 'Tur bitti' : !me.joined ? 'İzleyici modundasın' : null;
  const title = duel
    ? `Düello · ${durationLabel(round.duration_s)}`
    : challenge
      ? challenge.title
      : scenario
        ? scenario.title
        : `Solo Tur · ${durationLabel(round.duration_s)}`;

  const tradePad = (
    <>
      <AmountChips value={settings} onChange={setSettings} cash={me.cash} disabled={!canTrade && !scheduled} />
      <div className="mt-3">
        <BuySellButtons quote={quote} decimals={ins.decimals} label={ins.label} disabled={!canTrade} submitting={submitting} onTrade={(s) => void trade(s)} note={null} />
      </div>
    </>
  );

  return (
    <GameScreen wide className="pb-[260px] lg:pb-10">
      {/* Üst: geri · sayaç · ses */}
      <div className="mb-2 grid grid-cols-[46px_minmax(0,1fr)_46px] items-start gap-2">
        <BackButton href="/oyun" label="Oyun Merkezi" />
        <TimerPill round={round} clockOffset={m.clockOffset} />
        <div className="flex justify-end">
          <SoundToggle />
        </div>
      </div>
      <h1 className="g-title-sm mb-3 flex items-center justify-center gap-2 text-center text-lg">
        <span className="min-w-0 truncate">{title}</span>
        {!finished && (
          <span className={cn('inline-flex h-2.5 w-2.5 shrink-0 rounded-full', live ? 'bg-(--g-green) shadow-[0_0_0_3px_var(--g-glass-strong)]' : 'bg-(--g-ink-faint)')} aria-label={live ? 'Canlı bağlantı' : 'Bağlanıyor'} role="img" />
        )}
      </h1>

      <div className="mx-auto mb-3 flex max-w-3xl flex-col gap-3">
        {m.hostMessage && <HostBanner message={m.hostMessage} />}
        {scenario?.briefing && !finished && (
          <div className="g-panel p-3">
            <button type="button" onClick={() => setBriefOpen((v) => !v)} aria-expanded={briefOpen} className="g-focus flex w-full items-center justify-between gap-2 rounded-lg text-left">
              <span className="g-ribbon g-ribbon--teal text-sm">📜 Brifing</span>
              <span className="text-xs font-extrabold text-(--g-ink-soft)">{briefOpen ? 'Gizle' : 'Göster'}</span>
            </button>
            {briefOpen && <p className="mt-2 whitespace-pre-line text-sm font-semibold text-(--g-ink-soft)">{scenario.briefing}</p>}
          </div>
        )}
        {duel && (
          <TugOfWarBar
            finished={finished}
            me={{ username, avatarId: profile?.avatar_id, frameId: profile?.frame_id, returnPct: me.return_pct }}
            opponent={{ username: duel.opponent.username, avatarId: duel.opponent.avatar_id, isBot: duel.opponent.is_bot, returnPct: duel.opponent_return_pct }}
          />
        )}
        {!me.joined && !finished && <p className="g-glass rounded-2xl px-3 py-2 text-center text-sm font-extrabold text-(--g-on-color)">Bu turu izliyorsun. İşlem için meydan okumaya katılman gerekir.</p>}
        {finished && resultDismissed && (
          <div className="g-glass flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-(--g-on-color)">
            <span className="text-sm font-extrabold">Tur bitti · {signedPct(me.return_pct)}</span>
            <GameButton variant="gold" size="sm" onClick={() => setResultDismissed(false)}>
              Sonuçlar
            </GameButton>
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-4">
        <div className="min-w-0 space-y-3">
          <InstrumentChips instruments={instruments} quotes={quotes} selected={code} onSelect={setSelected} />
          <div className="g-panel relative overflow-hidden p-2 sm:p-3">
            <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 px-2 pt-1">
              <div className="min-w-0">
                <h2 className="text-sm font-extrabold text-(--g-ink-soft)">{ins.label}</h2>
                <p className="g-num text-3xl font-extrabold leading-tight">{formatPrice(quote?.mid, ins.decimals)}</p>
              </div>
              <span className={cn('g-num rounded-full px-2.5 py-1 text-sm font-extrabold', change >= 0 ? 'bg-(--g-up-soft) text-(--g-up)' : 'bg-(--g-down-soft) text-(--g-down)')}>
                {change >= 0 ? '▲' : '▼'} {signedPct(change)}
              </span>
            </div>
            <GameChart
              code={code}
              label={ins.label}
              decimals={ins.decimals}
              points={points}
              durationS={round.duration_s}
              ticksTotal={round.ticks_total}
              markers={markers}
              lines={lines}
              rising={change >= 0}
              className="mt-1 h-[220px] sm:h-[300px] lg:h-[360px]"
            />
            <FloatingLayer items={floating.items} />

          </div>
          {social && !finished && (
            <ReactionBar roundId={id} disabled={!me.joined} onSent={(emoji) => floating.push(emoji, username, true)} className="g-glass rounded-2xl px-2 py-2" />
          )}
          <div className="g-panel hidden p-4 lg:block">
            {tradePad}
            <NoticeLine notice={notice} />
            {buttonNote && <p className="mt-1 text-center text-sm font-extrabold text-(--g-ink-soft)">{buttonNote}</p>}
          </div>
        </div>

        <aside className="min-w-0 space-y-3">
          {challenge && <ChallengeBoard rows={m.leaderboard} />}
          <PositionsPanel
            me={me}
            open={open}
            closed={closed}
            instruments={instruments}
            quotes={quotes}
            canTrade={canTrade}
            closing={closing}
            closingAll={closingAll}
            onClose={(p) => void closeOne(p)}
            onCloseAll={() => void closeAll()}
          />
          <GameQuoteFeed feed={m.feed} instruments={instruments} className="h-[240px] lg:h-[300px]" />
          <p className="flex items-center justify-center gap-1.5 text-center text-xs font-extrabold text-(--g-on-color) opacity-90">
            <ShieldIcon size={16} /> Sanal para — gerçek yatırım değildir. Kısayollar: B al · S sat · 1–4 · X kapat
          </p>
        </aside>
      </div>

      {!finished && (
        <CountdownOverlay target={countdownTarget} title={challenge ? challenge.title : duel ? 'Düello başlıyor' : 'Tur başlıyor'} subtitle="Hazır ol: AL için B, SAT için S." />
      )}

      {/* Telefonda yapışkan işlem paneli */}
      <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
        <div className="g-panel mx-auto max-w-[560px] rounded-b-none border-b-0 px-3 pb-[max(env(safe-area-inset-bottom),0.6rem)] pt-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-extrabold">
            <span className="g-num">Özsermaye {formatUSD(me.equity)}</span>
            <span className="inline-flex items-center gap-1">
              <span className="text-(--g-ink-soft)">Açık</span>
              <PnlValue value={open.reduce((sum, p) => sum + p.pnl, 0)} />
            </span>
            <span className={cn('g-num', PCT_TONE_CLASS[pctTone(me.return_pct)])}>{signedPct(me.return_pct)}</span>
          </div>
          {tradePad}
          <NoticeLine notice={notice} />
          {buttonNote && !notice && <p className="-mt-5 text-center text-xs font-extrabold text-(--g-ink-soft)">{buttonNote}</p>}
        </div>
      </div>

      {finished && m.final && !resultDismissed && (
        <ResultScreen
          roundId={id}
          round={round}
          final={m.final}
          closed={closed}
          duel={duel}
          scenario={scenario}
          me={{ username, avatarId: profile?.avatar_id, frameId: profile?.frame_id }}
          participants={challenge ? m.leaderboard.length || null : null}
          rewards={rewards}
          onClose={() => setResultDismissed(true)}
          onReplay={scenario ? undefined : () => void solo.startSolo(round.duration_s, instruments.map((i) => i.code))}
          replaying={solo.busy === 'solo'}
          onRematch={duel ? () => void rematch() : undefined}
          rematching={rematching}
        />
      )}
      <RewardPopup open={rewards.length > 0 && !rewardsClaimed && finished} title="Ödüller!" rewards={rewards} onClose={() => setRewardsClaimed(true)} subtitle="Bu turdan kazandıkların" />
      <ProblemDialog problem={problem ?? solo.problem} onClose={() => (problem ? setProblem(null) : solo.clearProblem())} />
    </GameScreen>
  );
}

function ChallengeBoard({ rows }: { rows: RoundModel['leaderboard'] }) {
  return (
    <section aria-label="Canlı sıralama" className="g-panel p-3">
      <h2 className="g-ribbon g-ribbon--gold mb-2 text-sm">Canlı sıralama</h2>
      {rows.length === 0 ? (
        <p className="py-2 text-center text-sm font-bold text-(--g-ink-soft)">Sıralama tur başlayınca görünür.</p>
      ) : (
        <ol className="space-y-1">
          {rows.slice(0, 10).map((r) => (
            <li key={`${r.rank}-${r.username}`} className={cn('flex items-center gap-2 rounded-xl px-2 py-1', r.is_me ? 'bg-(--g-gold-top) text-(--g-gold-ink)' : 'bg-(--g-panel-2)')}>
              <span className="g-num w-6 text-center text-sm font-extrabold">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
              <Avatar seed={r.username} size={26} ring={false} />
              <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{r.is_me ? `${r.username} (sen)` : r.username}</span>
              <span className={cn('g-num text-sm font-extrabold', PCT_TONE_CLASS[pctTone(r.return_pct)])}>{signedPct(r.return_pct)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
