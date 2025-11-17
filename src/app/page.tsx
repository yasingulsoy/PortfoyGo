'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { 
  CurrencyDollarIcon, 
  TrophyIcon, 
  UserIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from '@heroicons/react/24/outline';
import { Stock } from '@/types';
import { usePortfolio } from '@/context/PortfolioContext';
import { useAuth } from '@/context/AuthContext';
import TradeModal from '@/components/TradeModal';
import MarketTabs from '@/components/MarketTabs';
import { useStocks, useCryptos } from '@/hooks/useMarketData';
import { CryptoCoin } from '@/services/crypto';
import { leaderboardApi } from '@/services/backendApi';

export default function Home() {
  const { state } = usePortfolio();
  const { stocks } = useStocks();
  const { cryptos } = useCryptos();
  const { user, loading } = useAuth();
  const router = useRouter();

  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [topLeaders, setTopLeaders] = useState<Array<{
    rank: number;
    username: string;
    profit_loss_percent: number;
    total_profit_loss: number;
    portfolio_value: number;
    balance: number;
  }>>([]);

  // Giriş kontrolü - giriş yapılmamışsa login sayfasına yönlendir
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Liderlik verilerini yükle
  useEffect(() => {
    const loadTopLeaders = async () => {
      try {
        const result = await leaderboardApi.getLeaderboard(3);
        console.log('Top leaders result:', result); // Debug için
        if (result.success && result.leaderboard && result.leaderboard.length > 0) {
          setTopLeaders(result.leaderboard);
        } else {
          console.log('No leaders found or empty leaderboard');
          setTopLeaders([]);
        }
      } catch (error) {
        console.error('Top leaders load error:', error);
        setTopLeaders([]);
      }
    };
    if (user) {
      loadTopLeaders();
    }
  }, [user]);

  const toStockFromCrypto = (c: CryptoCoin): Stock => {
    const price = c.current_price;
    const changePercent = c.price_change_percentage_24h ?? 0;
    const change = price * (changePercent / 100);
    return {
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      price,
      change,
      changePercent,
      volume: c.total_volume ?? 0,
      marketCap: c.market_cap ?? 0,
      previousClose: price - change,
      open: price,
      high: price,
      low: price,
    };
  };

  const openTrade = (asset: Stock) => {
    setSelectedStock(asset);
    setIsTradeModalOpen(true);
  };

  const onBuy = (symbol: string, type: 'stock' | 'crypto') => {
    if (type === 'stock') {
      const s = stocks.find(x => x.symbol === symbol);
      if (s) {
        setTradeType('buy');
        openTrade(s);
      }
    } else {
      const c = cryptos.find(x => x.symbol.toUpperCase() === symbol);
      if (c) {
        setTradeType('buy');
        openTrade(toStockFromCrypto(c));
      }
    }
  };

  const onSell = (symbol: string, type: 'stock' | 'crypto') => {
    if (type === 'stock') {
      const s = stocks.find(x => x.symbol === symbol);
      if (s) {
        setTradeType('sell');
        openTrade(s);
      }
    } else {
      const c = cryptos.find(x => x.symbol.toUpperCase() === symbol);
      if (c) {
        setTradeType('sell');
        openTrade(toStockFromCrypto(c));
      }
    }
  };

  const closeTradeModal = () => {
    setIsTradeModalOpen(false);
    setSelectedStock(null);
  };

  // Loading durumunda veya kullanıcı yoksa loading göster
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#181a20] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#0ecb81]"></div>
          <p className="mt-4 text-[#848e9c]">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#181a20]">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Welcome Section - Binance Style */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            {user ? `Hoş geldin, ${user.username}!` : 'Sanal Yatırım Platformu'}
          </h1>
          <p className="text-[#848e9c] text-sm">Piyasaları takip edin ve yatırım yapın</p>
        </div>

        {/* Stats Cards - Binance Style */}
        {user && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-[#1e2329] rounded-xl p-5 border border-[#2b3139] hover:border-[#0ecb81]/30 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#848e9c] mb-1">Portföy Değeri</p>
                  <p className="text-2xl font-bold text-white">₺{state.totalValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="p-3 bg-[#0ecb81]/10 rounded-lg">
                  <CurrencyDollarIcon className="h-6 w-6 text-[#0ecb81]" />
                </div>
              </div>
            </div>

            <div className="bg-[#1e2329] rounded-xl p-5 border border-[#2b3139] hover:border-[#0ecb81]/30 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#848e9c] mb-1">Toplam Kâr/Zarar</p>
                  <p className={`text-2xl font-bold ${state.totalProfitLoss >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                    {state.totalProfitLoss >= 0 ? '+' : ''}₺{state.totalProfitLoss.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${state.totalProfitLoss >= 0 ? 'bg-[#0ecb81]/10' : 'bg-[#f6465d]/10'}`}>
                  {state.totalProfitLoss >= 0 ? (
                    <ArrowUpIcon className={`h-6 w-6 text-[#0ecb81]`} />
                  ) : (
                    <ArrowDownIcon className={`h-6 w-6 text-[#f6465d]`} />
                  )}
                </div>
              </div>
            </div>

            <div className="bg-[#1e2329] rounded-xl p-5 border border-[#2b3139] hover:border-[#0ecb81]/30 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#848e9c] mb-1">Sıralama</p>
                  <p className="text-2xl font-bold text-white">#{user?.rank || '-'}</p>
                </div>
                <div className="p-3 bg-[#f0b90b]/10 rounded-lg">
                  <TrophyIcon className="h-6 w-6 text-[#f0b90b]" />
                </div>
              </div>
            </div>

            <div className="bg-[#1e2329] rounded-xl p-5 border border-[#2b3139] hover:border-[#0ecb81]/30 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[#848e9c] mb-1">Toplam Hisse</p>
                  <p className="text-2xl font-bold text-white">{state.portfolioItems.length}</p>
                </div>
                <div className="p-3 bg-[#0ecb81]/10 rounded-lg">
                  <UserIcon className="h-6 w-6 text-[#0ecb81]" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Market Grid - Binance Style */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
          {/* Hisse Senetleri Grid */}
          <div className="lg:col-span-1 xl:col-span-2">
            <div className="bg-[#1e2329] rounded-xl border border-[#2b3139] overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#2b3139] bg-[#161a1e]">
                <h2 className="text-xl font-bold text-white">Hisse Senetleri</h2>
                <span className="text-sm text-[#848e9c] bg-[#2b3139] px-3 py-1 rounded-full">{stocks.length} hisse</span>
              </div>
              
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                  {stocks.map((stock) => (
                    <div key={stock.id} className="bg-[#161a1e] rounded-lg p-4 border border-[#2b3139] hover:border-[#0ecb81]/30 transition-all hover:bg-[#1e2329]">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-[#0ecb81]/10 rounded-lg flex items-center justify-center">
                            <span className="text-lg font-bold text-[#0ecb81]">{stock.symbol.slice(0,1)}</span>
                          </div>
                          <div>
                            <Link href={`/asset/${stock.symbol}?type=stock`} className="text-sm font-semibold text-white hover:text-[#0ecb81] transition-colors">
                              {stock.name}
                            </Link>
                            <div className="text-xs text-[#848e9c]">{stock.symbol}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-base font-bold text-white">${stock.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div className="text-xs text-[#848e9c]">₺{(stock.price * 32.5).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div className={`text-xs inline-flex items-center font-medium mt-1 ${stock.change >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                            {stock.change >= 0 ? <ArrowUpIcon className="h-3 w-3 mr-1" /> : <ArrowDownIcon className="h-3 w-3 mr-1" />}
                            {stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)} ({stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%)
                          </div>
                        </div>
                      </div>
                      {user && (
                        <div className="flex gap-2 mt-3">
                          <button 
                            onClick={() => onBuy(stock.symbol, 'stock')} 
                            className="flex-1 bg-[#0ecb81] hover:bg-[#0bb975] text-white py-2 px-3 rounded-lg text-sm font-semibold transition-all"
                          >
                            Al
                          </button>
                          <button 
                            onClick={() => onSell(stock.symbol, 'stock')} 
                            className="flex-1 bg-[#f6465d] hover:bg-[#e03e54] text-white py-2 px-3 rounded-lg text-sm font-semibold transition-all"
                          >
                            Sat
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Kripto Paralar Grid */}
          <div className="lg:col-span-1 xl:col-span-1">
            <div className="bg-[#1e2329] rounded-xl border border-[#2b3139] overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#2b3139] bg-[#161a1e]">
                <h2 className="text-xl font-bold text-white">Kripto Paralar</h2>
                <span className="text-sm text-[#848e9c] bg-[#2b3139] px-3 py-1 rounded-full">{cryptos.length} kripto</span>
              </div>
              
              <div className="p-4">
                <div className="space-y-3">
                  {cryptos.slice(0, 6).map((crypto) => {
                    const USD_TO_TRY = 32.5;
                    const changePct = crypto.price_change_percentage_24h ?? 0;
                    return (
                      <div key={crypto.id} className="bg-[#161a1e] rounded-lg p-4 border border-[#2b3139] hover:border-[#0ecb81]/30 transition-all hover:bg-[#1e2329]">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <Image src={crypto.image} alt={crypto.name} width={36} height={36} className="rounded-full ring-2 ring-[#2b3139]" />
                            </div>
                            <div>
                              <Link href={`/asset/${crypto.symbol.toUpperCase()}?type=crypto&id=${crypto.id}`} className="text-sm font-semibold text-white hover:text-[#0ecb81] transition-colors">
                                {crypto.name}
                              </Link>
                              <div className="text-xs text-[#848e9c] uppercase">{crypto.symbol}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-base font-bold text-white">${crypto.current_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <div className="text-xs text-[#848e9c]">₺{(crypto.current_price * USD_TO_TRY).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <div className={`text-xs inline-flex items-center font-medium mt-1 ${changePct >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                              {changePct >= 0 ? <ArrowUpIcon className="h-3 w-3 mr-1" /> : <ArrowDownIcon className="h-3 w-3 mr-1" />}
                              {changePct.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                        {user && (
                          <div className="flex gap-2 mt-3">
                            <button 
                              onClick={() => onBuy(crypto.symbol.toUpperCase(), 'crypto')} 
                              className="flex-1 bg-[#0ecb81] hover:bg-[#0bb975] text-white py-2 px-3 rounded-lg text-sm font-semibold transition-all"
                            >
                              Al
                            </button>
                            <button 
                              onClick={() => onSell(crypto.symbol.toUpperCase(), 'crypto')} 
                              className="flex-1 bg-[#f6465d] hover:bg-[#e03e54] text-white py-2 px-3 rounded-lg text-sm font-semibold transition-all"
                            >
                              Sat
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions & Market Summary - Binance Style */}
        {user && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Quick Actions */}
            <div className="bg-[#1e2329] rounded-xl border border-[#2b3139] p-6">
              <h3 className="text-lg font-bold text-white mb-4">Hızlı İşlemler</h3>
              <div className="space-y-3">
                <Link href="/portfolio" className="block w-full bg-[#0ecb81] hover:bg-[#0bb975] text-white py-3 px-4 rounded-lg transition-all text-center font-semibold">
                  Portföyümü Görüntüle
                </Link>
                <Link href="/transactions" className="block w-full bg-[#2b3139] hover:bg-[#3a4149] text-white py-3 px-4 rounded-lg transition-all text-center font-semibold">
                  Geçmiş İşlemler
                </Link>
                <Link href="/leaderboard" className="block w-full bg-[#f0b90b] hover:bg-[#d4a308] text-white py-3 px-4 rounded-lg transition-all text-center font-semibold">
                  Liderlik Tablosu
                </Link>
              </div>
            </div>

            {/* Market Summary */}
            <div className="bg-[#1e2329] rounded-xl border border-[#2b3139] p-6">
              <h3 className="text-lg font-bold text-white mb-4">Piyasa Özeti</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-[#2b3139]">
                  <span className="text-sm text-[#848e9c]">Toplam Hisse</span>
                  <span className="font-semibold text-white">{stocks.length}</span>
                </div>
                {stocks.length < 50 && (
                  <div className="bg-[#f0b90b]/10 border border-[#f0b90b]/30 rounded-lg p-3 mb-3">
                    <p className="text-xs text-[#f0b90b] mb-2">
                      ⚠️ Az sayıda hisse senedi görüntüleniyor. Cache güncelleniyor...
                    </p>
                    <button
                      onClick={async () => {
                        try {
                          const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';
                          await fetch(`${API_BASE_URL}/stocks/refresh-cache`, { method: 'POST' });
                          // Sayfayı yenile
                          window.location.reload();
                        } catch (error) {
                          console.error('Cache refresh error:', error);
                        }
                      }}
                      className="text-xs bg-[#f0b90b] hover:bg-[#d4a308] text-white px-3 py-1 rounded transition-colors"
                    >
                      Cache'i Yenile
                    </button>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 border-b border-[#2b3139]">
                  <span className="text-sm text-[#848e9c]">Toplam Kripto</span>
                  <span className="font-semibold text-white">{cryptos.length}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[#2b3139]">
                  <span className="text-sm text-[#848e9c]">Komisyon Oranı</span>
                  <span className="font-semibold text-[#0ecb81]">%0.25</span>
                </div>
                <div className="pt-3 border-t border-[#2b3139]">
                  <ClientOnlyTime />
                </div>
              </div>
            </div>

            {/* Market Status */}
            <div className="bg-[#1e2329] rounded-xl border border-[#2b3139] p-6">
              <h3 className="text-lg font-bold text-white mb-4">Piyasa Durumu</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-[#2b3139]">
                  <span className="text-sm text-[#848e9c]">Hisse Senetleri</span>
                  <span className="text-[#0ecb81] text-sm font-semibold flex items-center gap-1">
                    <span className="h-2 w-2 bg-[#0ecb81] rounded-full animate-pulse"></span>
                    Açık
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-[#2b3139]">
                  <span className="text-sm text-[#848e9c]">Kripto Paralar</span>
                  <span className="text-[#0ecb81] text-sm font-semibold flex items-center gap-1">
                    <span className="h-2 w-2 bg-[#0ecb81] rounded-full animate-pulse"></span>
                    24/7
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-[#848e9c]">API Durumu</span>
                  <span className="text-[#0ecb81] text-sm font-semibold flex items-center gap-1">
                    <span className="h-2 w-2 bg-[#0ecb81] rounded-full animate-pulse"></span>
                    Çalışıyor
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mini Leaderboard - Binance Style */}
        <div className="bg-[#1e2329] rounded-xl border border-[#2b3139] p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h3 className="text-lg sm:text-xl font-bold text-white">En İyi Performans</h3>
            <Link href="/leaderboard" className="text-[#0ecb81] hover:text-[#0bb975] text-xs sm:text-sm font-semibold transition-colors">
              Tümünü Gör →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {topLeaders.length > 0 ? (
              topLeaders.map((leader, index) => {
                const isProfit = leader.profit_loss_percent >= 0;
                const medalEmoji = leader.rank === 1 ? '🥇' : leader.rank === 2 ? '🥈' : '🥉';
                const bgColors = leader.rank === 1 
                  ? 'bg-[#f0b90b]/10 border-[#f0b90b]/30'
                  : leader.rank === 2
                  ? 'bg-[#2b3139] border-[#2b3139]'
                  : 'bg-[#f0b90b]/5 border-[#f0b90b]/20';
                const iconColors = leader.rank === 1
                  ? 'bg-[#f0b90b]'
                  : leader.rank === 2
                  ? 'bg-[#848e9c]'
                  : 'bg-[#f0b90b]/80';
                
                return (
                  <div key={leader.rank} className={`flex items-center justify-between p-3 sm:p-4 ${bgColors} rounded-lg border hover:border-[#0ecb81]/30 transition-all`}>
                    <div className="flex items-center space-x-2 sm:space-x-3">
                      <div className={`h-10 w-10 sm:h-12 sm:w-12 ${iconColors} rounded-full flex items-center justify-center`}>
                        <span className="text-white font-bold text-base sm:text-lg">{medalEmoji}</span>
                      </div>
                      <div>
                        <div className="font-semibold text-white text-sm sm:text-base">{leader.username}</div>
                        <div className="text-xs sm:text-sm text-[#848e9c]">{leader.rank}. Sıra</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm sm:text-lg font-bold ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                        {isProfit ? '+' : ''}₺{leader.total_profit_loss.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className={`text-xs sm:text-sm ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                        {isProfit ? '+' : ''}{leader.profit_loss_percent.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              // Fallback: Eğer veri yoksa placeholder göster
              <>
                <div className="flex items-center justify-between p-3 sm:p-4 bg-[#f0b90b]/10 border border-[#f0b90b]/30 rounded-lg hover:border-[#0ecb81]/30 transition-all">
                  <div className="flex items-center space-x-2 sm:space-x-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 bg-[#f0b90b] rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-base sm:text-lg">🥇</span>
                    </div>
                    <div>
                      <div className="font-semibold text-white text-sm sm:text-base">-</div>
                      <div className="text-xs sm:text-sm text-[#848e9c]">1. Sıra</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm sm:text-lg font-bold text-[#848e9c]">-</div>
                    <div className="text-xs sm:text-sm text-[#848e9c]">-</div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 sm:p-4 bg-[#2b3139] border border-[#2b3139] rounded-lg hover:border-[#0ecb81]/30 transition-all">
                  <div className="flex items-center space-x-2 sm:space-x-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 bg-[#848e9c] rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-base sm:text-lg">🥈</span>
                    </div>
                    <div>
                      <div className="font-semibold text-white text-sm sm:text-base">-</div>
                      <div className="text-xs sm:text-sm text-[#848e9c]">2. Sıra</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm sm:text-lg font-bold text-[#848e9c]">-</div>
                    <div className="text-xs sm:text-sm text-[#848e9c]">-</div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 sm:p-4 bg-[#f0b90b]/5 border border-[#f0b90b]/20 rounded-lg sm:col-span-2 lg:col-span-1 hover:border-[#0ecb81]/30 transition-all">
                  <div className="flex items-center space-x-2 sm:space-x-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 bg-[#f0b90b]/80 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-base sm:text-lg">🥉</span>
                    </div>
                    <div>
                      <div className="font-semibold text-white text-sm sm:text-base">-</div>
                      <div className="text-xs sm:text-sm text-[#848e9c]">3. Sıra</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm sm:text-lg font-bold text-[#848e9c]">-</div>
                    <div className="text-xs sm:text-sm text-[#848e9c]">-</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Trade Modal */}
      <TradeModal
        isOpen={isTradeModalOpen}
        onClose={closeTradeModal}
        stock={selectedStock}
        type={tradeType}
      />
    </div>
  );
}

function ClientOnlyTime() {
  const [timeText, setTimeText] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setTimeText(new Date().toLocaleTimeString('tr-TR'));
    update();
    const intervalId = setInterval(update, 60000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="text-xs text-[#848e9c] text-center">
      Son güncelleme: {timeText ?? '—'}
    </div>
  );
}
