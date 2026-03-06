'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { 
  TrophyIcon, 
  ArrowUpIcon,
  ArrowDownIcon,
  ChartBarSquareIcon,
  WalletIcon,
  BanknotesIcon,
  NewspaperIcon,
} from '@heroicons/react/24/outline';
import { Stock } from '@/types';
import { usePortfolio } from '@/context/PortfolioContext';
import { useAuth } from '@/context/AuthContext';
import TradeModal from '@/components/TradeModal';
import { useStocks, useCryptos, useCommodities, useCurrencies } from '@/hooks/useMarketData';
import { CryptoCoin } from '@/services/crypto';
import { Commodity } from '@/types';
import { leaderboardApi, newsApi } from '@/services/backendApi';

type MarketTab = 'stocks' | 'crypto' | 'currencies' | 'commodities';

export default function Home() {
  const { state, refreshPortfolio, updatePrices } = usePortfolio();
  const { stocks } = useStocks();
  const { cryptos } = useCryptos();
  const { commodities } = useCommodities();
  const { currencies, usdToTry } = useCurrencies();
  const { user, loading } = useAuth();
  const router = useRouter();

  const prevStockPricesRef = useRef<Map<string, number>>(new Map());
  const prevCryptoPricesRef = useRef<Map<string, number>>(new Map());
  const prevPortfolioPricesRef = useRef<Map<string, number>>(new Map());
  const [priceAnimations, setPriceAnimations] = useState<Map<string, 'up' | 'down' | null>>(new Map());
  const [marketTab, setMarketTab] = useState<MarketTab>('stocks');

  const USD_TO_TRY = usdToTry;

  const calculatedTotals = useMemo(() => {
    if (state.portfolioItems.length > 0 && (stocks.length > 0 || cryptos.length > 0)) {
      let totalValue = 0;
      let totalProfitLoss = 0;

      state.portfolioItems.forEach(item => {
        const crypto = cryptos.find(c => c.symbol.toUpperCase() === item.symbol.toUpperCase());
        const stock = stocks.find(s => s.symbol === item.symbol);

        if (crypto) {
          const currentPriceUSD = crypto.current_price;
          const currentPriceTRY = currentPriceUSD * USD_TO_TRY;
          const averagePriceTRY = item.averagePrice;
          const itemTotalValue = item.quantity * currentPriceTRY;
          const itemProfitLoss = (currentPriceTRY - averagePriceTRY) * item.quantity;
          totalValue += itemTotalValue;
          totalProfitLoss += itemProfitLoss;
        } else if (stock) {
          const currentPriceUSD = stock.price;
          const currentPriceTRY = currentPriceUSD * USD_TO_TRY;
          const averagePriceTRY = item.averagePrice;
          const itemTotalValue = item.quantity * currentPriceTRY;
          const itemProfitLoss = (currentPriceTRY - averagePriceTRY) * item.quantity;
          totalValue += itemTotalValue;
          totalProfitLoss += itemProfitLoss;
        } else {
          totalValue += item.totalValue;
          totalProfitLoss += item.profitLoss;
        }
      });

      return { totalValue, totalProfitLoss };
    }

    return {
      totalValue: state.totalValue,
      totalProfitLoss: state.totalProfitLoss
    };
  }, [state.portfolioItems, stocks, cryptos, state.totalValue, state.totalProfitLoss, USD_TO_TRY]);

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
  const [latestNews, setLatestNews] = useState<Array<{
    title: string;
    link: string;
    pubDate: string;
    categories: string[];
    description: string;
  }>>([]);

  useEffect(() => {
    if (!loading && !user) {
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        router.push('/login');
      }
    }
  }, [user, loading, router]);

  useEffect(() => {
    const newAnimations = new Map<string, 'up' | 'down' | null>();
    
    stocks.forEach((stock) => {
      const prevPrice = prevStockPricesRef.current.get(stock.symbol);
      if (prevPrice !== undefined && prevPrice !== stock.price) {
        if (stock.price > prevPrice) {
          newAnimations.set(`stock-${stock.symbol}`, 'up');
        } else {
          newAnimations.set(`stock-${stock.symbol}`, 'down');
        }
        setTimeout(() => {
          setPriceAnimations((prev) => {
            const updated = new Map(prev);
            updated.delete(`stock-${stock.symbol}`);
            return updated;
          });
        }, 600);
      }
      prevStockPricesRef.current.set(stock.symbol, stock.price);
    });

    if (newAnimations.size > 0) {
      setPriceAnimations((prev) => {
        const merged = new Map(prev);
        newAnimations.forEach((value, key) => merged.set(key, value));
        return merged;
      });
    }
  }, [stocks]);

  useEffect(() => {
    const newAnimations = new Map<string, 'up' | 'down' | null>();
    
    cryptos.forEach((crypto) => {
      const prevPrice = prevCryptoPricesRef.current.get(crypto.id);
      if (prevPrice !== undefined && prevPrice !== crypto.current_price) {
        if (crypto.current_price > prevPrice) {
          newAnimations.set(`crypto-${crypto.id}`, 'up');
        } else {
          newAnimations.set(`crypto-${crypto.id}`, 'down');
        }
        setTimeout(() => {
          setPriceAnimations((prev) => {
            const updated = new Map(prev);
            updated.delete(`crypto-${crypto.id}`);
            return updated;
          });
        }, 600);
      }
      prevCryptoPricesRef.current.set(crypto.id, crypto.current_price);
    });

    if (newAnimations.size > 0) {
      setPriceAnimations((prev) => {
        const merged = new Map(prev);
        newAnimations.forEach((value, key) => merged.set(key, value));
        return merged;
      });
    }
  }, [cryptos]);

  const toStockFromCrypto = useCallback((c: CryptoCoin): Stock => {
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
      assetType: 'crypto',
    };
  }, []);

  const toStockFromCommodity = useCallback((c: Commodity): Stock => {
    const price = c.price;
    const change = price * (c.change_rate / 100);
    return {
      id: c.code,
      symbol: c.code.toUpperCase(),
      name: c.name,
      price,
      change,
      changePercent: c.change_rate,
      volume: 0,
      marketCap: 0,
      previousClose: price - change,
      open: price,
      high: price,
      low: price,
      assetType: 'commodity',
    };
  }, []);

  const toStockFromCurrency = useCallback((c: { code: string; name: string; selling: number; change_rate: number }): Stock => {
    const price = c.selling;
    const change = price * (c.change_rate / 100);
    return {
      id: c.code,
      symbol: c.code.toUpperCase(),
      name: c.name,
      price,
      change,
      changePercent: c.change_rate,
      volume: 0,
      marketCap: 0,
      previousClose: price - change,
      open: price,
      high: price,
      low: price,
      assetType: 'currency',
    };
  }, []);

  useEffect(() => {
    if (user && !loading) {
      refreshPortfolio().catch((error) => {
        console.error('Portfolio refresh error:', error);
      });
    }
  }, [user, loading, refreshPortfolio]);

  const portfolioSymbolsKey = useMemo(() => {
    if (state.portfolioItems.length === 0) return '';
    return state.portfolioItems
      .map(item => item.symbol.toUpperCase())
      .sort()
      .join('|');
  }, [state.portfolioItems]);

  useEffect(() => {
    if (!portfolioSymbolsKey || (stocks.length === 0 && cryptos.length === 0)) {
      return;
    }

    const portfolioSymbolsSet = new Set(
      portfolioSymbolsKey.split('|').filter(Boolean)
    );

    if (portfolioSymbolsSet.size === 0) {
      return;
    }

    if (stocks.length > 0 || cryptos.length > 0 || currencies.length > 0) {
      const allAssets: Stock[] = [
        ...stocks,
        ...cryptos.map(c => toStockFromCrypto(c)),
        ...currencies.map(c => toStockFromCurrency(c))
      ];
      
      const portfolioAssets = allAssets.filter(asset => 
        portfolioSymbolsSet.has(asset.symbol.toUpperCase())
      );
      
      const hasPriceChanged = portfolioAssets.some(asset => {
        const prevPrice = prevPortfolioPricesRef.current.get(asset.symbol.toUpperCase());
        const currentPrice = asset.price;
        const changed = prevPrice === undefined || prevPrice !== currentPrice;
        if (changed) {
          prevPortfolioPricesRef.current.set(asset.symbol.toUpperCase(), currentPrice);
        }
        return changed;
      });
      
      if (hasPriceChanged && portfolioAssets.length > 0) {
        updatePrices(portfolioAssets);
      }
    }
  }, [stocks, cryptos, currencies, portfolioSymbolsKey, updatePrices, toStockFromCrypto, toStockFromCurrency]);

  useEffect(() => {
    const loadTopLeaders = async () => {
      try {
        const result = await leaderboardApi.getLeaderboard(3);
        if (result.success && result.leaderboard && result.leaderboard.length > 0) {
          setTopLeaders(result.leaderboard);
        } else {
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

  useEffect(() => {
    const loadNews = async () => {
      try {
        const result = await newsApi.getNews(6);
        if (result.success && result.data) {
          setLatestNews(result.data);
        }
      } catch (error) {
        console.error('News load error:', error);
      }
    };
    if (user) {
      loadNews();
    }
  }, [user]);

  const openTrade = (asset: Stock) => {
    setSelectedStock(asset);
    setIsTradeModalOpen(true);
  };

  const onBuy = (symbol: string, type: 'stock' | 'crypto' | 'commodity' | 'currency') => {
    if (type === 'stock') {
      const s = stocks.find(x => x.symbol === symbol);
      if (s) { setTradeType('buy'); openTrade({ ...s, assetType: 'stock' }); }
    } else if (type === 'commodity') {
      const c = commodities.find(x => x.code.toUpperCase() === symbol || x.code === symbol);
      if (c) { setTradeType('buy'); openTrade(toStockFromCommodity(c)); }
    } else if (type === 'currency') {
      const c = currencies.find(x => x.code.toUpperCase() === symbol || x.code === symbol);
      if (c) { setTradeType('buy'); openTrade(toStockFromCurrency(c)); }
    } else {
      const c = cryptos.find(x => x.symbol.toUpperCase() === symbol);
      if (c) { setTradeType('buy'); openTrade(toStockFromCrypto(c)); }
    }
  };

  const onSell = (symbol: string, type: 'stock' | 'crypto' | 'commodity' | 'currency') => {
    if (type === 'stock') {
      const s = stocks.find(x => x.symbol === symbol);
      if (s) { setTradeType('sell'); openTrade({ ...s, assetType: 'stock' }); }
    } else if (type === 'commodity') {
      const c = commodities.find(x => x.code.toUpperCase() === symbol || x.code === symbol);
      if (c) { setTradeType('sell'); openTrade(toStockFromCommodity(c)); }
    } else if (type === 'currency') {
      const c = currencies.find(x => x.code.toUpperCase() === symbol || x.code === symbol);
      if (c) { setTradeType('sell'); openTrade(toStockFromCurrency(c)); }
    } else {
      const c = cryptos.find(x => x.symbol.toUpperCase() === symbol);
      if (c) { setTradeType('sell'); openTrade(toStockFromCrypto(c)); }
    }
  };

  const closeTradeModal = () => {
    setIsTradeModalOpen(false);
    setSelectedStock(null);
  };

  const filteredCurrencies = currencies.filter(c => ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'GAU'].includes(c.code));

  const marketTabs: { key: MarketTab; label: string; count: number }[] = [
    { key: 'stocks', label: 'Hisse Senetleri', count: Math.min(stocks.length, 10) },
    { key: 'crypto', label: 'Kripto Paralar', count: cryptos.length },
    { key: 'currencies', label: 'Döviz Kurları', count: filteredCurrencies.length },
    { key: 'commodities', label: 'Emtia', count: commodities.length },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0e11] flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-2 border-[#2b3139] border-t-[#0ecb81] animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <ChartBarSquareIcon className="h-6 w-6 text-[#0ecb81]" />
            </div>
          </div>
          <p className="mt-4 text-[#848e9c] text-sm">Piyasa verileri yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0b0e11]">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">

        {/* ============ HERO / PORTFOLIO OVERVIEW ============ */}
        <section className="relative overflow-hidden rounded-2xl border border-[#2b3139]/60 p-6 sm:p-8 bg-gradient-to-br from-[#141720] via-[#1a1e28] to-[#121a14]">
          <div className="absolute -top-32 -right-32 w-80 h-80 bg-[#0ecb81]/[0.06] rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-[#f0b90b]/[0.04] rounded-full blur-[80px] pointer-events-none" />

          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <p className="text-[#848e9c] text-xs uppercase tracking-widest mb-1">Dashboard</p>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">
                  Hoş geldin, <span className="text-[#0ecb81]">{user.username}</span>
                </h1>
                <p className="text-[#5a6270] text-sm mt-1">Portföy özetin ve canlı piyasa verileri</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/portfolio"
                  className="px-4 py-2.5 bg-[#0ecb81] hover:bg-[#0bb975] text-white rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-[#0ecb81]/20"
                >
                  Portföyüm
                </Link>
                <Link
                  href="/transactions"
                  className="px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] text-[#eaecef] rounded-xl text-sm font-semibold transition-all border border-[#2b3139]"
                >
                  İşlemler
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                icon={<WalletIcon className="h-4 w-4 text-[#0ecb81]" />}
                label="Portföy Değeri"
                value={`₺${calculatedTotals.totalValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                accent="green"
              />
              <StatCard
                icon={calculatedTotals.totalProfitLoss >= 0
                  ? <ArrowUpIcon className="h-4 w-4 text-[#0ecb81]" />
                  : <ArrowDownIcon className="h-4 w-4 text-[#f6465d]" />
                }
                label="Kâr / Zarar"
                value={`${calculatedTotals.totalProfitLoss >= 0 ? '+' : ''}₺${calculatedTotals.totalProfitLoss.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                accent={calculatedTotals.totalProfitLoss >= 0 ? 'green' : 'red'}
                valueColor={calculatedTotals.totalProfitLoss >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}
              />
              <StatCard
                icon={<TrophyIcon className="h-4 w-4 text-[#f0b90b]" />}
                label="Sıralama"
                value={`#${user?.rank || '-'}`}
                accent="yellow"
              />
              <StatCard
                icon={<BanknotesIcon className="h-4 w-4 text-[#0ecb81]" />}
                label="Varlık Sayısı"
                value={String(state.portfolioItems.length)}
                accent="green"
              />
            </div>
          </div>
        </section>

        {/* ============ CURRENCY TICKER STRIP ============ */}
        {filteredCurrencies.length > 0 && (
          <section className="flex items-center gap-2 overflow-x-auto py-3 px-4 bg-[#1a1d24] rounded-xl border border-[#2b3139]/50 scrollbar-hide">
            <span className="text-[10px] uppercase tracking-wider text-[#5a6270] font-semibold flex-shrink-0 mr-2">Canlı Kurlar</span>
            {filteredCurrencies.map((curr, idx) => (
              <div key={curr.code} className="flex items-center gap-2 flex-shrink-0">
                {idx > 0 && <div className="w-px h-4 bg-[#2b3139]" />}
                <span className="text-xs font-bold text-[#eaecef]">{curr.code}</span>
                <span className="text-xs text-[#848e9c]">₺{curr.selling.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                <span className={`text-[10px] font-semibold ${curr.change_rate >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                  {curr.change_rate >= 0 ? '+' : ''}{curr.change_rate.toFixed(2)}%
                </span>
              </div>
            ))}
          </section>
        )}

        {/* ============ TABBED MARKET SECTION ============ */}
        <section className="bg-[#1a1d24] rounded-2xl border border-[#2b3139]/60 overflow-hidden">
          <div className="flex items-center border-b border-[#2b3139] overflow-x-auto scrollbar-hide">
            {marketTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setMarketTab(tab.key)}
                className={`relative px-5 py-4 text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0 ${
                  marketTab === tab.key
                    ? 'text-[#0ecb81]'
                    : 'text-[#5a6270] hover:text-[#848e9c]'
                }`}
              >
                {tab.label}
                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                  marketTab === tab.key
                    ? 'bg-[#0ecb81]/10 text-[#0ecb81]'
                    : 'bg-[#2b3139] text-[#5a6270]'
                }`}>
                  {tab.count}
                </span>
                {marketTab === tab.key && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#0ecb81] rounded-full" />
                )}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* STOCKS */}
            {marketTab === 'stocks' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {stocks.slice(0, 10).map((stock) => {
                  const animation = priceAnimations.get(`stock-${stock.symbol}`);
                  const animCls = animation === 'up' ? 'price-flash-up' : animation === 'down' ? 'price-flash-down' : '';
                  return (
                    <div key={stock.id} className="bg-[#12141a] rounded-xl p-4 border border-[#2b3139]/40 hover:border-[#0ecb81]/30 transition-all group">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 bg-[#0ecb81]/8 rounded-lg flex items-center justify-center flex-shrink-0 border border-[#0ecb81]/10">
                          <span className="text-sm font-bold text-[#0ecb81]">{stock.symbol.slice(0, 2)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link href={`/asset/${stock.symbol}?type=stock`} className="text-sm font-semibold text-[#eaecef] hover:text-[#0ecb81] transition-colors block truncate">
                            {stock.name}
                          </Link>
                          <span className="text-xs text-[#5a6270]">{stock.symbol}</span>
                        </div>
                        <div className={`text-right ${animCls} rounded px-1`}>
                          <div className="text-sm font-bold text-[#eaecef]">${stock.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div className="text-[10px] text-[#5a6270]">₺{(stock.price * USD_TO_TRY).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold inline-flex items-center gap-0.5 px-2 py-1 rounded-md ${
                          stock.change >= 0 ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'
                        }`}>
                          {stock.change >= 0 ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />}
                          {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                        </span>
                        <div className="flex gap-1.5">
                          <button onClick={() => onBuy(stock.symbol, 'stock')} className="bg-[#0ecb81]/10 hover:bg-[#0ecb81] text-[#0ecb81] hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all">
                            Al
                          </button>
                          <button onClick={() => onSell(stock.symbol, 'stock')} className="bg-[#f6465d]/10 hover:bg-[#f6465d] text-[#f6465d] hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all">
                            Sat
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* CRYPTO */}
            {marketTab === 'crypto' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {cryptos.slice(0, 12).map((crypto) => {
                  const changePct = crypto.price_change_percentage_24h ?? 0;
                  const animation = priceAnimations.get(`crypto-${crypto.id}`);
                  const animCls = animation === 'up' ? 'price-flash-up' : animation === 'down' ? 'price-flash-down' : '';
                  return (
                    <div key={crypto.id} className="bg-[#12141a] rounded-xl p-4 border border-[#2b3139]/40 hover:border-[#0ecb81]/30 transition-all group">
                      <div className="flex items-center gap-3 mb-3">
                        <Image src={crypto.image} alt={crypto.name} width={36} height={36} className="rounded-full ring-2 ring-[#2b3139] flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/asset/${crypto.symbol.toUpperCase()}?type=crypto&id=${crypto.id}`} className="text-sm font-semibold text-[#eaecef] hover:text-[#0ecb81] transition-colors block truncate">
                            {crypto.name}
                          </Link>
                          <span className="text-xs text-[#5a6270] uppercase">{crypto.symbol}</span>
                        </div>
                        <div className={`text-right ${animCls} rounded px-1`}>
                          <div className="text-sm font-bold text-[#eaecef]">${crypto.current_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div className="text-[10px] text-[#5a6270]">₺{(crypto.current_price * usdToTry).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold inline-flex items-center gap-0.5 px-2 py-1 rounded-md ${
                          changePct >= 0 ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'
                        }`}>
                          {changePct >= 0 ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />}
                          {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                        </span>
                        <div className="flex gap-1.5">
                          <button onClick={() => onBuy(crypto.symbol.toUpperCase(), 'crypto')} className="bg-[#0ecb81]/10 hover:bg-[#0ecb81] text-[#0ecb81] hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all">
                            Al
                          </button>
                          <button onClick={() => onSell(crypto.symbol.toUpperCase(), 'crypto')} className="bg-[#f6465d]/10 hover:bg-[#f6465d] text-[#f6465d] hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all">
                            Sat
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* CURRENCIES */}
            {marketTab === 'currencies' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredCurrencies.map((curr) => (
                  <div key={curr.code} className="bg-[#12141a] rounded-xl p-4 border border-[#2b3139]/40 hover:border-[#0ecb81]/30 transition-all group">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 bg-[#0ecb81]/8 rounded-lg flex items-center justify-center flex-shrink-0 border border-[#0ecb81]/10">
                        <span className="text-sm font-bold text-[#0ecb81]">{curr.code.slice(0, 2)}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-[#eaecef] truncate">{curr.name || curr.code}</div>
                        <span className="text-xs text-[#5a6270]">{curr.code}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-[#eaecef]">₺{curr.selling.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold inline-flex items-center gap-0.5 px-2 py-1 rounded-md ${
                        curr.change_rate >= 0 ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'
                      }`}>
                        {curr.change_rate >= 0 ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />}
                        {curr.change_rate >= 0 ? '+' : ''}{curr.change_rate.toFixed(2)}%
                      </span>
                      <div className="flex gap-1.5">
                        <button onClick={() => onBuy(curr.code, 'currency')} className="bg-[#0ecb81]/10 hover:bg-[#0ecb81] text-[#0ecb81] hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all">
                          Al
                        </button>
                        <button onClick={() => onSell(curr.code, 'currency')} className="bg-[#f6465d]/10 hover:bg-[#f6465d] text-[#f6465d] hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all">
                          Sat
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* COMMODITIES */}
            {marketTab === 'commodities' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {commodities.map((commodity) => (
                  <div key={commodity.code} className="bg-[#12141a] rounded-xl p-4 border border-[#2b3139]/40 hover:border-[#f0b90b]/30 transition-all group">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 bg-[#f0b90b]/8 rounded-lg flex items-center justify-center flex-shrink-0 border border-[#f0b90b]/10">
                        <span className="text-sm font-bold text-[#f0b90b]">{commodity.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-[#eaecef] truncate">{commodity.name}</div>
                        <span className="text-xs text-[#5a6270]">{commodity.code}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-[#eaecef]">${commodity.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className="text-[10px] text-[#5a6270]">₺{(commodity.price * usdToTry).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold inline-flex items-center gap-0.5 px-2 py-1 rounded-md ${
                        commodity.change_rate >= 0 ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'
                      }`}>
                        {commodity.change_rate >= 0 ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />}
                        {commodity.change_rate >= 0 ? '+' : ''}{commodity.change_rate.toFixed(2)}%
                      </span>
                      <div className="flex gap-1.5">
                        <button onClick={() => onBuy(commodity.code.toUpperCase(), 'commodity')} className="bg-[#0ecb81]/10 hover:bg-[#0ecb81] text-[#0ecb81] hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all">
                          Al
                        </button>
                        <button onClick={() => onSell(commodity.code.toUpperCase(), 'commodity')} className="bg-[#f6465d]/10 hover:bg-[#f6465d] text-[#f6465d] hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all">
                          Sat
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ============ LEADERBOARD (FULL WIDTH PODIUM) ============ */}
        <section className="relative overflow-hidden rounded-2xl border border-[#2b3139]/60 bg-gradient-to-br from-[#141720] via-[#1a1e28] to-[#18150f]">
          <div className="absolute -top-40 right-0 w-[500px] h-[500px] bg-[#f0b90b]/[0.04] rounded-full blur-[150px] pointer-events-none" />
          <div className="absolute -bottom-32 -left-20 w-72 h-72 bg-[#0ecb81]/[0.03] rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#2b3139]/60">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 bg-[#f0b90b]/10 rounded-lg flex items-center justify-center border border-[#f0b90b]/20">
                  <TrophyIcon className="h-5 w-5 text-[#f0b90b]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">En İyi Performans</h3>
                  <p className="text-[10px] text-[#5a6270] uppercase tracking-wider">Liderlik Tablosu • Top 3</p>
                </div>
              </div>
              <Link href="/leaderboard" className="px-4 py-2 bg-[#f0b90b]/10 hover:bg-[#f0b90b] text-[#f0b90b] hover:text-white rounded-xl text-xs font-semibold transition-all border border-[#f0b90b]/20 hover:border-[#f0b90b]">
                Tümünü Gör &rarr;
              </Link>
            </div>

            <div className="p-5 sm:p-8">
              {/* Podium - Desktop: 2-1-3 sıralaması */}
              <div className="hidden sm:flex items-end justify-center gap-4 max-w-2xl mx-auto">
                {(() => {
                  const leaders = topLeaders.length > 0 ? topLeaders : defaultLeaders;
                  const order = [
                    leaders.find(l => l.rank === 2),
                    leaders.find(l => l.rank === 1),
                    leaders.find(l => l.rank === 3),
                  ].filter(Boolean);

                  return order.map((leader) => {
                    if (!leader) return null;
                    const isProfit = leader.profit_loss_percent >= 0;
                    const isFirst = leader.rank === 1;
                    const isSecond = leader.rank === 2;

                    const accentColor = isFirst ? '#f0b90b' : isSecond ? '#a8b5c8' : '#cd7f32';
                    const glowColor = isFirst ? 'shadow-[0_0_40px_rgba(240,185,11,0.15)]' : isSecond ? 'shadow-[0_0_30px_rgba(168,181,200,0.08)]' : 'shadow-[0_0_30px_rgba(205,127,50,0.08)]';
                    const borderColor = isFirst ? 'border-[#f0b90b]/40 hover:border-[#f0b90b]/70' : isSecond ? 'border-[#a8b5c8]/25 hover:border-[#a8b5c8]/50' : 'border-[#cd7f32]/25 hover:border-[#cd7f32]/50';
                    const bgGrad = isFirst ? 'bg-gradient-to-b from-[#f0b90b]/[0.08] via-[#12141a] to-[#12141a]' : 'bg-[#12141a]';
                    const height = isFirst ? 'min-h-[240px]' : isSecond ? 'min-h-[210px]' : 'min-h-[190px]';
                    const medalGrad = isFirst ? 'from-[#f0b90b] via-[#ffd84d] to-[#c99a07]' : isSecond ? 'from-[#c0cfe0] via-[#e8edf4] to-[#8a9bb5]' : 'from-[#cd7f32] via-[#e8a862] to-[#a0622a]';

                    return (
                      <div key={leader.rank} className={`flex-1 max-w-[220px] ${height} ${bgGrad} rounded-2xl border ${borderColor} ${glowColor} transition-all duration-300 p-5 flex flex-col items-center justify-center text-center relative`}>
                        {isFirst && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-2xl">👑</div>
                        )}

                        <div className={`relative mb-4`}>
                          <div className={`h-16 w-16 rounded-full bg-gradient-to-br ${medalGrad} flex items-center justify-center shadow-lg`}>
                            <span className="text-white font-black text-xl drop-shadow-sm">{leader.rank}</span>
                          </div>
                          <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: accentColor }}>
                            <span className="text-white font-bold">#</span>
                          </div>
                        </div>

                        <div className="font-bold text-white text-base mb-0.5 truncate w-full">{leader.username}</div>
                        <div className="text-[10px] text-[#5a6270] uppercase tracking-widest mb-4">{leader.rank}. Sıra</div>

                        <div className="w-full pt-3 border-t border-[#2b3139]/60">
                          <div className={`text-xl font-black ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                            {isProfit ? '+' : ''}₺{Math.abs(leader.total_profit_loss).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className={`inline-flex items-center gap-1 mt-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            isProfit ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'
                          }`}>
                            {isProfit ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />}
                            {isProfit ? '+' : ''}{leader.profit_loss_percent.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Mobile: Dikey liste */}
              <div className="sm:hidden space-y-3">
                {(topLeaders.length > 0 ? topLeaders : defaultLeaders).map((leader) => {
                  const isProfit = leader.profit_loss_percent >= 0;
                  const isFirst = leader.rank === 1;
                  const isSecond = leader.rank === 2;
                  const medalGrad = isFirst ? 'from-[#f0b90b] via-[#ffd84d] to-[#c99a07]' : isSecond ? 'from-[#c0cfe0] via-[#e8edf4] to-[#8a9bb5]' : 'from-[#cd7f32] via-[#e8a862] to-[#a0622a]';
                  const borderColor = isFirst ? 'border-[#f0b90b]/30' : isSecond ? 'border-[#a8b5c8]/20' : 'border-[#cd7f32]/20';

                  return (
                    <div key={leader.rank} className={`bg-[#12141a] rounded-xl border ${borderColor} p-4 flex items-center gap-4`}>
                      <div className={`h-12 w-12 rounded-full bg-gradient-to-br ${medalGrad} flex items-center justify-center shadow-lg flex-shrink-0`}>
                        <span className="text-white font-black text-lg">{leader.rank}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white text-sm truncate">{isFirst && '👑 '}{leader.username}</div>
                        <div className="text-[10px] text-[#5a6270] uppercase tracking-wider">{leader.rank}. Sıra</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-sm font-black ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                          {isProfit ? '+' : ''}₺{Math.abs(leader.total_profit_loss).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className={`text-[11px] font-semibold ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                          {isProfit ? '+' : ''}{leader.profit_loss_percent.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ============ INFO STRIP: Market Summary + Status + Quick Actions ============ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* USD/TRY */}
          <div className="bg-[#1a1d24] rounded-2xl border border-[#2b3139]/60 p-5 flex items-center gap-4">
            <div className="h-11 w-11 bg-[#0ecb81]/10 rounded-xl flex items-center justify-center border border-[#0ecb81]/20 flex-shrink-0">
              <span className="text-[#0ecb81] font-black text-sm">$</span>
            </div>
            <div>
              <p className="text-[10px] text-[#5a6270] uppercase tracking-wider font-medium">USD/TRY</p>
              <p className="text-lg font-black text-white">₺{usdToTry.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          {/* Piyasa Durumu */}
          <div className="bg-[#1a1d24] rounded-2xl border border-[#2b3139]/60 p-5">
            <p className="text-[10px] text-[#5a6270] uppercase tracking-wider font-medium mb-3">Piyasa Durumu</p>
            <div className="flex items-center gap-3 flex-wrap">
              {[
                { label: 'Hisse', status: true },
                { label: 'Kripto', status: true },
                { label: 'Emtia', status: true },
                { label: 'API', status: true },
              ].map((item) => (
                <span key={item.label} className="flex items-center gap-1.5 text-xs text-[#eaecef]">
                  <span className={`h-1.5 w-1.5 rounded-full ${item.status ? 'bg-[#0ecb81] animate-pulse' : 'bg-[#f6465d]'}`} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          {/* Varlık Sayıları */}
          <div className="bg-[#1a1d24] rounded-2xl border border-[#2b3139]/60 p-5">
            <p className="text-[10px] text-[#5a6270] uppercase tracking-wider font-medium mb-3">Takip Edilen Varlıklar</p>
            <div className="flex items-center gap-4">
              <div>
                <span className="text-lg font-black text-white">{Math.min(stocks.length, 10)}</span>
                <span className="text-[10px] text-[#5a6270] ml-1">Hisse</span>
              </div>
              <div className="w-px h-6 bg-[#2b3139]" />
              <div>
                <span className="text-lg font-black text-white">{cryptos.length}</span>
                <span className="text-[10px] text-[#5a6270] ml-1">Kripto</span>
              </div>
              <div className="w-px h-6 bg-[#2b3139]" />
              <div>
                <span className="text-lg font-black text-white">{commodities.length}</span>
                <span className="text-[10px] text-[#5a6270] ml-1">Emtia</span>
              </div>
            </div>
          </div>

          {/* Hızlı Erişim */}
          <div className="bg-[#1a1d24] rounded-2xl border border-[#2b3139]/60 p-5 flex flex-col justify-center gap-2">
            <Link href="/portfolio" className="text-center py-2.5 bg-[#0ecb81]/10 hover:bg-[#0ecb81] text-[#0ecb81] hover:text-white rounded-xl text-xs font-semibold transition-all">
              Portföyümü Görüntüle
            </Link>
            <Link href="/leaderboard" className="text-center py-2.5 bg-[#f0b90b]/10 hover:bg-[#f0b90b] text-[#f0b90b] hover:text-white rounded-xl text-xs font-semibold transition-all">
              Liderlik Tablosu
            </Link>
          </div>
        </div>

        {/* ============ NEWS SECTION (FOOTER ÜZERİ) ============ */}
        <section className="relative overflow-hidden rounded-2xl border border-[#2b3139]/60 bg-gradient-to-br from-[#141720] via-[#1a1e28] to-[#1a1418]">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#f0b90b]/[0.04] rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute -bottom-32 -left-32 w-72 h-72 bg-[#0ecb81]/[0.03] rounded-full blur-[100px] pointer-events-none" />

          <div className="relative z-10">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#2b3139]">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 bg-[#f0b90b]/10 rounded-lg flex items-center justify-center border border-[#f0b90b]/20">
                  <NewspaperIcon className="h-4.5 w-4.5 text-[#f0b90b]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Ekonomi & Finans Haberleri</h3>
                  <p className="text-[10px] text-[#5a6270] uppercase tracking-wider">BS Ekonomi • Güncel Haberler</p>
                </div>
              </div>
              <Link
                href="/news"
                className="px-4 py-2 bg-[#f0b90b]/10 hover:bg-[#f0b90b] text-[#f0b90b] hover:text-white rounded-xl text-xs font-semibold transition-all border border-[#f0b90b]/20 hover:border-[#f0b90b]"
              >
                Tüm Haberler &rarr;
              </Link>
            </div>

            {/* News Content */}
            <div className="p-5 sm:p-6">
              {latestNews.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  {/* Featured News (Sol - büyük) */}
                  <a
                    href={latestNews[0].link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lg:col-span-5 group block"
                  >
                    <div className="bg-[#12141a] rounded-xl border border-[#2b3139]/40 hover:border-[#f0b90b]/40 transition-all p-5 h-full flex flex-col">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="px-2 py-0.5 bg-[#f6465d]/10 text-[#f6465d] text-[9px] font-bold uppercase tracking-wider rounded-md animate-pulse">
                          Son Dakika
                        </span>
                        {latestNews[0].categories.slice(0, 1).map((cat) => (
                          <span key={cat} className="px-2 py-0.5 bg-[#2b3139] text-[#848e9c] text-[9px] rounded-md font-medium">
                            {cat}
                          </span>
                        ))}
                      </div>
                      <h4 className="text-base sm:text-lg font-bold text-white group-hover:text-[#f0b90b] transition-colors leading-snug mb-3 flex-shrink-0">
                        {latestNews[0].title}
                      </h4>
                      <p className="text-[#5a6270] text-xs leading-relaxed line-clamp-4 flex-1">
                        {latestNews[0].description}
                      </p>
                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#2b3139]/60">
                        <span className="text-[#0ecb81] text-xs font-semibold group-hover:underline">Devamını Oku</span>
                        <span className="text-[#5a6270] text-[10px]">→</span>
                      </div>
                    </div>
                  </a>

                  {/* Other News (Sağ - liste) */}
                  <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {latestNews.slice(1, 5).map((item, idx) => (
                      <a
                        key={idx}
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group"
                      >
                        <div className="bg-[#12141a] rounded-xl border border-[#2b3139]/40 hover:border-[#0ecb81]/30 transition-all p-4 h-full flex flex-col">
                          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                            {item.categories.slice(0, 2).map((cat) => (
                              <span key={cat} className="px-1.5 py-0.5 bg-[#2b3139] text-[#5a6270] text-[8px] rounded font-medium">
                                {cat}
                              </span>
                            ))}
                          </div>
                          <h5 className="text-sm font-semibold text-[#eaecef] group-hover:text-[#0ecb81] transition-colors leading-snug line-clamp-2 mb-2 flex-shrink-0">
                            {item.title}
                          </h5>
                          <p className="text-[#5a6270] text-[11px] leading-relaxed line-clamp-2 flex-1">
                            {item.description}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-[#12141a] rounded-xl border border-[#2b3139]/40 p-4 animate-pulse">
                      <div className="h-3 bg-[#2b3139] rounded w-1/4 mb-3" />
                      <div className="h-4 bg-[#2b3139] rounded w-3/4 mb-2" />
                      <div className="h-3 bg-[#2b3139] rounded w-full mb-2" />
                      <div className="h-3 bg-[#2b3139] rounded w-2/3" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Source */}
            <div className="px-6 pb-4 text-right">
              <span className="text-[10px] text-[#5a6270]">
                Kaynak:{' '}
                <a href="https://bsekonomi.com" target="_blank" rel="noopener noreferrer" className="text-[#0ecb81] hover:underline">
                  bsekonomi.com
                </a>
              </span>
            </div>
          </div>
        </section>

      </main>

      <TradeModal
        isOpen={isTradeModalOpen}
        onClose={closeTradeModal}
        stock={selectedStock}
        type={tradeType}
        usdToTry={usdToTry}
      />
    </div>
  );
}

/* =============== SUB COMPONENTS =============== */

const defaultLeaders = [
  { rank: 1, username: '-', profit_loss_percent: 0, total_profit_loss: 0, portfolio_value: 0, balance: 0 },
  { rank: 2, username: '-', profit_loss_percent: 0, total_profit_loss: 0, portfolio_value: 0, balance: 0 },
  { rank: 3, username: '-', profit_loss_percent: 0, total_profit_loss: 0, portfolio_value: 0, balance: 0 },
];

function StatCard({ icon, label, value, accent, valueColor }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: 'green' | 'red' | 'yellow';
  valueColor?: string;
}) {
  const accentMap = {
    green: 'bg-[#0ecb81]/8 border-[#0ecb81]/10 hover:border-[#0ecb81]/30',
    red: 'bg-[#f6465d]/8 border-[#f6465d]/10 hover:border-[#f6465d]/30',
    yellow: 'bg-[#f0b90b]/8 border-[#f0b90b]/10 hover:border-[#f0b90b]/30',
  };
  const iconBg = {
    green: 'bg-[#0ecb81]/10',
    red: 'bg-[#f6465d]/10',
    yellow: 'bg-[#f0b90b]/10',
  };

  return (
    <div className={`${accentMap[accent]} backdrop-blur-sm rounded-xl p-4 border transition-all`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`h-8 w-8 ${iconBg[accent]} rounded-lg flex items-center justify-center`}>
          {icon}
        </div>
        <span className="text-[11px] text-[#5a6270] font-medium">{label}</span>
      </div>
      <p className={`text-lg sm:text-xl font-bold tracking-tight ${valueColor || 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}

