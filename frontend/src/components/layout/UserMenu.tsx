'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRightStartOnRectangleIcon, ShieldCheckIcon, UserCircleIcon, ChevronDownIcon } from '@heroicons/react/20/solid';
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
  const initial = user.username.charAt(0).toUpperCase();
  const item = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg p-1 pr-1.5 transition-colors hover:bg-surface-2"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-fg">{initial}</span>
        <ChevronDownIcon className="hidden h-4 w-4 text-subtle sm:block" aria-hidden="true" />
        <span className="sr-only">Kullanıcı menüsü</span>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-2xl">
          <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">
            <p className="truncate text-sm font-semibold text-fg">{user.username}</p>
            <p className="truncate text-xs text-subtle">{user.email}</p>
          </div>
          <div className="pt-1.5">
            <Link role="menuitem" href="/profile" className={item} onClick={() => setOpen(false)}>
              <UserCircleIcon className="h-4 w-4" /> Profil ve rozetler
            </Link>
            {user.is_admin && (
              <a role="menuitem" href={ADMIN_URL} className={item} onClick={() => setOpen(false)}>
                <ShieldCheckIcon className="h-4 w-4" /> Yönetim paneli
              </a>
            )}
            <button role="menuitem" type="button" onClick={logout} className={`${item} hover:text-down`}>
              <ArrowRightStartOnRectangleIcon className="h-4 w-4" /> Çıkış yap
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
