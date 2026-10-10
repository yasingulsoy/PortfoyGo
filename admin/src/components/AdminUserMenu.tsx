'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRightStartOnRectangleIcon, ArrowTopRightOnSquareIcon, ChevronDownIcon } from '@heroicons/react/20/solid';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { cn } from '@portfoygo/shared/format';
import { useAdminAuth } from '@/lib/auth';
import { APP_URL } from '@/lib/api';

/** TailAdmin üst çubuk kullanıcı açılır menüsü: avatar, ad, e-posta, siteye git ve çıkış. */
export default function AdminUserMenu() {
  const { user, logout } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-fg/80 transition-colors hover:bg-surface-3 hover:text-fg';

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-3 rounded-full text-fg/80">
        <UserInitial name={user.username} size={40} tone="gold" />
        <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:block">{user.username}</span>
        <ChevronDownIcon className={cn('hidden h-4 w-4 text-muted transition-transform sm:block', open && 'rotate-180')} aria-hidden="true" />
        <span className="sr-only">Kullanıcı menüsü</span>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-4 w-[260px] rounded-2xl border border-line bg-surface p-3 shadow-pop">
          <div className="px-1">
            <p className="truncate text-sm font-medium text-fg">{user.username}</p>
            <p className="mt-0.5 truncate text-xs text-muted">{user.email}</p>
          </div>
          <div className="mt-3 flex flex-col gap-1 border-y border-line py-3">
            <a role="menuitem" href={APP_URL} className={item} onClick={() => setOpen(false)}>
              <ArrowTopRightOnSquareIcon className="h-5 w-5 text-muted" aria-hidden="true" /> Siteye git
            </a>
          </div>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className={cn(item, 'mt-3 hover:text-down')}
          >
            <ArrowRightStartOnRectangleIcon className="h-5 w-5 text-muted" aria-hidden="true" /> Çıkış yap
          </button>
        </div>
      )}
    </div>
  );
}
