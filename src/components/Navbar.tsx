'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Bars3Icon, XMarkIcon, HomeIcon, BriefcaseIcon, ClockIcon, TrophyIcon, BellIcon, Cog6ToothIcon, UserIcon, NewspaperIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/context/AuthContext';
import { usePortfolio } from '@/context/PortfolioContext';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const { state: portfolioState } = usePortfolio();
  const pathname = usePathname();

  // Menü açıkken body scroll'unu engelle
  useEffect(() => {
    if (open) {
      // Scroll pozisyonunu kaydet
      const scrollY = window.scrollY;
      
      // Body'yi fixed yap ve scroll engelini koy
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    } else {
      // Önceki scroll pozisyonunu geri yükle
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
    
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
    };
  }, [open]);

  // Pathname değiştiğinde menüyü kapat
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const navItems = [
    { href: '/', label: 'Ana Sayfa', icon: HomeIcon },
    { href: '/portfolio', label: 'Portföyüm', icon: BriefcaseIcon },
    { href: '/transactions', label: 'İşlemler', icon: ClockIcon },
    { href: '/leaderboard', label: 'Liderlik', icon: TrophyIcon },
    { href: '/news', label: 'Haberler', icon: NewspaperIcon },
    { href: '/profile', label: 'Profilim', icon: UserIcon },
    ...(user && (user.is_admin === true || user.is_admin === 'true') ? [{ href: '/admin', label: 'Admin', icon: Cog6ToothIcon }] : []),
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
          {/* Logo - Mobile & Desktop */}
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0">
            <Image src="/fav.ico" alt="PortfoyGo" width={28} height={28} className="rounded-lg" />
            <span className="text-white text-xl sm:text-2xl font-bold">PortfoyGo</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1 flex-1 justify-center mx-4">
            {navItems && navItems.length > 0 ? (
              navItems.map(({ href, label, icon: Icon }) => {
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
              })
            ) : null}
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
              className="inline-flex items-center justify-center p-2 rounded-lg text-[#848e9c] hover:text-white hover:bg-[#2b3139] focus:outline-none transition-colors relative z-[100]"
              aria-label="Toggle navigation"
            >
              {open ? (
                <XMarkIcon className="h-6 w-6 transition-transform duration-300 rotate-90" />
              ) : (
                <Bars3Icon className="h-6 w-6 transition-transform duration-300" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Sidebar Menu */}
      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] lg:hidden"
            onClick={() => setOpen(false)}
            onTouchMove={(e) => e.preventDefault()}
            style={{ touchAction: 'none' }}
          />

          <div
            className="fixed top-0 right-0 h-screen w-[85vw] max-w-[340px] bg-[#0b0e11] z-[90] lg:hidden shadow-2xl shadow-black/60"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
          >
            <div className="flex flex-col h-full">

              {/* Header */}
              <div className="relative flex-shrink-0 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0ecb81]/10 via-transparent to-[#f0b90b]/5" />
                <div className="relative px-5 pt-5 pb-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Image src="/fav.ico" alt="PortfoyGo" width={24} height={24} className="rounded-md" />
                      <span className="text-white text-lg font-bold">PortfoyGo</span>
                    </div>
                    <button
                      onClick={() => setOpen(false)}
                      className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                      aria-label="Close menu"
                    >
                      <XMarkIcon className="h-4.5 w-4.5 text-[#848e9c]" />
                    </button>
                  </div>

                  {user && (
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#0ecb81] to-[#0ecb81]/60 flex items-center justify-center shadow-lg shadow-[#0ecb81]/20 flex-shrink-0">
                        <span className="text-white font-black text-lg">
                          {user.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-bold text-sm truncate">{user.username}</p>
                        <p className="text-[#5a6270] text-[11px] truncate">{user.email}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-[#f0b90b] text-xs font-bold">#{user.rank || '-'}</p>
                        <p className="text-[#5a6270] text-[9px] uppercase tracking-wider">Sıra</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-[#2b3139] to-transparent" />
              </div>

              {/* Portfolio Summary Card */}
              {user && (
                <div className="flex-shrink-0 px-4 py-3">
                  <div className="bg-[#141720] rounded-xl border border-[#2b3139]/50 p-3.5">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center">
                        <p className="text-[9px] text-[#5a6270] uppercase tracking-wider mb-1">Bakiye</p>
                        <p className="text-xs font-bold text-white">
                          ₺{(user.balance || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div className="text-center border-x border-[#2b3139]/50">
                        <p className="text-[9px] text-[#5a6270] uppercase tracking-wider mb-1">Portföy</p>
                        <p className="text-xs font-bold text-white">
                          ₺{(portfolioState.totalValue || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-[#5a6270] uppercase tracking-wider mb-1">K/Z</p>
                        <p className={`text-xs font-bold ${portfolioState.totalProfitLoss >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                          {portfolioState.totalProfitLoss >= 0 ? '+' : ''}
                          {portfolioState.totalValue > 0
                            ? `${(((portfolioState.totalProfitLoss || 0) / (portfolioState.totalValue - (portfolioState.totalProfitLoss || 0))) * 100).toFixed(1)}%`
                            : '0%'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="flex-shrink-0 px-4">
                <p className="text-[9px] text-[#5a6270] uppercase tracking-widest font-semibold px-1 mb-2">Menü</p>
                <nav className="space-y-0.5">
                  {navItems.map(({ href, label, icon: Icon }) => {
                    const active = isActive(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                          active
                            ? 'bg-[#0ecb81]/10'
                            : 'hover:bg-white/[0.03] active:bg-white/[0.05]'
                        }`}
                      >
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          active ? 'bg-[#0ecb81]/20' : 'bg-white/[0.04]'
                        }`}>
                          <Icon className={`h-4 w-4 ${active ? 'text-[#0ecb81]' : 'text-[#848e9c]'}`} />
                        </div>
                        <span className={`text-[13px] font-semibold ${active ? 'text-[#0ecb81]' : 'text-[#eaecef]'}`}>
                          {label}
                        </span>
                        {active && (
                          <div className="ml-auto h-1.5 w-1.5 bg-[#0ecb81] rounded-full shadow-[0_0_6px_rgba(14,203,129,0.6)]" />
                        )}
                      </Link>
                    );
                  })}
                </nav>
              </div>

              {/* Portfolio Assets */}
              <div className="flex-1 overflow-y-auto min-h-0 px-4 mt-4">
                {user && portfolioState.portfolioItems && portfolioState.portfolioItems.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2 px-1">
                      <p className="text-[9px] text-[#5a6270] uppercase tracking-widest font-semibold">Portföy Varlıkları</p>
                      <Link
                        href="/portfolio"
                        onClick={() => setOpen(false)}
                        className="text-[10px] text-[#0ecb81] font-semibold"
                      >
                        Tümü →
                      </Link>
                    </div>
                    <div className="space-y-1.5">
                      {portfolioState.portfolioItems.slice(0, 5).map((item) => (
                        <Link
                          key={item.id}
                          href={`/asset/${item.symbol}`}
                          onClick={() => setOpen(false)}
                          className="flex items-center justify-between px-3 py-2 bg-[#141720] rounded-lg hover:bg-[#1a1e28] active:bg-[#1a1e28] transition-colors"
                        >
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <div className="h-8 w-8 bg-white/[0.04] rounded-lg flex items-center justify-center flex-shrink-0">
                              <span className="text-[10px] font-bold text-[#848e9c]">
                                {item.symbol.slice(0, 2)}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold text-[#eaecef] truncate">{item.symbol}</p>
                              <p className="text-[9px] text-[#5a6270] truncate">{item.name}</p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <p className="text-[11px] font-bold text-[#eaecef]">
                              {item.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}
                            </p>
                            <p className={`text-[10px] font-semibold ${item.profitLoss >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                              {item.profitLoss >= 0 ? '+' : ''}{item.profitLossPercent.toFixed(2)}%
                            </p>
                          </div>
                        </Link>
                      ))}
                      {portfolioState.portfolioItems.length > 5 && (
                        <Link
                          href="/portfolio"
                          onClick={() => setOpen(false)}
                          className="block text-center py-2 text-[11px] text-[#5a6270] hover:text-[#0ecb81] transition-colors font-semibold"
                        >
                          +{portfolioState.portfolioItems.length - 5} varlık daha
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 p-4 mt-auto">
                <div className="h-px bg-gradient-to-r from-transparent via-[#2b3139] to-transparent mb-4" />
                {user ? (
                  <button
                    onClick={() => {
                      logout();
                      setOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#f6465d]/10 hover:bg-[#f6465d] text-[#f6465d] hover:text-white text-sm font-semibold transition-all duration-200"
                  >
                    <XMarkIcon className="h-4 w-4" />
                    Çıkış Yap
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <Link
                      href="/login"
                      onClick={() => setOpen(false)}
                      className="flex-1 text-center py-2.5 rounded-xl text-[#848e9c] hover:text-white bg-white/[0.03] hover:bg-white/[0.06] text-sm font-semibold transition-all"
                    >
                      Giriş
                    </Link>
                    <Link
                      href="/register"
                      onClick={() => setOpen(false)}
                      className="flex-1 text-center py-2.5 rounded-xl bg-[#0ecb81] hover:bg-[#0bb975] text-white text-sm font-semibold transition-all"
                    >
                      Kayıt Ol
                    </Link>
                  </div>
                )}
              </div>

            </div>
          </div>
        </>
      )}
    </header>
  );
}
