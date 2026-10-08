import { ArrowRightIcon, CheckCircleIcon, ShieldCheckIcon, TrophyIcon } from '@heroicons/react/20/solid';
import { LinkButton } from '@/components/ui/Button';
import AssetAvatar from '@/components/ui/AssetAvatar';
import { Delta } from '@/components/ui/Delta';
import { STARTING_BALANCE } from '@/lib/constants';
import { formatNumber } from '@/lib/format';
import type { AssetType } from '@/types';

const TRUST = ['Kredi kartı gerekmez', `${formatNumber(STARTING_BALANCE, 0)} ₺ sanal bakiye`, 'Hisse · kripto · döviz · emtia'];

export default function Hero() {
  return (
    <section
      aria-labelledby="landing-hero-title"
      className="relative isolate overflow-hidden rounded-3xl border border-line bg-surface px-5 py-12 sm:px-10 sm:py-16 lg:px-14 lg:py-20"
      style={{
        backgroundImage:
          'radial-gradient(60% 70% at 0% 0%, var(--brand-soft), transparent 70%), radial-gradient(50% 60% at 100% 100%, var(--brand-soft), transparent 70%)',
      }}
    >
      {/* Izgara dokusu */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          backgroundImage: 'linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(70% 70% at 30% 40%, black, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(70% 70% at 30% 40%, black, transparent 80%)',
        }}
      />

      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-up opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-up" />
            </span>
            Canlı fiyatlarla sanal yatırım oyunu
          </p>

          <h1 id="landing-hero-title" className="mt-6 text-[40px] font-semibold leading-[1.04] tracking-tight text-fg sm:text-6xl lg:text-[64px]">
            Gerçek piyasa.
            <br />
            <span className="text-brand">Sanal para.</span>
            <br />
            <span className="relative inline-block">
              Gerçek rekabet.
              <svg aria-hidden="true" viewBox="0 0 300 14" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-3 w-full text-brand">
                <path d="M2 10 C 60 3, 120 3, 170 7 S 260 12, 298 4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
              </svg>
            </span>
          </h1>

          <p className="mt-7 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            {formatNumber(STARTING_BALANCE, 0)} ₺ sanal bakiyeyle hisse, kripto, döviz ve emtia al-sat. Stratejini canlı fiyatlarla sına, haftalık
            yarışmada zirveye oyna — tek kuruşunu riske atmadan.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/register" size="lg" className="px-6 shadow-card">
              Ücretsiz başla
              <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
            </LinkButton>
            <LinkButton href="/login" size="lg" variant="secondary" className="px-6">
              Giriş yap
            </LinkButton>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
            {TRUST.map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <CheckCircleIcon className="h-4 w-4 text-up" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Süs amaçlı örnek grafik — gerçek veri göstermez                        */

const CLOSES = [100, 101.8, 100.9, 103.2, 102.4, 104.9, 104.1, 106.8, 105.2, 107.9, 110.4, 109.1, 111.7, 110.2, 113.6, 116.1, 114.8, 117.9, 116.6, 119.8, 121.4, 120.2, 123.1, 124.9];
const W = 480;
const H = 200;
const MIN = 97;
const MAX = 127;
const x = (i: number) => 12 + (i * (W - 24)) / (CLOSES.length - 1);
const y = (v: number) => H - 14 - ((v - MIN) / (MAX - MIN)) * (H - 34);

const CANDLES = CLOSES.map((c, i) => {
  const o = i === 0 ? 99.2 : CLOSES[i - 1];
  const wick = 0.7 + (i % 3) * 0.45;
  return { x: x(i), o: y(o), c: y(c), hi: y(Math.max(o, c) + wick), lo: y(Math.min(o, c) - wick), up: c >= o };
});
const LINE = CLOSES.map((c, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(c).toFixed(1)}`).join(' ');
const LAST = { x: x(CLOSES.length - 1), y: y(CLOSES[CLOSES.length - 1]) };

const HOLDINGS: { symbol: string; name: string; type: AssetType; change: number }[] = [
  { symbol: 'AAPL', name: 'Apple', type: 'stock', change: 1.84 },
  { symbol: 'BTC', name: 'Bitcoin', type: 'crypto', change: 4.21 },
  { symbol: 'GAU', name: 'Gram altın', type: 'commodity', change: -0.36 },
];

function HeroVisual() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-lg select-none lg:max-w-none">
      <div className="relative rounded-2xl border border-line bg-surface/90 p-5 shadow-card backdrop-blur sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">Örnek portföy</p>
            <p className="num mt-1.5 text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">₺124.860,40</p>
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <Delta value={24.86} />
              <span className="text-subtle">başlangıçtan bu yana</span>
            </div>
          </div>
          <div className="flex gap-1 rounded-lg bg-surface-2 p-1 text-[11px] font-medium text-subtle">
            {['1H', '1A', '3A', 'Tümü'].map((r) => (
              <span key={r} className={r === '1A' ? 'rounded-md bg-surface px-2 py-1 text-fg shadow-card' : 'px-2 py-1'}>
                {r}
              </span>
            ))}
          </div>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="mt-5 h-40 w-full overflow-visible sm:h-48">
          <defs>
            <linearGradient id="landing-hero-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--line)" strokeDasharray="3 6" />
          ))}
          {CANDLES.map((c, i) => (
            <g key={i} opacity="0.4" stroke={c.up ? 'var(--up)' : 'var(--down)'} fill={c.up ? 'var(--up)' : 'var(--down)'}>
              <line x1={c.x} x2={c.x} y1={c.hi} y2={c.lo} strokeWidth="1.2" />
              <rect x={c.x - 4} width="8" y={Math.min(c.o, c.c)} height={Math.max(2, Math.abs(c.o - c.c))} rx="1.5" stroke="none" />
            </g>
          ))}
          <path d={`${LINE} L${LAST.x} ${H} L${x(0)} ${H} Z`} fill="url(#landing-hero-fill)" />
          <path d={LINE} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <line x1={LAST.x} x2={LAST.x} y1={LAST.y} y2={H} stroke="var(--brand)" strokeDasharray="2 4" opacity="0.6" />
          <circle cx={LAST.x} cy={LAST.y} r="9" fill="var(--brand)" opacity="0.25" className="origin-center [transform-box:fill-box] motion-safe:animate-ping" />
          <circle cx={LAST.x} cy={LAST.y} r="4.5" fill="var(--brand)" stroke="var(--surface)" strokeWidth="2" />
        </svg>

        <ul className="mt-4 grid grid-cols-3 gap-2">
          {HOLDINGS.map((h) => (
            <li key={h.symbol} className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-surface-2/60 p-2 sm:p-2.5">
              <AssetAvatar symbol={h.symbol} type={h.type} size={28} className="max-sm:hidden" />
              <div className="min-w-0">
                <p className="truncate font-mono text-[12px] font-semibold text-fg">{h.symbol}</p>
                <Delta value={h.change} variant="text" className="text-[11px]" />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Yüzen bildirimler */}
      <div className="absolute -left-6 bottom-24 hidden items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-xl sm:flex lg:-left-10">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-up-soft text-up">
          <ShieldCheckIcon className="h-4 w-4" />
        </span>
        <div className="leading-tight">
          <p className="text-xs font-semibold text-fg">Emir gerçekleşti</p>
          <p className="num mt-0.5 text-[11px] text-muted">5 AAPL · sunucu fiyatıyla</p>
        </div>
      </div>
      <div className="absolute -right-4 -top-5 hidden items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-xl sm:flex lg:-right-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-soft text-gold">
          <TrophyIcon className="h-4 w-4" />
        </span>
        <div className="leading-tight">
          <p className="text-xs font-semibold text-fg">Haftalık sıralama</p>
          <p className="num mt-0.5 text-[11px] text-muted">
            #3 <span className="text-up">▲ 2 basamak</span>
          </p>
        </div>
      </div>
    </div>
  );
}
