import type { ReactNode } from 'react';
import Link from 'next/link';
import { BoltIcon, BanknotesIcon, TrophyIcon } from '@heroicons/react/20/solid';
import Logo, { LogoMark } from '@portfoygo/shared/ui/Logo';
import ThemeToggle from '@portfoygo/shared/ui/ThemeToggle';
import { STARTING_BALANCE } from '@/lib/constants';
import { formatNumber } from '@portfoygo/shared/format';

interface AuthLayoutProps {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Kartın altındaki yardımcı satır (ör. "Hesabın yok mu? Kayıt ol") */
  footer?: ReactNode;
}

const VALUE_POINTS = [
  { icon: BoltIcon, title: 'Gerçek zamanlı veriler', text: 'Hisse, kripto, döviz ve emtia fiyatları canlı piyasadan gelir.' },
  { icon: BanknotesIcon, title: `${formatNumber(STARTING_BALANCE, 0)} ₺ sanal bakiye`, text: 'Risk almadan strateji dene; gerçek para asla gerekmez.' },
  { icon: TrophyIcon, title: 'Liderlik tablosu', text: 'Getirini diğer yatırımcılarla karşılaştır, haftalık sıralamada yüksel.' },
];

/** Giriş, kayıt, doğrulama ve şifre sıfırlama sayfalarının ortak bölünmüş ekran düzeni. */
export default function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <BrandPanel />

      <div className="flex min-h-dvh flex-col px-4 py-5 sm:px-8">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="PortfoyGo ana sayfa" className="rounded-lg lg:invisible">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>

        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            {(title || description) && (
              <header className="mb-7">
                {title && <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>}
                {description && <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p>}
              </header>
            )}
            {children}
            {footer && <div className="mt-8 border-t border-line pt-6 text-center text-sm text-muted">{footer}</div>}
          </div>
        </main>

        <nav aria-label="Yasal bağlantılar" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-subtle">
          <Link href="/terms" className="hover:text-fg">Kullanım şartları</Link>
          <Link href="/privacy" className="hover:text-fg">Gizlilik politikası</Link>
          <span>© {new Date().getFullYear()} PortfoyGo</span>
        </nav>
      </div>
    </div>
  );
}

function BrandPanel() {
  return (
    <aside
      className="relative hidden overflow-hidden border-r border-line bg-surface lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14"
      style={{
        backgroundImage:
          'radial-gradient(70% 55% at 15% 0%, var(--brand-soft), transparent 70%), radial-gradient(60% 50% at 100% 100%, var(--brand-soft), transparent 70%)',
      }}
    >
      {/* İnce ızgara dokusu */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: 'linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(80% 60% at 30% 30%, black, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(80% 60% at 30% 30%, black, transparent 75%)',
        }}
      />

      <Link href="/" className="relative inline-flex w-fit items-center gap-2.5 rounded-lg" aria-label="PortfoyGo ana sayfa">
        <LogoMark className="h-9 w-9" />
        <span className="text-lg font-semibold tracking-tight text-fg">
          Portfoy<span className="text-brand">Go</span>
        </span>
      </Link>

      <div className="relative max-w-lg py-12">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-up" />
          </span>
          Piyasalar canlı
        </p>
        <h2 className="text-4xl font-semibold leading-[1.1] tracking-tight text-fg xl:text-5xl">
          Gerçek piyasa,
          <br />
          <span className="text-brand">sanal para.</span>
        </h2>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">
          Gerçek fiyatlarla al-sat yap, portföyünü büyüt ve stratejini risksiz biçimde sına.
        </p>

        <ul className="mt-9 space-y-5">
          {VALUE_POINTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-fg">{title}</p>
                <p className="mt-0.5 text-sm text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <DecorativeChart />
    </aside>
  );
}

/** Yalnızca süs amaçlı; gerçek veri göstermez. */
function DecorativeChart() {
  const line = 'M0 132 C 28 126, 44 108, 70 112 S 112 136, 140 118 S 182 70, 212 84 S 252 112, 282 88 S 330 40, 362 52 S 410 30, 440 18';
  return (
    <div aria-hidden="true" className="relative rounded-2xl border border-line bg-surface/80 p-5 shadow-card backdrop-blur">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">Örnek portföy</p>
          <p className="num mt-1 text-xl font-semibold tracking-tight text-fg">₺112.480,25</p>
        </div>
        <span className="num rounded-md bg-up-soft px-2 py-0.5 text-xs font-medium text-up">+%12,48</span>
      </div>
      <svg viewBox="0 0 440 150" preserveAspectRatio="none" className="mt-4 h-28 w-full overflow-visible">
        <defs>
          <linearGradient id="auth-chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[38, 76, 114].map((y) => (
          <line key={y} x1="0" x2="440" y1={y} y2={y} stroke="var(--line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={`${line} L440 150 L0 150 Z`} fill="url(#auth-chart-fill)" />
        <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2.25" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
