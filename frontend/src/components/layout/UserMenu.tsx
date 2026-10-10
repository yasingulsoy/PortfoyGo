'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRightStartOnRectangleIcon, ShieldCheckIcon, UserCircleIcon, ChevronDownIcon, UserGroupIcon } from '@heroicons/react/20/solid';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_URL } from '@/lib/site';

export default function UserMenu() {
  const { user, logout } = useAuth();
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
  const initial = user.username.charAt(0).toLocaleUpperCase('tr');
  const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-fg/80 transition-colors hover:bg-surface-3 hover:text-fg';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-3 text-fg/80"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-fg lg:h-11 lg:w-11">{initial}</span>
        <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:block">{user.username}</span>
        <ChevronDownIcon className={`hidden h-4 w-4 text-muted transition-transform sm:block ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        <span className="sr-only">Kullanıcı menüsü</span>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-4 w-[260px] rounded-2xl border border-line bg-surface p-3 shadow-pop">
          <div className="px-1">
            <p className="truncate text-sm font-medium text-fg">{user.username}</p>
            <p className="mt-0.5 truncate text-xs text-muted">{user.email}</p>
          </div>
          <div className="mt-3 flex flex-col gap-1 border-b border-line pb-3 pt-3 border-t">
            <Link role="menuitem" href="/profile" className={item} onClick={() => setOpen(false)}>
              <UserCircleIcon className="h-5 w-5 text-muted" /> Profil ve rozetler
            </Link>
            <Link role="menuitem" href="/leagues" className={item} onClick={() => setOpen(false)}>
              <UserGroupIcon className="h-5 w-5 text-muted" /> Liglerim
            </Link>
            {user.is_admin && (
              <a role="menuitem" href={ADMIN_URL} className={item} onClick={() => setOpen(false)}>
                <ShieldCheckIcon className="h-5 w-5 text-muted" /> Yönetim paneli
              </a>
            )}
          </div>
          <button role="menuitem" type="button" onClick={logout} className={`${item} mt-3 hover:text-down`}>
            <ArrowRightStartOnRectangleIcon className="h-5 w-5 text-muted" /> Çıkış yap
          </button>
        </div>
      )}
    </div>
  );
}
