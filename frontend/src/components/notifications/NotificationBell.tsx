'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { BellIcon, BellSlashIcon } from '@heroicons/react/24/outline';
import { ArrowRightIcon, CheckIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { HeaderIconButton } from '@portfoygo/shared/ui/SidebarLayout';
import { Skeleton } from '@portfoygo/shared/ui/Feedback';
import { cn, formatNumber } from '@portfoygo/shared/format';
import { useNotifications } from '@/hooks/useNotifications';
import type { AppNotification } from '@/lib/api';
import { isExternalLink, isInternalLink } from './model';
import { NotificationIcon, NotificationMeta, UnreadDot } from './NotificationIcon';

const ITEM_SELECTOR = '[role="menuitem"]:not([disabled])';

/**
 * TailAdmin üst çubuk bildirim düğmesi + açılır panel.
 * Panel bir menüdür: açılınca ilk öğe odaklanır, ↑/↓/Home/End ile gezilir; Esc veya dışarı tıklama kapatır
 * (Esc odağı düğmeye geri verir). Mobilde üst çubuğun altında tam genişlikte açılır.
 */
export default function NotificationBell() {
  const { userId, unreadCount, recent, recentLoading, recentError, live, reloadRecent, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    // İlk bildirime (yoksa ilk etkin öğeye) odaklan
    const menu = menuRef.current;
    (menu?.querySelector<HTMLElement>(`[data-item]${ITEM_SELECTOR}`) ?? menu?.querySelector<HTMLElement>(ITEM_SELECTOR))?.focus({ preventScroll: true });

    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!userId) return null;

  const toggle = () => {
    // Canlı akış yoksa açarken listeyi tazele
    if (!open && !live) reloadRecent();
    setOpen((v) => !v);
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
    if (!nodes.length) return;
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? nodes.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + nodes.length) % nodes.length;
    nodes[next].focus();
  };

  const label = unreadCount > 0 ? `Bildirimler, ${formatNumber(unreadCount, 0)} okunmamış` : 'Bildirimler';

  return (
    <div ref={wrapRef} className="relative">
      <HeaderIconButton ref={buttonRef} label={label} onClick={toggle} count={unreadCount} expanded={open} hasPopup="menu" controls={menuId}>
        <BellIcon className="h-5 w-5" aria-hidden="true" />
      </HeaderIconButton>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={titleId}
          onKeyDown={onMenuKey}
          className={cn(
            'z-50 flex flex-col rounded-2xl border border-line bg-surface p-3 text-fg shadow-pop motion-safe:animate-[pg-pop-in_160ms_ease-out]',
            // Mobil: üst çubuğun altında tam genişlik; sm+: düğmenin altında sağa hizalı 350px
            'fixed inset-x-3 top-[73px] max-h-[calc(100dvh-88px)]',
            'sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-[13px] sm:max-h-[480px] sm:w-[350px] lg:mt-[17px]',
          )}
        >
          <style href="pg-pop-keyframes" precedence="default">
            {'@keyframes pg-pop-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}'}
          </style>

          <div role="none" className="mb-3 flex items-center justify-between gap-3 border-b border-line pb-3">
            <div role="none" className="flex min-w-0 items-center gap-2">
              <h2 id={titleId} className="text-lg font-semibold text-fg">
                Bildirimler
              </h2>
              {unreadCount > 0 && (
                <span role="none" className="num rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
                  {formatNumber(unreadCount, 0)} yeni
                </span>
              )}
            </div>
            <div role="none" className="flex items-center gap-1">
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={unreadCount === 0}
                onClick={() => void markAllRead()}
                className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-brand transition-colors hover:bg-brand-soft focus:bg-brand-soft focus:outline-none disabled:pointer-events-none disabled:text-subtle"
              >
                <CheckIcon className="h-4 w-4" aria-hidden="true" />
                Tümünü okundu say
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-label="Bildirimleri kapat"
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-3 hover:text-fg focus:bg-surface-3 focus:outline-none sm:hidden"
              >
                <XMarkIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div role="group" aria-label="Son bildirimler" className="-mx-1 min-h-0 overscroll-contain flex-1 overflow-y-auto px-1">
            {recentLoading ? (
              <ul aria-hidden="true" className="flex flex-col gap-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <li key={i} className="flex gap-3 px-2.5 py-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-3/5" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : recentError && recent.length === 0 ? (
              <div role="none" className="flex flex-col items-center px-4 py-8 text-center">
                <p className="text-sm font-medium text-fg">Bildirimler yüklenemedi</p>
                <p className="mt-1 text-xs text-muted">Bağlantını kontrol edip tekrar dene.</p>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={reloadRecent}
                  className="mt-3 rounded-lg px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand-soft focus:bg-brand-soft focus:outline-none"
                >
                  Tekrar dene
                </button>
              </div>
            ) : recent.length === 0 ? (
              <div role="none" className="flex flex-col items-center px-4 py-10 text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-3 text-subtle" aria-hidden="true">
                  <BellSlashIcon className="h-6 w-6" />
                </span>
                <p className="text-sm font-medium text-fg">Henüz bildirimin yok</p>
                <p className="mt-1 max-w-[16rem] text-xs text-muted">Emirlerin, rozetlerin ve liglerinle ilgili gelişmeler burada görünür.</p>
              </div>
            ) : (
              <ul role="none" className="flex flex-col gap-0.5">
                {recent.map((item) => (
                  <li key={item.id} role="none">
                    <PanelItem
                      item={item}
                      onSelect={() => {
                        void markRead(item);
                        setOpen(false);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href="/notifications"
            role="menuitem"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="mt-3 flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-sm font-medium text-fg/80 shadow-card transition-colors hover:bg-surface-3 hover:text-fg focus:bg-surface-3 focus:outline-none"
          >
            Tüm bildirimleri gör
            <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}

function PanelItem({ item, onSelect }: { item: AppNotification; onSelect: () => void }) {
  const unread = !item.read_at;
  const className = cn(
    'flex w-full gap-3 rounded-lg px-2.5 py-3 text-left transition-colors hover:bg-surface-3 focus:bg-surface-3 focus:outline-none',
    unread && 'bg-brand-soft/40',
  );
  const content: ReactNode = (
    <>
      <NotificationIcon item={item} />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm leading-snug', unread ? 'font-semibold text-fg' : 'font-medium text-fg/80')}>{item.title}</span>
        {item.body && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted">{item.body}</span>}
        <NotificationMeta item={item} className="mt-1.5" />
      </span>
      {unread && <UnreadDot className="mt-1.5" />}
    </>
  );

  if (isInternalLink(item.link)) {
    return (
      <Link href={item.link} role="menuitem" tabIndex={-1} data-item onClick={onSelect} className={className}>
        {content}
      </Link>
    );
  }
  if (isExternalLink(item.link)) {
    return (
      <a href={item.link} target="_blank" rel="noopener noreferrer" role="menuitem" tabIndex={-1} data-item onClick={onSelect} className={className}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" role="menuitem" tabIndex={-1} data-item onClick={onSelect} className={className}>
      {content}
    </button>
  );
}
