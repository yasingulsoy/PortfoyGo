'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, BoltIcon, GiftIcon, SparklesIcon } from '@heroicons/react/20/solid';
import { cn, formatDateTime, formatUSD } from '@portfoygo/shared/format';
import { LinkButton } from '@portfoygo/shared/ui/Button';
import Button from '@portfoygo/shared/ui/Button';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import PriceTick from '@/components/market/PriceTick';
import { anotherDialogOpen, isTypingTarget } from '@/components/command/events';
import { useArenaRound } from '@/hooks/useArenaRound';
import { useArenaStart } from '@/hooks/useArenaStart';
import { ApiError } from '@/lib/api';
import type { ArenaPosition, ArenaSide } from '@/types';
import ArenaChart, { type ChartLine, type ChartMarker } from './ArenaChart';
import CountdownOverlay from './CountdownOverlay';
import InstrumentTabs from './InstrumentTabs';
import LiveLeaderboard from './LiveLeaderboard';
import PnlBar, { PnlText, SideBadge } from './PnlBar';
import QuoteFeed, { QuoteStrip } from './QuoteFeed';
import RoundEndModal from './RoundEndModal';
import RoundTimer from './RoundTimer';
import StopsModal from './StopsModal';
import { DEFAULT_TRADE_SETTINGS, TradeButtons, TradeSettings, effectiveAmount, type TradeSettingsValue } from './TradePanel';
import { LiveDot, ReplayChip, ResponsibleNote, ShortcutsTip } from './bits';
import { CLOSE_REASON_LABELS, durationLabel, formatPrice, stopPrice, timeToTick, type RoundModel } from './model';

/** Tur süresi dolduğu hâlde `end` olayı gelmezse durum bu kadar sonra sunucudan alınır */
const END_GRACE_MS = 3_000;
/** En küçük işlem tutarı (USD) */
const MIN_AMOUNT = 10;

type Actions = ReturnType<typeof useArenaRound>['actions'];

interface Notice {
  id: number;
  tone: 'success' | 'info';
  title: string;
  description?: ReactNode;
}
type Notify = (tone: Notice['tone'], title: string, description?: ReactNode) => void;

/**
 * Başarı / bilgi geri bildirimi: geniş ekranda bildirim (toast); telefonda bildirimler alttaki
 * AL/SAT düğmelerinin üstüne bineceği için yapışkan çubuğun içinde kısa bir satır olarak gösterilir.
 */
function useRoundNotice() {
  const toast = useToast();
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const notify = useCallback<Notify>(
    (tone, title, description) => {
      if (window.matchMedia('(min-width: 1024px)').matches) {
        toast[tone](title, { description, duration: 2500 });
        return;
      }
      clearTimeout(timer.current);
      setNotice({ id: Date.now(), tone, title, description });
      timer.current = setTimeout(() => setNotice(null), 2800);
    },
    [toast],
  );
  return { notice, notify };
}

function InlineNotice({ notice }: { notice: Notice | null }) {
  return (
    <p role="status" aria-live="polite" className="mt-2 flex min-h-5 items-center justify-center gap-1.5 truncate text-center text-xs">
      {notice && (
        <>
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', notice.tone === 'success' ? 'bg-up' : 'bg-brand')} aria-hidden="true" />
          <span className="font-medium text-fg">{notice.title}</span>
          {notice.description && <span className="truncate text-muted">· {notice.description}</span>}
        </>
      )}
    </p>
  );
}

/** Tur ekranı (hızlı tur ve meydan okuma turları). Kimlik değişince `key` ile yeniden kurulmalı. */
export default function RoundScreen({ id }: { id: string }) {
  const { notice, notify } = useRoundNotice();
  const { store, live, reload, actions } = useArenaRound(id, {
    onServerClose: (p) => {
      const label = store.model?.round.instruments.find((i) => i.code === p.instrument)?.label ?? p.instrument;
      const reason = p.close_reason ? CLOSE_REASON_LABELS[p.close_reason] : 'Kapanış';
      notify(p.pnl >= 0 ? 'success' : 'info', `${label}: ${reason.toLocaleLowerCase('tr')} tetiklendi`, <PnlText value={p.pnl} />);
    },
  });
  const m = store.model;

  if (!m) {
    if (store.error) {
      const missing = store.error instanceof ApiError && [400, 403, 404].includes(store.error.status);
      return (
        <Card>
          <EmptyState
            icon={<BoltIcon />}
            title={missing ? 'Tur bulunamadı' : 'Tur yüklenemedi'}
            description={missing ? 'Bu tur yok ya da sana ait değil.' : store.error instanceof Error ? store.error.message : 'Beklenmeyen bir hata oluştu.'}
            action={
              <div className="flex gap-3">
                <LinkButton href="/arena" variant="secondary" size="sm">
                  Arena&apos;ya dön
                </LinkButton>
                {!missing && (
                  <Button size="sm" onClick={reload}>
                    Tekrar dene
                  </Button>
                )}
              </div>
            }
          />
        </Card>
      );
    }
    return <RoundSkeleton />;
  }
  return <RoundView m={m} live={live} reload={reload} actions={actions} notice={notice} notify={notify} />;
}

function RoundSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Tur yükleniyor">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-7 w-56" />
        </div>
        <Skeleton className="h-20 w-full max-w-80 rounded-2xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-[380px] rounded-2xl" />
    </div>
  );
}

function RoundView({
  m,
  live,
  reload,
  actions,
  notice,
  notify,
}: {
  m: RoundModel;
  live: boolean;
  reload: () => void;
  actions: Actions;
  notice: Notice | null;
  notify: Notify;
}) {
  const toast = useToast();
  const { round, me, quotes, open, closed } = m;
  const instruments = round.instruments;
  const [selected, setSelected] = useState<string | null>(null);
  const code = selected && instruments.some((i) => i.code === selected) ? selected : (instruments[0]?.code ?? '');
  const ins = instruments.find((i) => i.code === code) ?? { code, label: code, decimals: 2 };
  const quote = quotes[code];

  const [settings, setSettings] = useState<TradeSettingsValue>(DEFAULT_TRADE_SETTINGS);
  const [submitting, setSubmitting] = useState<ArenaSide | null>(null);
  const [closing, setClosing] = useState<ReadonlySet<string>>(() => new Set());
  const [closingAll, setClosingAll] = useState(false);
  const [editing, setEditing] = useState<ArenaPosition | null>(null);
  const [endDismissed, setEndDismissed] = useState(false);
  const { start, starting } = useArenaStart();

  const finished = round.status === 'finished';
  const scheduled = round.status === 'scheduled';
  const canTrade = round.status === 'running' && me.joined;
  const challenge = round.kind === 'challenge' ? round.challenge : null;

  // Süre dolduğu hâlde bitiş olayı gelmediyse (ör. bağlantı koptu) durumu sunucudan al
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
      toast.error('Tutar çok düşük', { description: `En az ${formatUSD(MIN_AMOUNT)} ile işlem açabilirsin.` });
      return;
    }
    if (amount > me.cash + 1e-9) {
      toast.error('Yetersiz nakit', { description: `Kullanılabilir: ${formatUSD(me.cash)}` });
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
      notify('success', `${ins.label} ${side === 'long' ? 'alındı' : 'açığa satıldı'}`, `${formatUSD(amount)} · giriş ${formatPrice(p.entry_price || ref, ins.decimals)}`);
    } catch (err) {
      toast.error('İşlem açılamadı', { description: err instanceof Error ? err.message : 'Lütfen tekrar dene.' });
    } finally {
      setSubmitting(null);
    }
  };

  const closeOne = async (p: ArenaPosition) => {
    setClosing((s) => new Set(s).add(p.id));
    try {
      const res = await actions.close(p.id);
      const label = instruments.find((i) => i.code === p.instrument)?.label ?? p.instrument;
      notify('success', `${label} kapatıldı`, <PnlText value={res.pnl} />);
    } catch (err) {
      toast.error('Pozisyon kapatılamadı', { description: err instanceof Error ? err.message : 'Lütfen tekrar dene.' });
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
      notify('success', `${list.length || open.length} pozisyon kapatıldı`, <PnlText value={total} />);
    } catch (err) {
      toast.error('Pozisyonlar kapatılamadı', { description: err instanceof Error ? err.message : 'Lütfen tekrar dene.' });
    } finally {
      setClosingAll(false);
    }
  };

  const saveStops = async (p: ArenaPosition, body: { stop_loss: number | null; take_profit: number | null }) => {
    try {
      await actions.updateStops(p.id, body);
      notify('success', 'Seviyeler güncellendi');
    } catch (err) {
      toast.error('Seviyeler güncellenemedi', { description: err instanceof Error ? err.message : 'Lütfen tekrar dene.' });
      throw err;
    }
  };

  /* ---------------- Klavye kısayolları ---------------- */

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

  /* ---------------- Grafik işaretleri / çizgileri ---------------- */

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
  const spread = quote ? quote.ask - quote.bid : null;
  const countdownTarget = m.countdownUntil ?? Date.parse(round.starts_at) - m.clockOffset;
  const buttonNote = scheduled ? 'Tur başlamak üzere' : finished ? 'Tur bitti' : !me.joined ? 'İzleyici modundasın' : null;

  const buttons = (compact?: boolean) => (
    <TradeButtons quote={quote} decimals={ins.decimals} label={ins.label} disabled={!canTrade} submitting={submitting} onTrade={(s) => void trade(s)} note={buttonNote} compact={compact} />
  );

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Başlık + sayaç */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <Link href="/arena" className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-brand">
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
            Arena
          </Link>
          <h1 className="text-xl font-semibold text-fg sm:text-2xl">{challenge ? challenge.title : `Hızlı tur · ${durationLabel(round.duration_s)}`}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <ReplayChip />
            {!finished && <LiveDot live={live} />}
            {challenge?.sponsor && (
              <Badge tone="brand">
                <SparklesIcon className="h-3 w-3" aria-hidden="true" />
                Sponsor: {challenge.sponsor}
              </Badge>
            )}
            {challenge?.prize_text && (
              <Badge tone="gold">
                <GiftIcon className="h-3 w-3" aria-hidden="true" />
                {challenge.prize_text}
              </Badge>
            )}
            <ShortcutsTip align="left" />
          </div>
        </div>
        <Card featured className="w-full p-4 sm:p-5 lg:w-80">
          <RoundTimer round={round} clockOffset={m.clockOffset} />
        </Card>
      </div>

      {!me.joined && !finished && <Alert tone="info">Bu turu izliyorsun. İşlem yapmak için meydan okumaya katılman gerekir.</Alert>}
      {finished && endDismissed && (
        <Alert tone="info">
          <span className="inline-flex flex-wrap items-center gap-x-2">
            Bu tur bitti.
            <button type="button" onClick={() => setEndDismissed(false)} className="font-semibold underline underline-offset-2">
              Sonuçları göster
            </button>
          </span>
        </Alert>
      )}

      <InstrumentTabs instruments={instruments} quotes={quotes} selected={code} onSelect={setSelected} />

      <div className="relative grid gap-4 md:gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4 md:space-y-5">
          {/* Grafik */}
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-4 pt-4 sm:px-6 sm:pt-5">
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-muted">{ins.label}</h2>
                <PriceTick value={quote?.mid ?? null} className="mt-0.5 inline-block text-2xl font-semibold text-fg sm:text-3xl">
                  {formatPrice(quote?.mid, ins.decimals)}
                </PriceTick>
              </div>
              <dl className="flex items-center gap-4 text-xs text-muted">
                <div>
                  <dt>Alış (bid)</dt>
                  <dd className="num font-medium text-fg">{formatPrice(quote?.bid, ins.decimals)}</dd>
                </div>
                <div>
                  <dt>Satış (ask)</dt>
                  <dd className="num font-medium text-fg">{formatPrice(quote?.ask, ins.decimals)}</dd>
                </div>
                <div>
                  <dt>Makas</dt>
                  <dd className="num font-medium text-fg">{formatPrice(spread, ins.decimals)}</dd>
                </div>
              </dl>
            </div>
            <ArenaChart
              code={code}
              label={ins.label}
              decimals={ins.decimals}
              points={points}
              durationS={round.duration_s}
              ticksTotal={round.ticks_total}
              markers={markers}
              lines={lines}
              rising={(quote?.change_pct_since_start ?? 0) >= 0}
              className="mx-1 mb-2 mt-2 h-[240px] sm:mx-2 sm:h-[320px] lg:h-[380px]"
            />
          </Card>

          <QuoteStrip feed={m.feed} instruments={instruments} className="lg:hidden" />

          {/* Hızlı işlem paneli */}
          <Card className="p-4 sm:p-5">
            <TradeSettings value={settings} onChange={setSettings} cash={me.cash} quote={quote} decimals={ins.decimals} disabled={!canTrade && !scheduled} />
            <div className="mt-5 hidden lg:block">{buttons()}</div>
          </Card>

          {closed.length > 0 && <ClosedTrades closed={closed} instruments={instruments} />}
          <ResponsibleNote className="px-1" />
        </div>

        <aside className="min-w-0 space-y-4 md:space-y-5 lg:sticky lg:top-24 lg:self-start">
          <QuoteFeed feed={m.feed} instruments={instruments} className={cn('hidden lg:flex', challenge ? 'lg:h-[400px]' : 'lg:h-[calc(100dvh-12rem)] lg:max-h-[640px]')} />
          {challenge && <LiveLeaderboard rows={m.leaderboard} description={`${m.leaderboard.length} oyuncu`} emptyText="Sıralama tur başlayınca görünür." />}
        </aside>

        {scheduled && (
          <CountdownOverlay
            target={countdownTarget}
            title={challenge ? challenge.title : 'Tur başlıyor'}
            subtitle={challenge ? `Başlangıç: ${formatDateTime(round.starts_at)}` : 'Hazır ol: AL için B, SAT için S.'}
          />
        )}
      </div>

      <PnlBar
        me={me}
        open={open}
        instruments={instruments}
        canTrade={canTrade}
        closing={closing}
        closingAll={closingAll}
        onClose={(p) => void closeOne(p)}
        onCloseAll={() => void closeAll()}
        onEditStops={setEditing}
        mobileActions={
          <>
            {buttons(true)}
            <InlineNotice notice={notice} />
          </>
        }
      />

      {editing && canTrade && (
        <StopsModal
          key={editing.id}
          position={open.find((p) => p.id === editing.id) ?? editing}
          instrument={instruments.find((i) => i.code === editing.instrument) ?? ins}
          onClose={() => setEditing(null)}
          onSave={(body) => saveStops(editing, body)}
        />
      )}

      {finished && m.final && (
        <RoundEndModal
          open={!endDismissed}
          onClose={() => setEndDismissed(true)}
          round={round}
          final={m.final}
          closed={closed}
          participants={challenge ? m.leaderboard.length || null : null}
          onReplay={() => void start(round.duration_s, instruments.map((i) => i.code))}
          replaying={starting}
        />
      )}
    </div>
  );
}

function ClosedTrades({ closed, instruments }: { closed: ArenaPosition[]; instruments: { code: string; label: string; decimals: number }[] }) {
  const total = closed.reduce((s, p) => s + p.pnl, 0);
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Bu turdaki işlemler" description={`${closed.length} kapanan pozisyon`} action={<PnlText value={total} className="text-sm" />} className="pb-3" />
      <ul className="divide-y divide-line border-t border-line">
        {closed.map((p) => {
          const m = instruments.find((i) => i.code === p.instrument) ?? { label: p.instrument, decimals: 2 };
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm sm:px-6">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <SideBadge side={p.side} />
                <span className="truncate font-medium text-fg">{m.label}</span>
                <span className="num hidden text-xs text-muted sm:inline">{formatUSD(p.amount)}</span>
              </span>
              <span className="num text-xs text-muted">
                {formatPrice(p.entry_price, m.decimals)} → {formatPrice(p.close_price, m.decimals)}
              </span>
              <span className="text-xs text-subtle">{p.close_reason ? CLOSE_REASON_LABELS[p.close_reason] : ''}</span>
              <PnlText value={p.pnl} className="text-sm" />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
