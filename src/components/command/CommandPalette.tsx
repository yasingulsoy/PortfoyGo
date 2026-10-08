'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type KeyboardEvent, type SVGProps } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  ArrowRightEndOnRectangleIcon,
  ArrowsRightLeftIcon,
  BriefcaseIcon,
  ClockIcon,
  CommandLineIcon,
  MagnifyingGlassIcon,
  NewspaperIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  SwatchIcon,
  TrophyIcon,
  UserCircleIcon,
  UserPlusIcon,
} from '@heroicons/react/20/solid';
import { useAuth } from '@/context/AuthContext';
import { useMarket } from '@/hooks/useMarketData';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useTrade } from '@/components/trade/TradeProvider';
import { assetHref } from '@/components/market/MarketTable';
import AssetAvatar from '@/components/ui/AssetAvatar';
import { Delta } from '@/components/ui/Delta';
import Spinner from '@/components/ui/Spinner';
import { cn, formatTRY } from '@/lib/format';
import { ASSET_TYPE_LABELS, type AssetType, type MarketAsset } from '@/types';
import { COMMAND_PALETTE_EVENT, anotherDialogOpen, isTypingTarget, openCommandPalette, openShortcutsHelp } from './events';

const RECENT_KEY = 'pg:recent-assets';
const MAX_RECENT = 5;
const MAX_ASSET_RESULTS = 8;
const TYPE_ORDER: AssetType[] = ['stock', 'crypto', 'currency', 'commodity'];

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

interface RecentAsset {
  type: AssetType;
  symbol: string;
  name: string;
  coinId?: string;
  image?: string;
}

type Item =
  | { kind: 'asset'; id: string; asset: RecentAsset & { priceTRY?: number | null; changePercent?: number }; recent?: boolean }
  | { kind: 'command'; id: string; label: string; hint?: string; icon: Icon; keywords: string; run: () => void };

interface Section {
  title: string;
  items: Item[];
}

/* ------------------------------------------------------------------ */
/* Platform (⌘ / Ctrl) bilgisi — yalnızca istemcide okunur              */

const noopSubscribe = () => () => {};

function useIsMac() {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}

/* ------------------------------------------------------------------ */

/**
 * Ctrl/⌘+K veya "/" ile açılan genel arama ve komut paleti.
 * Piyasa verisi yalnızca palet açıkken çekilir (PaletteBody içinde).
 */
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        if (anotherDialogOpen(ref.current)) return;
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target) && !anotherDialogOpen()) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => {
      if (!anotherDialogOpen(ref.current)) setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(COMMAND_PALETTE_EVENT, onOpen);
    };
  }, []);

  // <dialog> durumunu React durumuyla eşitle (yalnızca DOM işlemi)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <dialog
      ref={ref}
      aria-label="Arama ve komutlar"
      onClose={close}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      className={cn(
        'mx-auto mb-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-line bg-surface p-0 text-fg shadow-2xl',
        'max-sm:mt-3',
      )}
    >
      {open && <PaletteBody onClose={close} />}
    </dialog>
  );
}

/* ------------------------------------------------------------------ */

function normalize(s: string) {
  return s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
}

function scoreAsset(a: MarketAsset, q: string): number {
  const sym = normalize(a.symbol);
  const name = normalize(a.name);
  if (sym === q) return 0;
  if (sym.startsWith(q)) return 1;
  if (name.startsWith(q)) return 2;
  if (sym.includes(q)) return 3;
  if (name.includes(q)) return 4;
  return -1;
}

function parseRecent(raw: string | null): RecentAsset[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((r) => r && typeof r.symbol === 'string' && typeof r.type === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const { openTrade } = useTrade();
  const { resolvedTheme, setTheme } = useTheme();
  const market = useMarket();
  const [rawRecent, setRawRecent] = useLocalStorage(RECENT_KEY);
  const recent = useMemo(() => parseRecent(rawRecent), [rawRecent]);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const isMac = useIsMac();

  const q = normalize(query.trim());

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const commands = useMemo<Extract<Item, { kind: 'command' }>[]>(() => {
    const nav = (id: string, label: string, href: string, icon: Icon, keywords: string, hint?: string) => ({
      kind: 'command' as const,
      id,
      label,
      hint,
      icon,
      keywords,
      run: () => {
        onClose();
        router.push(href);
      },
    });
    const list = [
      nav('nav-markets', 'Piyasalar', '/', Squares2X2Icon, 'ana sayfa dashboard hisse kripto doviz emtia', 'G M'),
      nav('nav-portfolio', 'Portföy', '/portfolio', BriefcaseIcon, 'portfoy pozisyon varlik', 'G P'),
      nav('nav-transactions', 'İşlemler', '/transactions', ArrowsRightLeftIcon, 'islem gecmis alim satim', 'G I'),
      nav('nav-leaderboard', 'Liderlik', '/leaderboard', TrophyIcon, 'liderlik siralama yarisma', 'G L'),
      nav('nav-news', 'Haberler', '/news', NewspaperIcon, 'haber gundem', 'G H'),
      nav('nav-profile', 'Profil', '/profile', UserCircleIcon, 'profil hesap rozet ayar', 'G O'),
    ];
    if (user?.is_admin) list.push(nav('nav-admin', 'Yönetim paneli', '/admin', ShieldCheckIcon, 'admin yonetim'));
    if (!user) {
      list.push(nav('nav-login', 'Giriş yap', '/login', ArrowRightEndOnRectangleIcon, 'giris oturum login'));
      list.push(nav('nav-register', 'Hesap oluştur', '/register', UserPlusIcon, 'kayit hesap olustur register ucretsiz'));
    }
    const isDark = resolvedTheme === 'dark';
    return [
      ...list,
      {
        kind: 'command' as const,
        id: 'theme',
        label: isDark ? 'Açık temaya geç' : 'Koyu temaya geç',
        icon: SwatchIcon,
        keywords: 'tema degistir karanlik acik koyu dark light',
        run: () => {
          setTheme(isDark ? 'light' : 'dark');
          onClose();
        },
      },
      {
        kind: 'command' as const,
        id: 'shortcuts',
        label: 'Klavye kısayolları',
        icon: CommandLineIcon,
        keywords: 'klavye kisayol yardim',
        hint: '?',
        run: () => {
          onClose();
          // Palet kapandıktan sonra aç; iki modal üst üste binmesin
          setTimeout(openShortcutsHelp, 0);
        },
      },
    ];
  }, [user, resolvedTheme, setTheme, router, onClose]);

  const sections = useMemo<Section[]>(() => {
    if (!q) {
      const out: Section[] = [];
      if (recent.length) {
        out.push({
          title: 'Son aramalar',
          items: recent.map((r) => {
            const live = market.find(r.type, r.symbol);
            return {
              kind: 'asset',
              id: `recent:${r.type}:${r.symbol}`,
              recent: true,
              asset: { ...r, image: live?.image ?? r.image, priceTRY: live?.priceTRY, changePercent: live?.changePercent },
            };
          }),
        });
      }
      out.push({ title: 'Sayfalar ve komutlar', items: commands });
      return out;
    }

    const matches: { a: MarketAsset; s: number }[] = [];
    for (const type of TYPE_ORDER) {
      for (const a of market.byType[type]) {
        const s = scoreAsset(a, q);
        if (s >= 0) matches.push({ a, s });
      }
    }
    matches.sort((x, y) => x.s - y.s || TYPE_ORDER.indexOf(x.a.type) - TYPE_ORDER.indexOf(y.a.type));
    const assets: Item[] = matches.slice(0, MAX_ASSET_RESULTS).map(({ a }) => ({ kind: 'asset', id: `asset:${a.key}`, asset: a }));
    const cmds = commands.filter((c) => normalize(c.label).includes(q) || c.keywords.includes(q));

    const out: Section[] = [];
    if (assets.length) out.push({ title: 'Varlıklar', items: assets });
    if (cmds.length) out.push({ title: 'Komutlar', items: cmds });
    return out;
  }, [q, recent, commands, market]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  // Her bölümün düz listedeki başlangıç sırası (klavye gezinmesi için)
  const offsets = useMemo(() => sections.reduce<number[]>((acc, s, i) => [...acc, i === 0 ? 0 : acc[i - 1] + sections[i - 1].items.length], []), [sections]);
  const activeIndex = flat.length ? Math.min(active, flat.length - 1) : -1;
  const activeItem = activeIndex >= 0 ? flat[activeIndex] : undefined;
  const optionId = (i: number) => `${listId}-opt-${i}`;

  // Etkin seçeneği görünür alanda tut (yalnızca DOM)
  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const remember = (a: RecentAsset) => {
    const entry: RecentAsset = { type: a.type, symbol: a.symbol, name: a.name, coinId: a.coinId, image: a.image };
    const next = [entry, ...recent.filter((r) => !(r.type === a.type && r.symbol === a.symbol))].slice(0, MAX_RECENT);
    setRawRecent(JSON.stringify(next));
  };

  const selectAsset = (a: RecentAsset) => {
    remember(a);
    go(assetHref(a));
  };

  const tradeAsset = (a: RecentAsset) => {
    remember(a);
    if (!user) {
      go(`/login?redirect=${encodeURIComponent(assetHref(a))}`);
      return;
    }
    onClose();
    // Palet kapandıktan sonra işlem penceresini aç
    setTimeout(() => openTrade({ type: a.type, symbol: a.symbol, name: a.name, image: a.image }, 'buy'), 0);
  };

  const runItem = (item: Item, trade = false) => {
    if (item.kind === 'command') item.run();
    else if (trade) tradeAsset(item.asset);
    else selectAsset(item.asset);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!flat.length) return;
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + delta + flat.length) % flat.length);
    } else if (e.key === 'Home' && flat.length) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End' && flat.length) {
      e.preventDefault();
      setActive(flat.length - 1);
    } else if (e.key === 'Enter' && activeItem) {
      e.preventDefault();
      runItem(activeItem, e.shiftKey);
    }
  };

  const noAssets = q && !sections.some((s) => s.title === 'Varlıklar');
  const marketFailed = Object.values(market.errors).every(Boolean);

  return (
    <div className="flex max-h-[min(70vh,560px)] flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4">
        <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-subtle" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={flat.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-label="Varlık veya komut ara"
          placeholder="Varlık, sayfa veya komut ara…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-fg placeholder:text-subtle focus:outline-none"
        />
        {market.isLoading && q && <Spinner className="h-4 w-4 text-subtle" />}
        <kbd className="hidden rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-medium text-subtle sm:inline">Esc</kbd>
      </div>

      <div ref={listRef} id={listId} role="listbox" aria-label="Sonuçlar" className="flex-1 overflow-y-auto overscroll-contain p-2">
        {sections.map((section, si) => (
          <div key={section.title} role="group" aria-label={section.title} className="pb-1">
            <p className="px-2.5 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle" aria-hidden="true">
              {section.title}
            </p>
            {section.items.map((item, ii) => {
              const i = offsets[si] + ii;
              const selected = i === activeIndex;
              return (
                <div
                  key={item.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={selected}
                  data-index={i}
                  onMouseMove={() => {
                    if (!selected) setActive(i);
                  }}
                  onClick={() => runItem(item)}
                  className={cn(
                    'group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors',
                    selected ? 'bg-surface-2 text-fg' : 'text-muted',
                  )}
                >
                  {item.kind === 'asset' ? (
                    <AssetRow item={item} selected={selected} onTrade={() => tradeAsset(item.asset)} />
                  ) : (
                    <>
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-subtle')}>
                        <item.icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className={cn('min-w-0 flex-1 truncate font-medium', selected && 'text-fg')}>{item.label}</span>
                      {item.hint && <KeyHint keys={item.hint} />}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {noAssets && (
          <div className="px-3 py-6 text-center text-sm text-muted" role="status">
            {market.isLoading ? (
              'Piyasa verileri yükleniyor…'
            ) : marketFailed ? (
              'Piyasa verisine şu an ulaşılamıyor. Sayfalar ve komutlar yine de kullanılabilir.'
            ) : (
              <>
                <span className="font-medium text-fg">&ldquo;{query.trim()}&rdquo;</span> için varlık bulunamadı.
              </>
            )}
          </div>
        )}
      </div>

      <div className="hidden items-center gap-4 border-t border-line bg-surface-2/50 px-4 py-2.5 text-[11px] text-subtle sm:flex">
        <span className="inline-flex items-center gap-1.5"><KeyHint keys="↑ ↓" /> gez</span>
        <span className="inline-flex items-center gap-1.5"><KeyHint keys="Enter" /> aç</span>
        <span className="inline-flex items-center gap-1.5"><KeyHint keys="Shift Enter" /> al</span>
        <span className="ml-auto inline-flex items-center gap-1.5"><KeyHint keys={isMac ? '⌘ K' : 'Ctrl K'} /> aç/kapat</span>
      </div>
    </div>
  );
}

function AssetRow({ item, selected, onTrade }: { item: Extract<Item, { kind: 'asset' }>; selected: boolean; onTrade: () => void }) {
  const a = item.asset;
  return (
    <>
      {item.recent ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-subtle">
          <ClockIcon className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : (
        <AssetAvatar symbol={a.symbol} type={a.type} image={a.image} size={32} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn('font-mono text-[13px] font-semibold', selected ? 'text-fg' : 'text-fg/90')}>{a.symbol}</span>
          <span className="rounded bg-surface-3 px-1 text-[10px] font-medium text-subtle">{ASSET_TYPE_LABELS[a.type]}</span>
        </span>
        <span className="block truncate text-xs text-muted">{a.name}</span>
      </span>
      {a.priceTRY != null && (
        <span className="hidden text-right sm:block">
          <span className="num block text-[13px] font-medium text-fg">{formatTRY(a.priceTRY, { precise: true })}</span>
          {a.changePercent != null && <Delta value={a.changePercent} variant="text" className="text-[11px]" />}
        </span>
      )}
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onTrade();
        }}
        aria-label={`${a.symbol} al (Shift+Enter)`}
        className={cn(
          'shrink-0 rounded-lg bg-up-soft px-2.5 py-1 text-xs font-semibold text-up transition-opacity hover:bg-up hover:text-white',
          selected ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100',
        )}
      >
        Al
      </button>
    </>
  );
}

function KeyHint({ keys }: { keys: string }) {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {keys.split(' ').map((k) => (
        <kbd key={k} className="min-w-[1.25rem] rounded-md border border-line bg-surface px-1 py-px text-center font-sans text-[10px] font-medium text-subtle">
          {k}
        </kbd>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */

/** Üst menüdeki arama düğmesi: geniş ekranda kısayol ipucuyla, mobilde yalnızca simge. */
export function SearchTrigger() {
  const isMac = useIsMac();
  return (
    <>
      <button
        type="button"
        onClick={openCommandPalette}
        aria-label="Ara"
        aria-keyshortcuts="Control+K Meta+K /"
        className="hidden h-9 w-60 items-center gap-2 rounded-lg border border-line bg-surface-2 pl-3 pr-1.5 text-sm text-subtle transition-colors hover:border-line-strong hover:text-muted xl:flex"
      >
        <MagnifyingGlassIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">Ara…</span>
        <KeyHint keys={isMac ? '⌘ K' : 'Ctrl K'} />
      </button>
      <button
        type="button"
        onClick={openCommandPalette}
        aria-label="Ara"
        title={isMac ? 'Ara (⌘K)' : 'Ara (Ctrl+K)'}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg xl:hidden"
      >
        <MagnifyingGlassIcon className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
    </>
  );
}
