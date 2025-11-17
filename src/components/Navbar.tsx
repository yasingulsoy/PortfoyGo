'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bars3Icon, XMarkIcon, HomeIcon, BriefcaseIcon, ClockIcon, TrophyIcon, BellIcon, Cog6ToothIcon, UserIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/context/AuthContext';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Ana Sayfa', icon: HomeIcon },
    { href: '/portfolio', label: 'Portföyüm', icon: BriefcaseIcon },
    { href: '/transactions', label: 'İşlemler', icon: ClockIcon },
    { href: '/leaderboard', label: 'Liderlik', icon: TrophyIcon },
    ...(user?.is_admin ? [{ href: '/admin', label: 'Admin', icon: Cog6ToothIcon }] : []),
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname?.startsWith(href);
  };

  return (
    <header className="bg-[#181a20] border-b border-[#2b3139] sticky top-0 z-50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 sm:space-x-3 hover:opacity-80 transition-opacity">
            <Image
              src="/PortfoyGo.png"
              alt="PortfoyGo Logo"
              width={140}
              height={50}
              className="object-contain h-8 sm:h-10 brightness-0 invert"
              priority
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link 
                  key={href} 
                  href={href} 
                  className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    active
                      ? 'bg-[#0ecb81]/10 text-[#0ecb81]'
                      : 'text-[#848e9c] hover:text-white hover:bg-[#2b3139]'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <button className="p-2 text-[#848e9c] hover:text-white hover:bg-[#2b3139] rounded-lg transition-colors relative">
                  <BellIcon className="h-5 w-5" />
                  {/* Notification badge */}
                  <span className="absolute top-1 right-1 h-2 w-2 bg-[#f6465d] rounded-full"></span>
                </button>
                <Link
                  href="/profile"
                  className="p-2 text-[#848e9c] hover:text-white hover:bg-[#2b3139] rounded-lg transition-colors"
                  title="Profilim"
                >
                  <UserIcon className="h-5 w-5" />
                </Link>
                <div className="flex items-center gap-3 pl-3 border-l border-[#2b3139]">
                  <span className="text-sm text-[#848e9c]">
                    Hoş geldin, <span className="font-semibold text-white">{user.username}</span>
                  </span>
                  <button
                    onClick={logout}
                    className="px-4 py-2 text-sm bg-[#f6465d] hover:bg-[#e03e54] text-white rounded-lg transition-all font-semibold"
                  >
                    Çıkış
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-4 py-2 text-sm text-[#848e9c] hover:text-white transition-colors font-semibold"
                >
                  Giriş
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 text-sm bg-[#0ecb81] hover:bg-[#0bb975] text-white rounded-lg transition-all font-semibold"
                >
                  Kayıt Ol
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="lg:hidden flex items-center gap-2">
            {user && (
              <button className="p-2 text-[#848e9c] hover:text-white hover:bg-[#2b3139] rounded-lg transition-colors relative">
                <BellIcon className="h-5 w-5" />
                <span className="absolute top-1 right-1 h-2 w-2 bg-[#f6465d] rounded-full"></span>
              </button>
            )}
            <button
              onClick={() => setOpen(!open)}
              className="inline-flex items-center justify-center p-2 rounded-lg text-[#848e9c] hover:text-white hover:bg-[#2b3139] focus:outline-none transition-colors"
              aria-label="Toggle navigation"
            >
              {open ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="lg:hidden border-t border-[#2b3139] bg-[#181a20] shadow-lg">
          <div className="px-4 py-4 space-y-1">
            {/* Mobile Navigation */}
            <div className="space-y-1">
              {navItems.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors ${
                      active
                        ? 'bg-[#0ecb81]/10 text-[#0ecb81]'
                        : 'text-[#848e9c] hover:text-white hover:bg-[#2b3139]'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-semibold">{label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Mobile User Actions */}
            {user ? (
              <div className="pt-4 border-t border-[#2b3139]">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm text-[#848e9c]">
                    Hoş geldin, <span className="font-semibold text-white">{user.username}</span>
                  </span>
                  <button
                    onClick={logout}
                    className="px-4 py-2 text-sm bg-[#f6465d] hover:bg-[#e03e54] text-white rounded-lg transition-all font-semibold"
                  >
                    Çıkış
                  </button>
                </div>
              </div>
            ) : (
              <div className="pt-4 border-t border-[#2b3139] flex gap-2">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-3 py-2 text-sm text-center text-[#848e9c] hover:text-white hover:bg-[#2b3139] rounded-lg transition-colors font-semibold"
                >
                  Giriş
                </Link>
                <Link
                  href="/register"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-3 py-2 text-sm text-center bg-[#0ecb81] hover:bg-[#0bb975] text-white rounded-lg transition-all font-semibold"
                >
                  Kayıt Ol
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
