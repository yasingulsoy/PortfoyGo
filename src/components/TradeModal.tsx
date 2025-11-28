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
  const [inputMode, setInputMode] = useState<'quantity' | 'amount'>('quantity'); // Miktar veya Tutar modu
  const [amountInput, setAmountInput] = useState<string>(''); // Tutar girişi için ayrı state
  
  const { state, buyStock, sellStock, refreshPortfolio } = usePortfolio();
  const { user } = useAuth();

  // USD-TRY dönüşüm oranı (gerçek uygulamada API'den alınır)
  const USD_TO_TRY = 32.5; // Yaklaşık kur

  // Modal açıldığında quantity'yi sıfırla
  useEffect(() => {
    if (isOpen && stock) {
      setQuantity(1);
      setError('');
      setInputMode('quantity');
      setAmountInput('');
    }
  }, [isOpen, stock]);

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

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setAmountInput(inputValue);
    
    if (inputValue === '' || inputValue === '.') {
      setQuantity(0);
      return;
    }
    const amountValue = parseFloat(inputValue);
    if (!isNaN(amountValue) && amountValue >= 0 && stock) {
      const isCrypto = stock.symbol.length <= 4;
      const priceInTRY = isCrypto ? stock.price * USD_TO_TRY : stock.price;
      if (priceInTRY > 0) {
        const calculatedQuantity = amountValue / priceInTRY;
        setQuantity(calculatedQuantity);
      }
    }
  };

  // Input modu değiştiğinde amountInput'u güncelle
  useEffect(() => {
    if (inputMode === 'amount') {
      if (totalAmount > 0) {
        setAmountInput(totalAmount.toFixed(2));
      } else {
        setAmountInput('');
      }
    }
  }, [inputMode, totalAmount]);

  const setQuickQuantity = (percentage: number) => {
    if (!stock) return;
    
    if (type === 'buy') {
      const isCrypto = stock.symbol.length <= 4;
      const priceInTRY = isCrypto ? stock.price * USD_TO_TRY : stock.price;
      const maxAmount = state.balance * 0.99; // Komisyon için küçük bir pay bırak
      const maxQuantity = maxAmount / (priceInTRY * 1.0025); // Komisyon dahil
      setQuantity(maxQuantity * percentage);
    } else {
      const portfolioItem = state.portfolioItems.find(item => item.symbol === stock.symbol);
      if (portfolioItem) {
        setQuantity(portfolioItem.quantity * percentage);
      }
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
  const totalCost = type === 'buy' ? totalAmount + commission : totalAmount - commission;
  const availableQuantity = type === 'sell' 
    ? (state.portfolioItems.find(item => item.symbol === stock.symbol)?.quantity || 0)
    : 0;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto pt-8 sm:pt-16">
      <div className="bg-[#1e2329] rounded-2xl shadow-2xl max-w-lg w-full border border-[#2b3139] overflow-hidden mt-0 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b border-[#2b3139] ${
          type === 'buy' ? 'bg-[#0b1529]' : 'bg-[#1a0f1a]'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
              type === 'buy' ? 'bg-[#0ecb81]/20' : 'bg-[#f6465d]/20'
            }`}>
              <span className={`text-lg font-bold ${
                type === 'buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'
              }`}>
                {stock.symbol.charAt(0)}
              </span>
            </div>
            <div>
              <h2 className={`text-xl font-bold ${
                type === 'buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'
              }`}>
                {type === 'buy' ? 'ALIŞ' : 'SATIŞ'}
              </h2>
              <p className="text-sm text-[#848e9c]">{stock.name} ({stock.symbol})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#848e9c] hover:text-white transition-colors p-1 hover:bg-[#2b3139] rounded-lg"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Price Display - Binance Style */}
          <div className="bg-[#161a1e] rounded-xl p-5 border border-[#2b3139]">
            <div className="text-[#848e9c] text-sm mb-2">Güncel Fiyat</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">
                ₺{priceInTRY.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {isCrypto && (
                <span className="text-lg text-[#848e9c]">
                  ${stock.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
          </div>

          {/* Input Mode Toggle */}
          <div className="flex gap-2 bg-[#161a1e] rounded-lg p-1 border border-[#2b3139]">
            <button
              type="button"
              onClick={() => setInputMode('quantity')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                inputMode === 'quantity'
                  ? 'bg-[#2b3139] text-white'
                  : 'text-[#848e9c] hover:text-white'
              }`}
            >
              Miktar
            </button>
            <button
              type="button"
              onClick={() => setInputMode('amount')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                inputMode === 'amount'
                  ? 'bg-[#2b3139] text-white'
                  : 'text-[#848e9c] hover:text-white'
              }`}
            >
              Tutar (₺)
            </button>
          </div>

          {/* Quantity/Amount Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-[#848e9c] font-medium">
                {inputMode === 'quantity' ? 'Miktar' : 'Tutar'}
              </label>
              <span className="text-xs text-[#848e9c]">
                {inputMode === 'quantity' 
                  ? `Mevcut: ${availableQuantity > 0 ? availableQuantity.toFixed(8) : '0'}`
                  : `Mevcut: ₺${state.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
                }
              </span>
            </div>
            <div className="relative">
              {inputMode === 'quantity' ? (
                <input
                  type="number"
                  min="0"
                  step="0.00000001"
                  value={quantity || ''}
                  onChange={handleQuantityChange}
                  className="w-full px-4 py-4 bg-[#161a1e] border-2 border-[#2b3139] rounded-xl text-white text-lg font-semibold focus:outline-none focus:border-[#0ecb81] transition-colors placeholder:text-[#848e9c]"
                  placeholder="0.00"
                />
              ) : (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountInput}
                  onChange={handleAmountChange}
                  className="w-full px-4 py-4 bg-[#161a1e] border-2 border-[#2b3139] rounded-xl text-white text-lg font-semibold focus:outline-none focus:border-[#0ecb81] transition-colors placeholder:text-[#848e9c]"
                  placeholder="0.00"
                />
              )}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#848e9c] text-sm">
                {inputMode === 'quantity' ? stock.symbol : '₺'}
              </div>
            </div>
          </div>

          {/* Quick Percentage Buttons */}
          <div className="grid grid-cols-4 gap-2">
            {[0.25, 0.5, 0.75, 1].map((percent) => (
              <button
                key={percent}
                type="button"
                onClick={() => setQuickQuantity(percent)}
                className="py-2 px-3 bg-[#161a1e] border border-[#2b3139] rounded-lg text-sm font-medium text-[#848e9c] hover:text-white hover:border-[#0ecb81] transition-all"
              >
                {percent === 1 ? 'MAX' : `${percent * 100}%`}
              </button>
            ))}
          </div>

          {/* Transaction Summary */}
          <div className="bg-[#161a1e] rounded-xl p-4 border border-[#2b3139] space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-[#848e9c]">Toplam Tutar</span>
              <span className="text-sm font-medium text-white">
                ₺{totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-[#848e9c]">Komisyon (%0.25)</span>
              <span className="text-sm font-medium text-white">
                ₺{commission.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="border-t border-[#2b3139] pt-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-[#848e9c]">
                  {type === 'buy' ? 'Toplam Maliyet' : 'Net Gelir'}
                </span>
                <span className={`text-lg font-bold ${
                  type === 'buy' ? 'text-[#f6465d]' : 'text-[#0ecb81]'
                }`}>
                  ₺{totalCost.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Balance Info */}
          {type === 'buy' && (
            <div className="bg-[#0b1529]/50 rounded-xl p-4 border border-[#0ecb81]/20">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-[#848e9c]">Mevcut Bakiye</span>
                <span className="text-sm font-semibold text-white">
                  ₺{state.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#848e9c]">İşlem Sonrası Bakiye</span>
                <span className={`text-sm font-semibold ${
                  state.balance - totalCost >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'
                }`}>
                  ₺{(state.balance - totalCost).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          {type === 'sell' && (
            <div className="bg-[#1a0f1a]/50 rounded-xl p-4 border border-[#f6465d]/20">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#848e9c]">Mevcut Miktar</span>
                <span className="text-sm font-semibold text-white">
                  {availableQuantity.toFixed(8)} {stock.symbol}
                </span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-[#f6465d]/10 border border-[#f6465d]/30 rounded-xl p-3">
              <p className="text-sm text-[#f6465d] font-medium">{error}</p>
            </div>
          )}

          {/* Action Button - Binance Style */}
          <button
            type="submit"
            disabled={loading || quantity <= 0}
            className={`w-full py-4 rounded-xl text-white font-bold text-lg transition-all shadow-lg ${
              type === 'buy'
                ? 'bg-[#0ecb81] hover:bg-[#0bb975] disabled:bg-[#0ecb81]/50 disabled:cursor-not-allowed'
                : 'bg-[#f6465d] hover:bg-[#e03e54] disabled:bg-[#f6465d]/50 disabled:cursor-not-allowed'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                İşleniyor...
              </span>
            ) : (
              type === 'buy' ? 'SATIN AL' : 'SAT'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
