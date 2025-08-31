'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpIcon, ArrowDownIcon, ChartBarIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Stock } from '@/types';
import { CryptoCoin } from '@/services/crypto';
import PriceChart from './PriceChart';

interface MarketTabsProps {
  stocks: Stock[];
  cryptos: CryptoCoin[];
  onBuy: (symbol: string, type: 'stock' | 'crypto') => void;
  onSell: (symbol: string, type: 'stock' | 'crypto') => void;
}

export default function MarketTabs({ stocks, cryptos, onBuy, onSell }: MarketTabsProps) {
  const [selectedAsset, setSelectedAsset] = useState<{ symbol: string; type: 'stock' | 'crypto'; id?: string } | null>(null);
  const [showChart, setShowChart] = useState(false);

  // USD-TRY dönüşüm oranı
  const USD_TO_TRY = 32.5;

  const openChart = (symbol: string, type: 'stock' | 'crypto', id?: string) => {
    setSelectedAsset({ symbol, type, id });
    setShowChart(true);
  };

  const closeChart = () => {
    setShowChart(false);
    setSelectedAsset(null);
  };

  return (
    <>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-800 gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Piyasa</h2>
          <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            <span>Hisse: mock, Kripto: canlı</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200 dark:divide-gray-800">
          {/* Stocks */}
          <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Hisseler</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">Toplam {stocks.length}</span>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-3 sm:hidden">
              {stocks.map((s) => (
                <div key={s.id} className="border border-gray-200 dark:border-gray-800 rounded-lg p-3 bg-white dark:bg-gray-900">
                  <div className="flex items-center justify-between">
                    <div>
                      <Link href={`/asset/${s.symbol}?type=stock`} className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400">
                        {s.name}
                      </Link>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{s.symbol}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">₺{s.price.toLocaleString()}</div>
                      <div className={`text-xs inline-flex items-center ${s.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {s.change >= 0 ? <ArrowUpIcon className="h-3 w-3 mr-1" /> : <ArrowDownIcon className="h-3 w-3 mr-1" />}
                        {s.change >= 0 ? '+' : ''}{s.change.toLocaleString()} ({s.changePercent >= 0 ? '+' : ''}{s.changePercent}%)
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => onBuy(s.symbol, 'stock')} className="flex-1 bg-green-600 text-white px-3 py-2 rounded text-sm">Al</button>
                    <button onClick={() => onSell(s.symbol, 'stock')} className="flex-1 bg-red-600 text-white px-3 py-2 rounded text-sm">Sat</button>
                    <button onClick={() => openChart(s.symbol, 'stock')} className="flex-1 bg-indigo-600 text-white px-3 py-2 rounded text-sm flex items-center justify-center gap-1">
                      <ChartBarIcon className="h-4 w-4" />
                      Grafik
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Table (>=sm) */}
            <div className="overflow-x-auto -mx-4 sm:mx-0 hidden sm:block">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-800/60">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Hisse</th>
                    <th className="px-4 sm:px-6 py-3 text-right text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fiyat</th>
                    <th className="px-4 sm:px-6 py-3 text-right text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Değişim</th>
                    <th className="px-4 sm:px-6 py-3 text-center text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">İşlem</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {stocks.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-indigo-600">{s.symbol.slice(0,1)}</span>
                          </div>
                          <div>
                            <Link href={`/asset/${s.symbol}?type=stock`} className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400">{s.name}</Link>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{s.symbol}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-gray-100">₺{s.price.toLocaleString()}</td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right">
                        <div className={`inline-flex items-center ${s.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {s.change >= 0 ? <ArrowUpIcon className="h-4 w-4 mr-1" /> : <ArrowDownIcon className="h-4 w-4 mr-1" />}
                          <span className="text-sm font-medium">
                            {s.change >= 0 ? '+' : ''}{s.change.toLocaleString()} ({s.changePercent >= 0 ? '+' : ''}{s.changePercent}%)
                          </span>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => onBuy(s.symbol, 'stock')} className="bg-green-600 text-white px-3 py-1 rounded text-xs sm:text-sm hover:bg-green-700">Al</button>
                          <button onClick={() => onSell(s.symbol, 'stock')} className="bg-red-600 text-white px-3 py-1 rounded text-xs sm:text-sm hover:bg-red-700">Sat</button>
                          <button onClick={() => openChart(s.symbol, 'stock')} className="bg-indigo-600 text-white px-3 py-1 rounded text-xs sm:text-sm hover:bg-indigo-700 flex items-center gap-1">
                            <ChartBarIcon className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cryptos */}
          <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Kripto</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">Toplam {cryptos.length}</span>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-3 sm:hidden">
              {cryptos.map((c) => (
                <div key={c.id} className="border border-gray-200 dark:border-gray-800 rounded-lg p-3 bg-white dark:bg-gray-900">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Image src={c.image} alt={c.name} width={24} height={24} className="rounded-full" />
                      <div>
                        <Link href={`/asset/${c.symbol.toUpperCase()}?type=crypto&id=${c.id}`} className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400">
                          {c.name}
                        </Link>
                        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">{c.symbol}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">₺{c.current_price * USD_TO_TRY}</div>
                      <div className={`text-xs inline-flex items-center ${c.price_change_percentage_24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {c.price_change_percentage_24h >= 0 ? <ArrowUpIcon className="h-3 w-3 mr-1" /> : <ArrowDownIcon className="h-3 w-3 mr-1" />}
                        {c.price_change_percentage_24h.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => onBuy(c.symbol.toUpperCase(), 'crypto')} className="flex-1 bg-green-600 text-white px-3 py-2 rounded text-sm">Al</button>
                    <button onClick={() => onSell(c.symbol.toUpperCase(), 'crypto')} className="flex-1 bg-red-600 text-white px-3 py-2 rounded text-sm">Sat</button>
                    <button onClick={() => openChart(c.symbol.toUpperCase(), 'crypto', c.id)} className="flex-1 bg-indigo-600 text-white px-3 py-2 rounded text-sm flex items-center justify-center gap-1">
                      <ChartBarIcon className="h-4 w-4" />
                      Grafik
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Table (>=sm) */}
            <div className="overflow-x-auto -mx-4 sm:mx-0 hidden sm:block">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-800/60">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Token</th>
                    <th className="px-4 sm:px-6 py-3 text-right text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fiyat</th>
                    <th className="px-4 sm:px-6 py-3 text-right text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">24s</th>
                    <th className="px-4 sm:px-6 py-3 text-center text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">İşlem</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {cryptos.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <Image src={c.image} alt={c.name} width={24} height={24} className="rounded-full" />
                          <div>
                            <Link href={`/asset/${c.symbol.toUpperCase()}?type=crypto&id=${c.id}`} className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400">{c.name}</Link>
                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">{c.symbol}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-gray-100">₺{c.current_price * USD_TO_TRY}</td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right">
                        <div className={`inline-flex items-center ${c.price_change_percentage_24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {c.price_change_percentage_24h >= 0 ? <ArrowUpIcon className="h-4 w-4 mr-1" /> : <ArrowDownIcon className="h-4 w-4 mr-1" />}
                          <span className="text-sm font-medium">{c.price_change_percentage_24h.toFixed(2)}%</span>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => onBuy(c.symbol.toUpperCase(), 'crypto')} className="bg-green-600 text-white px-3 py-1 rounded text-xs sm:text-sm hover:bg-green-700">Al</button>
                          <button onClick={() => onSell(c.symbol.toUpperCase(), 'crypto')} className="bg-red-600 text-white px-3 py-1 rounded text-xs sm:text-sm hover:bg-red-700">Sat</button>
                          <button onClick={() => openChart(c.symbol.toUpperCase(), 'crypto', c.id)} className="bg-indigo-600 text-white px-3 py-1 rounded text-xs sm:text-sm hover:bg-indigo-700 flex items-center gap-1">
                            <ChartBarIcon className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Chart Modal */}
      {showChart && selectedAsset && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-4xl w-full mx-4 border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {selectedAsset.symbol} Grafik
              </h2>
              <button
                onClick={closeChart}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
              <PriceChart 
                type={selectedAsset.type} 
                symbol={selectedAsset.symbol} 
                id={selectedAsset.id} 
                days={30} 
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
