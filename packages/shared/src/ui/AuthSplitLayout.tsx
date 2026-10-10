'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { ChevronLeftIcon, MoonIcon, SunIcon } from '@heroicons/react/20/solid';
import { cn } from '../format';
import Logo, { LogoMark } from './Logo';

/**
 * TailAdmin oturum açma düzeni: solda form sütunu, sağda (lg+) koyu marka paneli,
 * sağ altta yüzen tema düğmesi. Frontend ve admin giriş sayfaları aynı düzeni kullanır.
 */
interface AuthSplitLayoutProps {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Formun altındaki yardımcı satır (ör. "Hesabın yok mu? Kayıt ol") */
  footer?: ReactNode;
  /** Üstteki geri bağlantısı */
  backHref?: string;
  backLabel?: string;
  /** Geri bağlantısı başka bir uygulamaya gidiyorsa tam sayfa bağlantı kullanılır */
  backExternal?: boolean;
  /** Sayfanın en altındaki küçük bağlantılar (ör. yasal metinler) */
  legal?: ReactNode;
  /** Marka panelinde logonun altında gösterilecek rozet (ör. "Yönetim paneli") */
  panelBadge?: ReactNode;
  tagline?: ReactNode;
}

export default function AuthSplitLayout({
  title,
  description,
  children,
  footer,
  backHref = '/',
  backLabel = 'Ana sayfaya dön',
  backExternal = false,
  legal,
  panelBadge,
  tagline = 'Gerçek piyasa. Sanal para. Gerçek rekabet.',
}: AuthSplitLayoutProps) {
  const backClass = 'inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg';
  const back = (
    <>
      <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
      {backLabel}
    </>
  );

  return (
    <div className="relative min-h-dvh bg-surface dark:bg-canvas lg:grid lg:grid-cols-2">
      <div className="flex min-h-dvh flex-col px-4 py-5 sm:px-8 sm:py-8">
        <div className="mx-auto w-full max-w-md">
          {backExternal ? (
            <a href={backHref} className={backClass}>
              {back}
            </a>
          ) : (
            <Link href={backHref} className={backClass}>
              {back}
            </Link>
          )}
        </div>

        <main id="main" className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-md py-8 sm:py-10">
            <Link href="/" aria-label="PortfoyGo ana sayfa" className="mb-8 inline-flex rounded-lg lg:hidden">
              <Logo />
            </Link>
            {(title || description) && (
              <header className="mb-6 sm:mb-8">
                {title && <h1 className="text-2xl font-semibold text-fg sm:text-3xl">{title}</h1>}
                {description && <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>}
              </header>
            )}
            {children}
            {footer && <div className="mt-6 text-center text-sm text-muted sm:text-left">{footer}</div>}
          </div>
        </main>

        {legal && (
          <nav aria-label="Yasal bağlantılar" className="mx-auto flex w-full max-w-md flex-wrap items-center justify-center gap-x-5 gap-y-2 pb-14 text-xs text-subtle sm:justify-start lg:pb-0">
            {legal}
          </nav>
        )}
      </div>

      <BrandPanel tagline={tagline} badge={panelBadge} />
      <FloatingThemeToggle />
    </div>
  );
}

/* Izgara çizgileri marka zemininin üzerinde beyazın düşük opaklığıyla çizilir */
const GRID_STYLE = {
  backgroundImage:
    'linear-gradient(color-mix(in oklab, var(--brand-fg) 14%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklab, var(--brand-fg) 14%, transparent) 1px, transparent 1px)',
  backgroundSize: '56px 56px',
} as const;

function BrandPanel({ tagline, badge }: { tagline: ReactNode; badge?: ReactNode }) {
  return (
    <aside
      aria-hidden="true"
      className={cn(
        'sticky top-0 hidden h-dvh overflow-hidden lg:flex lg:items-center lg:justify-center',
        // TailAdmin'deki brand-950 tonu: açık temada marka + koyu gri, koyu temada marka + zemin karışımı
        'bg-[color-mix(in_oklab,var(--brand)_36%,var(--fg))] dark:bg-[color-mix(in_oklab,var(--brand)_18%,var(--surface-2))]',
      )}
    >
      {/* Sağ üst ve sol alt köşelerde silikleşen ızgara dokusu */}
      <div
        className="pointer-events-none absolute -right-px -top-px h-[45%] w-[60%]"
        style={{
          ...GRID_STYLE,
          maskImage: 'radial-gradient(100% 100% at 100% 0%, black, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(100% 100% at 100% 0%, black, transparent 75%)',
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-px -left-px h-[45%] w-[60%] rotate-180"
        style={{
          ...GRID_STYLE,
          maskImage: 'radial-gradient(100% 100% at 100% 0%, black, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(100% 100% at 100% 0%, black, transparent 75%)',
        }}
      />

      <div className="relative flex max-w-sm flex-col items-center px-6 text-center">
        <span className="inline-flex items-center gap-3">
          <LogoMark className="h-12 w-12" />
          <span className="text-3xl font-semibold tracking-tight text-brand-fg">PortfoyGo</span>
        </span>
        {badge && <div className="mt-4">{badge}</div>}
        <p className="mt-4 text-base leading-relaxed text-brand-fg/60">{tagline}</p>
      </div>
    </aside>
  );
}

const subscribe = () => () => {};

/** TailAdmin giriş sayfasındaki sağ alt köşede yüzen yuvarlak tema düğmesi. */
function FloatingThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Hidrasyon uyumsuzluğunu önlemek için tema yalnızca istemcide okunur
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const isDark = mounted ? resolvedTheme === 'dark' : false;

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Açık temaya geç' : 'Koyu temaya geç'}
      className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-brand-fg shadow-pop transition-colors hover:bg-brand-hover sm:bottom-6 sm:right-6 sm:h-14 sm:w-14"
    >
      {isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  );
}
