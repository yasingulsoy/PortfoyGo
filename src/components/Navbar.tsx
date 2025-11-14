'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bars3Icon, XMarkIcon, ChartBarIcon, HomeIcon, BriefcaseIcon, ClockIcon, TrophyIcon, BellIcon, Cog6ToothIcon, UserIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/context/AuthContext';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();

  const navItems = [
    { href: '/', label: 'Ana Sayfa', icon: HomeIcon },
    { href: '/portfolio', label: 'Portföyüm', icon: BriefcaseIcon },
    { href: '/transactions', label: 'İşlemler', icon: ClockIcon },
    { href: '/leaderboard', label: 'Liderlik', icon: TrophyIcon },
  ];

  return (
    <header className="bg-gray-900/95 backdrop-blur-md border-b border-gray-700 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 sm:space-x-3">
            <div className="h-8 w-8 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
              <ChartBarIcon className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Sanal Yatırım</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link 
                key={href} 
                href={href} 
                className="inline-flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-300 dark:text-gray-300 hover:bg-gray-800 dark:hover:bg-gray-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all duration-200"
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-3">
                <button className="p-2 text-gray-400 hover:text-gray-300 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
                  <BellIcon className="h-5 w-5" />
                </button>
                <Link
                  href="/profile"
                  className="p-2 text-gray-400 hover:text-gray-300 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                  title="Profilim"
                >
                  <UserIcon className="h-5 w-5" />
                </Link>
                <div className="flex items-center gap-3 pl-3 border-l border-gray-200 dark:border-gray-700">
                  <span className="text-sm text-gray-300 dark:text-gray-300">
                    Hoş geldin, <span className="font-medium">{user.username}</span>
                  </span>
                  <button
                    onClick={logout}
                    className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                  >
                    Çıkış
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-3 py-1.5 text-sm text-gray-300 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors font-medium"
                >
                  Giriş
                </Link>
                <Link
                  href="/register"
                  className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                  Kayıt
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="lg:hidden flex items-center gap-2">
            <button
              onClick={() => setOpen(!open)}
              className="inline-flex items-center justify-center p-2 rounded-lg text-gray-300 dark:text-gray-300 hover:bg-gray-800 dark:hover:bg-gray-800 focus:outline-none transition-colors"
              aria-label="Toggle navigation"
            >
              {open ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="lg:hidden border-t border-gray-200  bg-white dark:bg-gray-900 shadow-lg">
          <div className="px-4 py-4 space-y-1">
            {/* Mobile Navigation */}
            <div className="space-y-1">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex items-center space-x-3 px-3 py-3 rounded-lg text-gray-300 dark:text-gray-300 hover:bg-gray-800 dark:hover:bg-gray-800 transition-colors"
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{label}</span>
                </Link>
              ))}
            </div>

            {/* Mobile User Actions */}
            {user ? (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm text-gray-300 dark:text-gray-300">
                    Hoş geldin, <span className="font-medium">{user.username}</span>
                  </span>
                  <button
                    onClick={logout}
                    className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                  >
                    Çıkış
                  </button>
                </div>
              </div>
            ) : (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-3 py-2 text-sm text-center text-gray-300 dark:text-gray-300 hover:bg-gray-800 dark:hover:bg-gray-800 rounded-lg transition-colors font-medium"
                >
                  Giriş
                </Link>
                <Link
                  href="/register"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-3 py-2 text-sm text-center bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                  Kayıt
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
