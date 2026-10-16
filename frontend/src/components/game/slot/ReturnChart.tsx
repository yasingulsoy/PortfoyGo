'use client';

import { useId, useState, type PointerEvent } from 'react';
import { formatSignedPct, returnBand, type ReturnPoint } from './model';

const W = 320;
const H = 190;
const M = { top: 12, right: 14, bottom: 26, left: 40 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

const pct = (v: number) => formatSignedPct(v, 1);

function niceMax(n: number): number {
  const steps = [25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
  return steps.find((s) => s >= n) ?? Math.ceil(n / 10000) * 10000;
}

/** Y ekseni aralığı: ilk birkaç çevirmenin uç değerleri (ör. ilk çevirmede ×100) grafiği ezmesin diye n ≥ 3'ten. */
function yDomain(points: ReturnPoint[], expected: number): [number, number] {
  const vals = points.filter((p) => p.n >= 3).map((p) => p.return_pct);
  let lo = Math.min(-30, expected - 15, ...vals);
  let hi = Math.max(20, ...vals);
  lo = Math.max(-100, Math.floor(lo / 10) * 10);
  hi = Math.min(200, Math.ceil(hi / 10) * 10);
  return [lo, hi];
}

function ticks(lo: number, hi: number): number[] {
  const span = hi - lo;
  const step = span > 160 ? 50 : span > 80 ? 25 : span > 40 ? 20 : 10;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}

interface Props {
  points: ReturnPoint[];
  rtpPct: number;
  stdev: number;
}

/**
 * Büyük sayılar yasası: kullanıcının kümülatif getirisi (çizgi) ile teorik beklenti (kesikli, RTP − 100) ve
 * yaklaşık %95 olası aralık (bant, n büyüdükçe daralır). Üzerine gelince o çevirmedeki değer görünür.
 */
export default function ReturnChart({ points, rtpPct, stdev }: Props) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const expected = rtpPct - 100;
  const lastN = points.length ? points[points.length - 1].n : 0;
  const xMax = niceMax(Math.max(25, lastN));
  const [yLo, yHi] = yDomain(points, expected);

  const x = (n: number) => M.left + (n / xMax) * PW;
  const y = (v: number) => M.top + ((yHi - Math.min(yHi + 50, Math.max(yLo - 50, v))) / (yHi - yLo)) * PH;

  const band = (() => {
    const top: string[] = [];
    const bottom: string[] = [];
    const samples = 60;
    for (let i = 0; i <= samples; i += 1) {
      // Başta sık örnekle (bant hızla daralır)
      const n = Math.max(1, Math.round(xMax * Math.pow(i / samples, 2)));
      const b = returnBand(n, rtpPct, stdev);
      top.push(`${x(n).toFixed(1)},${y(b.upper).toFixed(1)}`);
      bottom.unshift(`${x(n).toFixed(1)},${y(b.lower).toFixed(1)}`);
    }
    return `M${top.join('L')}L${bottom.join('L')}Z`;
  })();

  const line = points.length ? `M${points.map((p) => `${x(p.n).toFixed(1)},${y(p.return_pct).toFixed(1)}`).join('L')}` : '';
  const last = points[points.length - 1];
  const hp = hover !== null ? points[hover] : null;
  const hBand = hp ? returnBand(hp.n, rtpPct, stdev) : null;

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    if (!points.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const n = ((e.clientX - rect.left) / rect.width) * xMax;
    let best = 0;
    for (let i = 1; i < points.length; i += 1) if (Math.abs(points[i].n - n) < Math.abs(points[best].n - n)) best = i;
    setHover(best);
  };

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby={`${clipId}-t`}>
        <title id={`${clipId}-t`}>
          {last
            ? `${last.n} çevirmede gerçekleşen getirin ${pct(last.return_pct)}; teorik beklenti ${pct(expected)}.`
            : `Teorik beklenti ${pct(expected)}; çevirdikçe kendi getirin burada çizilir.`}
        </title>
        <defs>
          <clipPath id={`${clipId}-c`}>
            <rect x={M.left} y={M.top} width={PW} height={PH} />
          </clipPath>
        </defs>

        {/* Izgara + eksen etiketleri (geri planda) */}
        {ticks(yLo, yHi).map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--g-ink-faint)' : 'var(--g-panel-3)'} strokeWidth={v === 0 ? 1.2 : 1} />
            <text x={M.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fontWeight={700} fill="var(--g-ink-soft)">
              {formatSignedPct(v, 0)}
            </text>
          </g>
        ))}
        {[0, xMax / 2, xMax].map((n) => (
          <text key={n} x={x(n)} y={H - 8} textAnchor={n === 0 ? 'start' : n === xMax ? 'end' : 'middle'} fontSize={10} fontWeight={700} fill="var(--g-ink-soft)">
            {n === xMax ? `${n.toLocaleString('tr-TR')} çevirme` : n.toLocaleString('tr-TR')}
          </text>
        ))}

        <g clipPath={`url(#${clipId}-c)`}>
          <path d={band} fill="var(--g-ink-faint)" opacity={0.18} />
          <line x1={M.left} x2={W - M.right} y1={y(expected)} y2={y(expected)} stroke="var(--g-ink-soft)" strokeWidth={2} strokeDasharray="6 4" />
          {line && <path d={line} fill="none" stroke="var(--g-blue)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {last && <circle cx={x(last.n)} cy={y(last.return_pct)} r={4} fill="var(--g-blue)" stroke="var(--g-panel)" strokeWidth={2} />}
          {hp && (
            <>
              <line x1={x(hp.n)} x2={x(hp.n)} y1={M.top} y2={M.top + PH} stroke="var(--g-ink-faint)" strokeWidth={1} />
              <circle cx={x(hp.n)} cy={y(hp.return_pct)} r={4.5} fill="var(--g-blue)" stroke="var(--g-panel)" strokeWidth={2} />
            </>
          )}
        </g>

        {/* Doğrudan etiket: teorik çizgi */}
        <text x={W - M.right - 2} y={y(expected) - 5} textAnchor="end" fontSize={10} fontWeight={800} fill="var(--g-ink-soft)">
          Teorik {pct(expected)}
        </text>

        <rect
          x={M.left}
          y={M.top}
          width={PW}
          height={PH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {hp && hBand && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-xl border-2 border-(--g-panel-edge) bg-(--g-panel) px-2.5 py-1.5 text-[11px] font-bold leading-snug text-(--g-ink) shadow-md"
          style={{ left: `${Math.min(62, Math.max(14, (x(hp.n) / W) * 100))}%`, transform: 'translateX(-50%)' }}
          aria-hidden="true"
        >
          <span className="block font-extrabold">{hp.n.toLocaleString('tr-TR')}. çevirme</span>
          <span className="block">Senin getirin: {pct(hp.return_pct)}</span>
          <span className="block text-(--g-ink-soft)">
            Teorik: {pct(expected)} (olası {pct(hBand.lower)} … {pct(hBand.upper)})
          </span>
        </div>
      )}
    </div>
  );
}
