'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Stock } from '@/types';
import { usePortfolio } from '@/context/PortfolioContext';
import { transactionApi } from '@/services/backendApi';
import { useAuth } from '@/context/AuthContext';

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  stock: Stock | null;
  type: 'buy' | 'sell';
}

export default function TradeModal({ isOpen, onClose, stock, type }: TradeModalProps) {
  const [quantity, setQuantity] = useState<number>(1);
  const [totalAmount, setTotalAmount] = useState(0);
  const [commission, setCommission] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { state, buyStock, sellStock, refreshPortfolio } = usePortfolio();
  const { user } = useAuth();

  // USD-TRY dönüşüm oranı (gerçek uygulamada API'den alınır)
  const USD_TO_TRY = 32.5; // Yaklaşık kur

  useEffect(() => {
    if (stock && quantity > 0) {
      // Kripto için USD-TRY dönüşümü yap
      const isCrypto = stock.symbol.length <= 4; // Kripto sembolleri genelde kısa
      const priceInTRY = isCrypto ? stock.price * USD_TO_TRY : stock.price;
      
      const amount = quantity * priceInTRY;
      const comm = amount * 0.0025; // %0.25 komisyon (gerçekçi komisyon oranı)
      setTotalAmount(amount);
      setCommission(comm);
    } else {
      setTotalAmount(0);
      setCommission(0);
    }
  }, [quantity, stock]);

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value > 0) {
      setQuantity(value);
    } else if (e.target.value === '' || e.target.value === '.') {
      // Kullanıcı yazarken geçici olarak boş veya sadece nokta olabilir
      setQuantity(0);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stock || !user) return;

    // Miktar validasyonu
    if (!quantity || quantity <= 0) {
      setError('Miktar 0\'dan büyük olmalıdır!');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Kripto için asset_type belirleme
      const assetType = stock.symbol.length <= 4 ? 'crypto' : 'stock';
      const isCrypto = stock.symbol.length <= 4;
      const priceInTRY = isCrypto ? stock.price * USD_TO_TRY : stock.price;
      
      if (type === 'buy') {
        const totalCost = totalAmount + commission;
        if (totalCost > state.balance) {
          setError('Yetersiz bakiye!');
          setLoading(false);
          return;
        }

        // Backend'e alış isteği gönder
        const result = await transactionApi.buy({
          symbol: stock.symbol,
          name: stock.name,
          asset_type: assetType,
          quantity: quantity,
          price: priceInTRY
        });

        if (result.success) {
          // Portföyü yenile
          await refreshPortfolio();
          onClose();
          setQuantity(1);
          setError('');
        } else {
          setError(result.message || 'İşlem başarısız!');
        }
      } else {
        const portfolioItem = state.portfolioItems.find(item => item.symbol === stock.symbol);
        if (!portfolioItem) {
          setError('Portföyde bu varlık bulunamadı!');
          setLoading(false);
          return;
        }
        if (portfolioItem.quantity < quantity) {
          setError(`Yetersiz miktar! Mevcut: ${portfolioItem.quantity.toFixed(8)}`);
          setLoading(false);
          return;
        }

        // Backend'e satış isteği gönder
        const result = await transactionApi.sell({
          symbol: stock.symbol,
          quantity: quantity
        });

        if (result.success) {
          // Portföyü yenile
          await refreshPortfolio();
          onClose();
          setQuantity(1);
          setError('');
        } else {
          setError(result.message || 'İşlem başarısız!');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu!');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !stock) return null;

  // Kripto için USD-TRY dönüşümü
  const isCrypto = stock.symbol.length <= 4;
  const priceInTRY = isCrypto ? stock.price * USD_TO_TRY : stock.price;

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full mx-4 border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {type === 'buy' ? 'Hisse Al' : 'Hisse Sat'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Stock Info */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center">
                <span className="text-lg font-medium text-indigo-600">
                  {stock.symbol.charAt(0)}
                </span>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100">{stock.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{stock.symbol}</p>
              </div>
            </div>
            <div className="mt-3 flex justify-between items-center">
              <span className="text-sm text-gray-500 dark:text-gray-400">Güncel Fiyat</span>
              <div className="text-right">
                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  ₺{priceInTRY.toLocaleString('tr-TR')}
                </span>
                {isCrypto && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    ${stock.price.toLocaleString('tr-TR')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quantity Input */}
          <div>
            <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Miktar
            </label>
            <input
              type="number"
              id="quantity"
              min="0.01"
              step="0.01"
              value={quantity || ''}
              onChange={handleQuantityChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Miktar girin (örn: 1.2)"
            />
          </div>

          {/* Transaction Details */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">Toplam Tutar</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">₺{totalAmount.toLocaleString('tr-TR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">Komisyon (%0.25)</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">₺{commission.toLocaleString('tr-TR')}</span>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {type === 'buy' ? 'Toplam Maliyet' : 'Net Gelir'}
                </span>
                <span className={`font-semibold ${type === 'buy' ? 'text-red-600' : 'text-green-600'}`}>
                  ₺{(type === 'buy' ? totalAmount + commission : totalAmount - commission).toLocaleString('tr-TR')}
                </span>
              </div>
            </div>
          </div>

          {/* Balance Info */}
          {type === 'buy' && (
            <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-blue-700 dark:text-blue-300">Mevcut Bakiye</span>
                <span className="font-medium text-blue-700 dark:text-blue-300">₺{state.balance.toLocaleString('tr-TR')}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-sm text-blue-700 dark:text-blue-300">İşlem Sonrası Bakiye</span>
                <span className="font-medium text-blue-700 dark:text-blue-300">
                  ₺{(state.balance - totalAmount - commission).toLocaleString('tr-TR')}
                </span>
              </div>
            </div>
          )}

          {type === 'sell' && (
            <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-green-700 dark:text-green-300">Mevcut Miktar</span>
                <span className="font-medium text-green-700 dark:text-green-300">
                  {(state.portfolioItems.find(item => item.symbol === stock.symbol)?.quantity || 0).toFixed(8)}
                </span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 px-4 py-2 rounded-lg text-white font-medium transition-colors ${
                type === 'buy' 
                  ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-400' 
                  : 'bg-red-600 hover:bg-red-700 disabled:bg-red-400'
              }`}
            >
              {loading ? 'İşleniyor...' : (type === 'buy' ? 'Satın Al' : 'Sat')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
