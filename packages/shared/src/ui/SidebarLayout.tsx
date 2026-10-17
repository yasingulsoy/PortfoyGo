'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode, type Ref, type SVGProps } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bars3BottomLeftIcon, MagnifyingGlassIcon, XMarkIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { cn } from '../format';
import Logo, { LogoMark } from './Logo';

/**
 * TailAdmin düzeni: daraltılabilir sol menü (masaüstü) / çekmece (mobil) + yapışkan üst çubuk.
 * Frontend ve admin uygulamaları aynı kabuğu farklı menü öğeleriyle kullanır.
 */

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface SidebarItem {
  href: string;
  label: string;
  icon: Icon;
  /** Sağdaki küçük rozet (ör. "YENİ" veya sayı) */
  badge?: ReactNode;
  /** Başka bir uygulamaya (tam sayfa) bağlantı */
  external?: boolean;
  /** Aktiflik kontrolü için özel eşleştirme */
  match?: (pathname: string) => boolean;
}

export interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

interface SidebarState {
  /** Masaüstünde menü genişletilmiş mi (daraltılmışta yalnızca ikonlar) */
  expanded: boolean;
  /** Mobil çekmece açık mı */
  mobileOpen: boolean;
  hovered: boolean;
  toggle: () => void;
  closeMobile: () => void;
  setHovered: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarState | undefined>(undefined);

function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar, SidebarLayout içinde kullanılmalı');
  return ctx;
}

export function isPathActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

interface SidebarLayoutProps {
  sections: SidebarSection[];
  /** Menünün altındaki kart (ör. toplam varlık özeti) */
  footer?: ReactNode;
  /** Üst çubuğun sağ tarafı (tema, bildirim, kullanıcı menüsü) */
  headerActions?: ReactNode;
  /** Arama kutusuna tıklanınca (ör. komut paletini aç) */
  onSearch?: () => void;
  searchPlaceholder?: string;
  searchShortcut?: string;
  /** Logo yanında küçük etiket (ör. "Yönetim") */
  logoBadge?: ReactNode;
  children: ReactNode;
}

export default function SidebarLayout(props: SidebarLayoutProps) {
  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const pathname = usePathname();

  const toggle = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) setExpanded((v) => !v);
    else setMobileOpen((v) => !v);
  }, []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  // Sayfa değişince mobil çekmeceyi kapat
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const value = useMemo(
    () => ({ expanded, mobileOpen, hovered, toggle, closeMobile, setHovered }),
    [expanded, mobileOpen, hovered, toggle, closeMobile],
  );
  return (
    <SidebarContext.Provider value={value}>
      <div className="min-h-dvh lg:flex">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:text-brand-fg"
        >
          İçeriğe geç
        </a>
        <Sidebar sections={props.sections} footer={props.footer} logoBadge={props.logoBadge} />
        {mobileOpen && <div aria-hidden="true" onClick={closeMobile} className="fixed inset-0 z-40 bg-overlay lg:hidden" />}
        {/* Daraltılmış menü üzerine gelince genişler ama içeriği itmez (üstüne açılır) */}
        <div className={cn('flex min-w-0 flex-1 flex-col transition-[margin] duration-300 ease-in-out', expanded ? 'lg:ml-[290px]' : 'lg:ml-[90px]')}>
          <Header {...props} />
          <main id="main" className="mx-auto w-full max-w-[1536px] flex-1 p-4 md:p-6">
            {props.children}
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}

function Sidebar({ sections, footer, logoBadge }: Pick<SidebarLayoutProps, 'sections' | 'footer' | 'logoBadge'>) {
  const { expanded, mobileOpen, hovered, setHovered, closeMobile } = useSidebar();
  const pathname = usePathname();
  const wide = expanded || hovered || mobileOpen;

  return (
    <aside
      aria-label="Ana menü"
      onMouseEnter={() => !expanded && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'fixed left-0 top-0 z-50 flex h-dvh flex-col border-r border-line bg-surface px-5 text-fg transition-[width,transform] duration-300 ease-in-out',
        wide ? 'w-[290px]' : 'w-[90px]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}
    >
      <div className={cn('flex h-[76px] shrink-0 items-center', wide ? 'justify-between' : 'justify-center')}>
        <Link href="/" className="flex items-center gap-2" aria-label="Ana sayfa">
          {wide ? <Logo /> : <LogoMark />}
          {wide && logoBadge}
        </Link>
        {mobileOpen && (
          <button type="button" onClick={closeMobile} aria-label="Menüyü kapat" className="rounded-lg p-1.5 text-muted hover:bg-surface-3 lg:hidden">
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="scrollbar-none -mx-1 flex-1 overflow-y-auto px-1 pb-6">
        {sections.map((section) => (
          <div key={section.title} className="mb-6">
            <h2 className={cn('mb-3 flex text-xs uppercase leading-5 text-subtle', wide ? 'justify-start' : 'justify-center')}>
              {wide ? section.title : <EllipsisHorizontalIcon className="h-5 w-5" aria-label={section.title} />}
            </h2>
            <ul className="flex flex-col gap-1">
              {section.items.map((item) => {
                const active = item.match ? item.match(pathname) : !item.external && isPathActive(pathname, item.href);
                const Icon = item.icon;
                const className = cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-brand-soft text-brand' : 'text-fg/80 hover:bg-surface-3 hover:text-fg',
                  !wide && 'justify-center px-0',
                );
                const content = (
                  <>
                    <Icon className={cn('h-6 w-6 shrink-0', active ? 'text-brand' : 'text-muted group-hover:text-fg')} aria-hidden="true" />
                    {wide && <span className="flex-1 truncate">{item.label}</span>}
                    {wide && item.badge}
                  </>
                );
                return (
                  <li key={item.href + item.label}>
                    {item.external ? (
                      <a href={item.href} className={className} title={wide ? undefined : item.label}>
                        {content}
                      </a>
                    ) : (
                      <Link href={item.href} aria-current={active ? 'page' : undefined} className={className} title={wide ? undefined : item.label}>
                        {content}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {footer && wide && <div className="mb-6 shrink-0">{footer}</div>}
    </aside>
  );
}

function Header({ headerActions, onSearch, searchPlaceholder = 'Ara veya komut yaz…', searchShortcut = '⌘K' }: SidebarLayoutProps) {
  const { toggle, mobileOpen } = useSidebar();

  return (
    <header className="sticky top-0 z-30 flex w-full border-b border-line bg-surface">
      <div className="flex w-full items-center justify-between gap-3 px-3 py-3 lg:px-6 lg:py-4">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-4">
          <button
            type="button"
            onClick={toggle}
            aria-label={mobileOpen ? 'Menüyü kapat' : 'Menüyü aç/kapat'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-surface-3 lg:h-11 lg:w-11"
          >
            <Bars3BottomLeftIcon className="h-5 w-5" />
          </button>
          <Link href="/" className="shrink-0 lg:hidden" aria-label="Ana sayfa">
            {/* Dar ekranlarda yalnızca işaret: sağdaki ikon düğmelerine yer kalsın */}
            <span className="flex sm:hidden">
              <LogoMark />
            </span>
            <span className="hidden sm:block">
              <Logo />
            </span>
          </Link>
          {onSearch && (
            <button
              type="button"
              onClick={onSearch}
              aria-label="Ara"
              className="hidden h-11 w-[300px] items-center gap-2.5 rounded-lg border border-line bg-transparent pl-4 pr-2 text-sm text-subtle shadow-card transition-colors hover:border-line-strong lg:flex xl:w-[430px]"
            >
              <MagnifyingGlassIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="flex-1 truncate text-left">{searchPlaceholder}</span>
              <kbd className="rounded-lg border border-line bg-surface-2 px-2 py-0.5 font-sans text-xs text-muted">{searchShortcut}</kbd>
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {onSearch && (
            <button
              type="button"
              onClick={onSearch}
              aria-label="Ara"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-muted transition-colors hover:bg-surface-3 hover:text-fg lg:hidden"
            >
              <MagnifyingGlassIcon className="h-5 w-5" />
            </button>
          )}
          {headerActions}
        </div>
      </div>
    </header>
  );
}

interface HeaderIconButtonProps {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  /** Sağ üstte yanıp sönen nokta (ör. yeni bildirim) */
  dot?: boolean;
  /** Sağ üstte sayı rozeti (0 veya tanımsızsa gösterilmez; 99'dan büyükse "99+") */
  count?: number;
  /** Açılır panel düğmesi olarak kullanıldığında erişilebilirlik öznitelikleri */
  expanded?: boolean;
  hasPopup?: 'menu' | 'dialog';
  controls?: string;
  ref?: Ref<HTMLButtonElement>;
}

/** TailAdmin üst çubuğundaki yuvarlak ikon düğmesi */
export function HeaderIconButton({ children, label, onClick, dot, count, expanded, hasPopup, controls, ref }: HeaderIconButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-haspopup={hasPopup}
      aria-expanded={hasPopup ? !!expanded : undefined}
      aria-controls={expanded ? controls : undefined}
      className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-muted transition-colors hover:bg-surface-3 hover:text-fg lg:h-11 lg:w-11',
        expanded && 'bg-surface-3 text-fg',
      )}
    >
      {count !== undefined && count > 0 ? (
        <span
          aria-hidden="true"
          className="num absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-brand-fg ring-2 ring-surface"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : (
        dot && (
          <span className="absolute right-0 top-0.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
          </span>
        )
      )}
      {children}
    </button>
  );
}
