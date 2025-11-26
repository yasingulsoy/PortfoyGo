'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Bars3Icon, XMarkIcon, HomeIcon, BriefcaseIcon, ClockIcon, TrophyIcon, BellIcon, Cog6ToothIcon, UserIcon, CurrencyDollarIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline';
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
    { href: '/profile', label: 'Profilim', icon: UserIcon },
    ...(user?.is_admin ? [{ href: '/admin', label: 'Admin', icon: Cog6ToothIcon }] : []),
  ];

  console.log('📊 Navbar Component - navItems oluşturuldu:', navItems);
  console.log('📊 user bilgisi:', user);

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
          <Link href="/" className="flex items-center space-x-2 sm:space-x-3 hover:opacity-80 transition-opacity flex-shrink-0">
            <span className="text-white text-xl sm:text-2xl font-bold">PortfoyGo</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1 flex-1 justify-center mx-4">
            {(() => {
              console.log('🖥️ Desktop Menü - navItems:', navItems);
              return null;
            })()}
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
              className="inline-flex items-center justify-center p-2 rounded-lg text-[#848e9c] hover:text-white hover:bg-[#2b3139] focus:outline-none transition-colors relative z-50"
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

      {/* Mobile Sidebar Menu - Modern Slide-in from Right */}
      {open && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
            onClick={() => setOpen(false)}
            onTouchMove={(e) => e.preventDefault()}
            style={{ touchAction: 'none' }}
          />

          {/* Sidebar - Mobil için optimize edilmiş */}
          <div
            className="fixed top-0 right-0 h-full w-full max-w-sm bg-[#1e2329] border-l border-[#2b3139] z-50 lg:hidden transform translate-x-0 transition-transform duration-300 ease-in-out shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
          >
          <div className="flex flex-col h-full bg-[#1e2329]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-[#2b3139] bg-[#181a20] flex-shrink-0">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {user && (
                  <div className="h-10 w-10 bg-[#0ecb81]/20 rounded-full flex items-center justify-center border-2 border-[#0ecb81] flex-shrink-0">
                    <span className="text-lg font-bold text-[#0ecb81]">
                      {user.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-white truncate">Menü</h2>
                  {user && (
                    <p className="text-xs text-[#848e9c] truncate">{user.email}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 text-[#848e9c] hover:text-white hover:bg-[#2b3139] rounded-lg transition-colors flex-shrink-0 ml-2"
                aria-label="Close menu"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Navigation Items - FIXED (Scrollable değil) */}
            <div className="border-b border-[#2b3139] bg-[#1e2329] flex-shrink-0">
              <div className="py-3 px-3">
                {/* Menü Linkleri */}
                <nav className="space-y-1">
                  {(() => {
                    console.log('🔍 Mobil Menü - navItems:', navItems);
                    console.log('🔍 navItems length:', navItems?.length);
                    console.log('🔍 user:', user);
                    return null;
                  })()}
                  {navItems && navItems.length > 0 ? (
                    navItems.map(({ href, label, icon: Icon }) => {
                      const active = isActive(href);
                      console.log('🎯 Menü öğesi render ediliyor:', label, href);
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                            active
                              ? 'bg-[#0ecb81]/10 text-[#0ecb81] border-l-4 border-[#0ecb81]'
                              : 'text-white hover:bg-[#2b3139]'
                          }`}
                        >
                          <Icon className={`h-5 w-5 flex-shrink-0 ${active ? 'text-[#0ecb81]' : 'text-white'}`} />
                          <span className={`font-semibold text-sm ${active ? 'text-[#0ecb81]' : 'text-white'}`}>{label}</span>
                          {active && (
                            <div className="ml-auto h-2 w-2 bg-[#0ecb81] rounded-full"></div>
                          )}
                        </Link>
                      );
                    })
                  ) : (
                    <div className="px-4 py-3 text-[#848e9c] text-sm">
                      Menü öğeleri yükleniyor...
                    </div>
                  )}
                  
                  {/* Bildirimler - Mobil Menüde */}
                  {user && (
                    <button 
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-white hover:bg-[#2b3139] w-full"
                    >
                      <div className="relative flex-shrink-0">
                        <BellIcon className="h-5 w-5 text-white" />
                        <span className="absolute -top-1 -right-1 h-2 w-2 bg-[#f6465d] rounded-full"></span>
                      </div>
                      <span className="font-semibold text-sm text-white">Bildirimler</span>
                    </button>
                  )}
                </nav>
              </div>
            </div>

            {/* Scrollable Content - Portföy Bilgileri ve Varlıkları */}
            <div className="flex-1 overflow-y-auto bg-[#1e2329] min-h-0">
              <div className="py-4 px-3">

                {/* Kullanıcı Bilgileri ve Özet */}
                {user && (
                  <div className="mb-4 space-y-3 pt-4 border-t border-[#2b3139]">
                    {/* Bakiye ve Sıralama */}
                    <div className="px-4 py-3 bg-[#2b3139] rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-[#848e9c]">Bakiye</span>
                        <span className="text-sm font-bold text-[#f0b90b]">
                          ₺{user.balance?.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[#848e9c]">Sıralama</span>
                        <span className="text-sm font-bold text-[#f0b90b]">
                          #{user.rank || '-'}
                        </span>
                      </div>
                    </div>

                    {/* Portföy Özet Kartları - Mobil için optimize */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* Toplam Değer */}
                      <div className="px-2.5 py-2 bg-[#2b3139] rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] text-[#848e9c] leading-tight">Toplam Değer</span>
                          <CurrencyDollarIcon className="h-3 w-3 text-[#0ecb81] flex-shrink-0" />
                        </div>
                        <p className="text-[11px] font-bold text-white leading-tight">
                          ₺{(portfolioState.totalValue || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-[9px] text-[#848e9c] mt-0.5 leading-tight">
                          ${((portfolioState.totalValue || 0) / 30).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                      </div>

                      {/* Toplam Kâr/Zarar */}
                      <div className="px-2.5 py-2 bg-[#2b3139] rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] text-[#848e9c] leading-tight">Kâr/Zarar</span>
                          {portfolioState.totalProfitLoss >= 0 ? (
                            <ArrowTrendingUpIcon className="h-3 w-3 text-[#0ecb81] flex-shrink-0" />
                          ) : (
                            <ArrowTrendingDownIcon className="h-3 w-3 text-[#f6465d] flex-shrink-0" />
                          )}
                        </div>
                        <p className={`text-[11px] font-bold leading-tight ${portfolioState.totalProfitLoss >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                          ₺{(portfolioState.totalProfitLoss || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                        <p className={`text-[9px] mt-0.5 leading-tight ${portfolioState.totalProfitLoss >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                          {portfolioState.totalValue > 0 
                            ? `${(((portfolioState.totalProfitLoss || 0) / (portfolioState.totalValue - (portfolioState.totalProfitLoss || 0))) * 100).toFixed(2)}%`
                            : '0.00%'}
                        </p>
                      </div>

                      {/* Toplam Yatırım */}
                      <div className="px-2.5 py-2 bg-[#2b3139] rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] text-[#848e9c] leading-tight">Toplam Yatırım</span>
                          <CurrencyDollarIcon className="h-3 w-3 text-[#0ecb81] flex-shrink-0" />
                        </div>
                        <p className="text-[11px] font-bold text-white leading-tight">
                          ₺{((portfolioState.totalValue - (portfolioState.totalProfitLoss || 0)) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-[9px] text-[#848e9c] mt-0.5 leading-tight">
                          ${(((portfolioState.totalValue - (portfolioState.totalProfitLoss || 0)) || 0) / 30).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                      </div>

                      {/* Nakit Bakiye */}
                      <div className="px-2.5 py-2 bg-[#2b3139] rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] text-[#848e9c] leading-tight">Nakit Bakiye</span>
                          <CurrencyDollarIcon className="h-3 w-3 text-[#0ecb81] flex-shrink-0" />
                        </div>
                        <p className="text-[11px] font-bold text-white leading-tight">
                          ₺{(user.balance || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-[9px] text-[#848e9c] mt-0.5 leading-tight">
                          ${((user.balance || 0) / 30).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Portföy Varlıkları - Mobil için optimize */}
                {user && portfolioState.portfolioItems && portfolioState.portfolioItems.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[#2b3139]">
                    <div className="flex items-center justify-between mb-3 px-2">
                      <h3 className="text-sm font-bold text-white">Portföy Varlıkları</h3>
                      <Link
                        href="/portfolio"
                        onClick={() => setOpen(false)}
                        className="text-xs text-[#0ecb81] hover:text-[#0bb975] transition-colors font-semibold"
                      >
                        Tümü →
                      </Link>
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {portfolioState.portfolioItems.slice(0, 6).map((item) => (
                        <Link
                          key={item.id}
                          href={`/asset/${item.symbol}`}
                          onClick={() => setOpen(false)}
                          className="flex items-center justify-between px-3 py-2.5 bg-[#2b3139] rounded-lg hover:bg-[#363d47] active:bg-[#363d47] transition-colors group"
                        >
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <div className="h-9 w-9 bg-[#0ecb81]/20 rounded-full flex items-center justify-center border border-[#0ecb81]/30 flex-shrink-0">
                              <span className="text-xs font-bold text-[#0ecb81]">
                                {item.symbol.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-white truncate">{item.symbol}</p>
                              <p className="text-[10px] text-[#848e9c] truncate">{item.name}</p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <p className="text-xs font-semibold text-white">
                              {item.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}
                            </p>
                            <p className={`text-[10px] font-medium ${item.profitLoss >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                              {item.profitLoss >= 0 ? '+' : ''}{item.profitLossPercent.toFixed(2)}%
                            </p>
                          </div>
                        </Link>
                      ))}
                      {portfolioState.portfolioItems.length > 6 && (
                        <Link
                          href="/portfolio"
                          onClick={() => setOpen(false)}
                          className="block text-center px-3 py-2.5 text-xs text-[#848e9c] hover:text-[#0ecb81] transition-colors font-semibold bg-[#2b3139] rounded-lg"
                        >
                          +{portfolioState.portfolioItems.length - 6} daha fazla varlık görüntüle
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-[#2b3139] bg-[#181a20] flex-shrink-0">
              {user ? (
                <button
                  onClick={() => {
                    logout();
                    setOpen(false);
                  }}
                  className="w-full px-4 py-3 bg-[#f6465d] hover:bg-[#e03e54] text-white rounded-xl transition-all font-semibold flex items-center justify-center gap-2"
                >
                  <XMarkIcon className="h-5 w-5" />
                  Çıkış Yap
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="w-full px-4 py-3 text-center text-[#848e9c] hover:text-white hover:bg-[#2b3139] rounded-xl transition-all font-semibold"
                  >
                    Giriş Yap
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setOpen(false)}
                    className="w-full px-4 py-3 text-center bg-[#0ecb81] hover:bg-[#0bb975] text-white rounded-xl transition-all font-semibold"
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
