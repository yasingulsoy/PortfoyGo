'use client';

import { useEffect, useId, useMemo, useRef } from 'react';
import useSWR from 'swr';
import { CheckBadgeIcon, ChevronDownIcon, ExclamationTriangleIcon, LightBulbIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/solid';
import { cn, formatNumber, formatPercent, formatUSD } from '@portfoygo/shared/format';
import { ApiError, coachApi } from '@/lib/api';
import { useArenaInstruments } from '@/hooks/useArena';
import type { CoachBreakdown, CoachGrade, CoachInsightType, CoachReportData, CoachTradeRef } from '@/types';
import CoachAvatar from './CoachAvatar';
import { BREAKDOWN_PARTS, GRADE_COPY, coachMood, formatHold, pickInsights } from './model';
import styles from './coach.module.css';

/**
 * Not başına renk. `soft` başlık şeridinin zeminidir: oyun derisinde temadan bağımsız pastel (--g-c-bg-*,
 * üzerinde hep koyu mürekkep), normal uygulamada temanın yumuşak token'ı (bkz. coach.module.css).
 */
const GRADE_TONE: Record<CoachGrade, { fg: string; soft: string }> = {
  A: { fg: 'var(--c-gold)', soft: 'var(--g-c-bg-1, var(--gold-soft))' },
  B: { fg: 'var(--c-up)', soft: 'var(--g-c-bg-3, var(--up-soft))' },
  C: { fg: 'var(--c-brand)', soft: 'var(--g-c-bg-2, var(--brand-soft))' },
  D: { fg: 'var(--c-purple)', soft: 'var(--g-c-bg-5, var(--brand-soft))' },
  E: { fg: 'var(--c-down)', soft: 'var(--g-c-bg-4, var(--down-soft))' },
};

const INSIGHT_META: Record<CoachInsightType, { label: string; Icon: typeof CheckBadgeIcon; fg: string; soft: string }> = {
  good: { label: 'İyi gitti', Icon: CheckBadgeIcon, fg: 'var(--c-up)', soft: 'var(--c-up-soft)' },
  tip: { label: 'İpucu', Icon: LightBulbIcon, fg: 'var(--c-brand)', soft: 'var(--c-brand-soft)' },
  warning: { label: 'Dikkat', Icon: ExclamationTriangleIcon, fg: 'var(--c-gold)', soft: 'var(--c-gold-soft)' },
};

/** Tur henüz bitmediyse (409) birkaç kez yeniden dene; 403 / 404 ve diğerlerinde dur. */
function onErrorRetry(
  err: unknown,
  _key: string,
  _config: unknown,
  revalidate: (opts: { retryCount: number }) => void,
  { retryCount }: { retryCount: number },
) {
  if (!(err instanceof ApiError) || err.status !== 409 || retryCount >= 6) return;
  setTimeout(() => revalidate({ retryCount }), 2500);
}

export function useCoachReport(roundId: string | null | undefined) {
  return useSWR(roundId ? coachApi.key(roundId) : null, () => coachApi.report(roundId!), {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    onErrorRetry,
  });
}

/**
 * Tur sonu koç raporu (Koç Kemal): not rozeti, puan halkası, puan bileşenleri, 2–4 içgörü kartı ve mini istatistikler.
 * Yüklenirken, 403/404'te ve tur bitmemişken (409) hiçbir şey göstermez.
 */
export default function CoachReport({ roundId }: { roundId: string }) {
  const { data } = useCoachReport(roundId);
  const { data: instruments } = useArenaInstruments();
  const labels = useMemo(() => new Map((instruments ?? []).map((i) => [i.code, i.label])), [instruments]);
  if (!data) return null;
  return <CoachReportView report={data} labels={labels} />;
}

export function CoachReportView({
  report,
  labels,
  compact = false,
  className,
}: {
  report: CoachReportData;
  /** Enstrüman kodu → okunur ad */
  labels?: Map<string, string>;
  compact?: boolean;
  className?: string;
}) {
  const titleId = useId();
  const { grade, score, stats } = report;
  const copy = GRADE_COPY[grade];
  const tone = GRADE_TONE[grade];
  const insights = pickInsights(report.insights, 4);
  const name = (code: string | null) => (code ? (labels?.get(code) ?? code) : null);

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        styles.root,
        '@container overflow-hidden rounded-[20px] border-2 border-(--c-line) bg-(--c-surface) text-left',
        className,
      )}
    >
      {/* Başlık: koç + konuşma balonu + not */}
      <div className={cn('flex items-center gap-3 p-3 @md:gap-4 @md:p-4', styles.head)} style={{ background: tone.soft }}>
        <CoachAvatar mood={coachMood(grade)} size={compact ? 52 : 64} className={cn('shrink-0', styles.wobble)} />
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className={cn('text-[11px] font-extrabold uppercase tracking-wide', styles.headMuted)}>
            Koç Kemal&apos;in karnesi · {copy.label}
          </h3>
          <p className="mt-0.5 text-[15px] font-extrabold leading-snug @md:text-base">{report.headline ?? copy.line}</p>
        </div>
        <GradeBadge grade={grade} score={score} />
      </div>

      <div className="space-y-4 p-3 @md:p-4">
        {/* Mini istatistikler */}
        <dl className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
          <MiniStat label="İşlem" value={formatNumber(stats.trades, 0)} />
          <MiniStat label="Kazanma oranı" value={stats.trades ? formatPercent(stats.win_rate, { sign: false }) : '—'} />
          <MiniStat
            label="Getiri"
            value={stats.return_pct != null ? formatPercent(stats.return_pct) : '—'}
            tone={stats.return_pct != null && stats.return_pct > 0 ? 'up' : stats.return_pct != null && stats.return_pct < 0 ? 'down' : undefined}
          />
          <MiniStat
            label="En büyük düşüş"
            value={stats.max_drawdown_pct > 0 ? `-%${formatNumber(stats.max_drawdown_pct, 2)}` : '%0'}
            tone={stats.max_drawdown_pct > 0 ? 'down' : undefined}
          />
        </dl>

        {/* Puan bileşenleri */}
        {report.breakdown && <Breakdown breakdown={report.breakdown} />}

        {/* İçgörüler */}
        {insights.length > 0 && (
          <ul className="grid gap-2 @xl:grid-cols-2">
            {insights.map((ins, i) => {
              const meta = INSIGHT_META[ins.type];
              return (
                <li
                  key={`${ins.code}-${i}`}
                  className={cn('flex gap-3 rounded-2xl border-2 border-(--c-line) bg-(--c-surface) p-3', styles.rise)}
                  style={{ animationDelay: `${120 + i * 90}ms` }}
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: meta.soft, color: meta.fg }}>
                    <meta.Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold leading-snug">
                      <span className="sr-only">{meta.label}: </span>
                      {ins.title}
                    </p>
                    {ins.detail && <p className="mt-0.5 text-sm text-(--c-muted)">{ins.detail}</p>}
                    {ins.why && (
                      <details className="group mt-1.5">
                        <summary className={cn(styles.summary, 'inline-flex cursor-pointer items-center gap-1 rounded text-xs font-extrabold text-(--c-brand) focus-visible:outline-2')}>
                          <QuestionMarkCircleIcon className="h-4 w-4" aria-hidden="true" />
                          Neden önemli?
                          <ChevronDownIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
                        </summary>
                        <p className="mt-1 rounded-xl bg-(--c-surface-2) px-2.5 py-2 text-xs font-semibold text-(--c-muted)">{ins.why}</p>
                      </details>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Tüm istatistikler */}
        <details className="group rounded-2xl border-2 border-(--c-line) bg-(--c-surface-2)">
          <summary className={cn(styles.summary, 'flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm font-extrabold')}>
            Tüm istatistikler
            <ChevronDownIcon className="h-4 w-4 text-(--c-muted) transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <dl className="grid grid-cols-1 gap-x-6 px-3 pb-3 text-sm @lg:grid-cols-2">
            <Row label="Kazanan / kaybeden" value={`${stats.wins} / ${stats.losses}`} />
            <Row label="Toplam K/Z" value={stats.total_pnl != null ? signedUsd(stats.total_pnl) : '—'} tone={toneOf(stats.total_pnl)} />
            <Row label="Ortalama tutma" value={stats.trades ? formatHold(stats.avg_hold_s) : '—'} />
            <Row label="Dakikada işlem" value={formatNumber(stats.trades_per_min, 1)} />
            <Row label="Zarar durdur kullanımı" value={formatPercent(stats.sl_usage_pct, { sign: false })} />
            <Row label="Kâr al kullanımı" value={formatPercent(stats.tp_usage_pct, { sign: false })} />
            <Row label="En iyi işlem" value={tradeText(stats.best_trade, name)} tone={toneOf(stats.best_trade?.pnl)} />
            <Row label="En kötü işlem" value={tradeText(stats.worst_trade, name)} tone={toneOf(stats.worst_trade?.pnl)} />
            <Row label="Kullanılan piyasalar" value={stats.instruments_used.length ? stats.instruments_used.map((c) => name(c)).join(', ') : '—'} />
          </dl>
        </details>
        <p className="text-[11px] font-semibold text-(--c-faint)">Koç raporu eğitim amaçlıdır; yatırım tavsiyesi değildir.</p>
      </div>
    </section>
  );
}

const toneOf = (v: number | null | undefined): 'up' | 'down' | undefined => (v == null ? undefined : v > 0 ? 'up' : v < 0 ? 'down' : undefined);
const signedUsd = (v: number) => `${v > 0 ? '+' : ''}${formatUSD(v)}`;
const SIDE: Record<string, string> = { long: 'Al', short: 'Sat' };

function tradeText(t: CoachTradeRef | null, name: (code: string | null) => string | null): string {
  if (!t) return '—';
  const parts = [name(t.instrument), t.side ? (SIDE[t.side] ?? t.side) : null].filter(Boolean).join(' ');
  return parts ? `${parts} · ${signedUsd(t.pnl)}` : signedUsd(t.pnl);
}

function Breakdown({ breakdown }: { breakdown: CoachBreakdown }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const targets = BREAKDOWN_PARTS.map((p) => Math.round((breakdown[p.key] / p.max) * 100));
  const key = targets.join(',');

  // Çubukları sıfırdan doldur (DOM'a doğrudan; durum güncellemesi yok)
  useEffect(() => {
    const els = bars.current;
    const values = key.split(',').map(Number);
    els.forEach((el) => el && (el.style.width = '0%'));
    // Başlangıç genişliğini uygula ki geçiş görünsün
    void els[0]?.getBoundingClientRect();
    const id = requestAnimationFrame(() => els.forEach((el, i) => el && (el.style.width = `${values[i]}%`)));
    return () => cancelAnimationFrame(id);
  }, [key]);

  return (
    <div>
      <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-(--c-muted)">Puanın nereden geldi?</h4>
      <ul className="grid gap-x-4 gap-y-2 @md:grid-cols-2">
        {BREAKDOWN_PARTS.map((p, i) => {
          const v = breakdown[p.key];
          const pct = targets[i];
          const color = pct >= 70 ? 'var(--c-up)' : pct >= 40 ? 'var(--c-gold)' : 'var(--c-down)';
          return (
            <li key={p.key} title={p.hint}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs font-bold">
                <span>{p.label}</span>
                <span className="num text-(--c-muted)">
                  {formatNumber(v, 1)}/{p.max}
                </span>
              </div>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-(--c-track)"
                role="progressbar"
                aria-label={`${p.label}: ${p.max} üzerinden ${formatNumber(v, 1)}`}
                aria-valuemin={0}
                aria-valuemax={p.max}
                aria-valuenow={v}
              >
                <span
                  ref={(el) => {
                    bars.current[i] = el;
                  }}
                  className={cn('block h-full rounded-full', styles.bar)}
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GradeBadge({ grade, score }: { grade: CoachGrade; score: number }) {
  const ring = useRef<SVGCircleElement>(null);
  const r = 30;
  const c = 2 * Math.PI * r;
  const target = c * (1 - score / 100);
  const tone = GRADE_TONE[grade];

  // Halkayı sıfırdan hedefe doldur (DOM'a doğrudan yazılır; durum güncellemesi yok)
  useEffect(() => {
    const el = ring.current;
    if (!el) return;
    el.style.strokeDashoffset = String(c);
    void el.getBoundingClientRect();
    const id = requestAnimationFrame(() => {
      el.style.strokeDashoffset = String(target);
    });
    return () => cancelAnimationFrame(id);
  }, [c, target]);

  return (
    <div className="relative grid h-[76px] w-[76px] shrink-0 place-items-center" role="img" aria-label={`Not ${grade}, puan 100 üzerinden ${score}`}>
      <svg viewBox="0 0 76 76" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="38" cy="38" r={r} fill="var(--c-surface)" stroke="var(--c-track)" strokeWidth="7" />
        <circle
          ref={ring}
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke={tone.fg}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={target}
          className={styles.ring}
        />
      </svg>
      <div className={cn('relative flex flex-col items-center leading-none', styles.pop)} aria-hidden="true">
        <span className="text-3xl font-black" style={{ color: tone.fg }}>
          {grade}
        </span>
        <span className="num mt-0.5 text-[11px] font-bold text-(--c-muted)">{score}/100</span>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-2xl bg-(--c-surface-2) px-3 py-2">
      <dt className="truncate text-[11px] font-bold text-(--c-muted)">{label}</dt>
      <dd className={cn('num mt-0.5 truncate text-base font-extrabold', tone === 'down' && 'text-(--c-down)', tone === 'up' && 'text-(--c-up)')}>{value}</dd>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-(--c-line) py-1.5 last:border-0">
      <dt className="text-(--c-muted)">{label}</dt>
      <dd className={cn('num min-w-0 truncate text-right font-bold', tone === 'down' && 'text-(--c-down)', tone === 'up' && 'text-(--c-up)')}>{value}</dd>
    </div>
  );
}
