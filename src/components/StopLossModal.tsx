'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { PortfolioItem } from '@/types';
import { stopLossApi } from '@/services/backendApi';

interface StopLossModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioItem: PortfolioItem | null;
  currentPrice: number;
}

export default function StopLossModal({ isOpen, onClose, portfolioItem, currentPrice }: StopLossModalProps) {
  const [triggerPrice, setTriggerPrice] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && portfolioItem) {
      const suggestedPrice = currentPrice * 0.95;
      setTriggerPrice(suggestedPrice.toFixed(2));
      setQuantity(portfolioItem.quantity.toString());
      setError('');
    }
  }, [isOpen, portfolioItem, currentPrice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!portfolioItem) return;

    const triggerPriceNum = parseFloat(triggerPrice);
    const quantityNum = parseFloat(quantity);

    if (!triggerPrice || triggerPriceNum <= 0) {
      setError('Tetikleme fiyatı 0\'dan büyük olmalıdır!');
      return;
    }

    if (triggerPriceNum >= currentPrice) {
      setError('Tetikleme fiyatı güncel fiyattan düşük olmalıdır!');
      return;
    }

    if (!quantity || quantityNum <= 0) {
      setError('Miktar 0\'dan büyük olmalıdır!');
      return;
    }

    if (quantityNum > portfolioItem.quantity) {
      setError(`Miktar portföydeki miktardan fazla olamaz! (Mevcut: ${portfolioItem.quantity.toFixed(8)})`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await stopLossApi.create({
        portfolio_item_id: portfolioItem.id || '',
        trigger_price: triggerPriceNum,
        quantity: quantityNum
      });

      if (result.success) {
        onClose();
        setTriggerPrice('');
        setQuantity('');
        setError('');
      } else {
        setError(result.message || 'Stop-loss emri oluşturulamadı!');
      }
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu!');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !portfolioItem) return null;

  const triggerPriceNum = parseFloat(triggerPrice) || 0;
  const lossPercent = currentPrice > 0 ? ((currentPrice - triggerPriceNum) / currentPrice) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#1e2329] rounded-2xl shadow-2xl max-w-lg w-full border border-[#2b3139] overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2b3139] bg-[#f6465d]/10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-[#f6465d]/20 rounded-full flex items-center justify-center">
              <span className="text-lg font-bold text-[#f6465d]">SL</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#f6465d]">Stop-Loss Emri</h2>
              <p className="text-sm text-[#848e9c]">{portfolioItem.name} ({portfolioItem.symbol})</p>
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
          <div className="bg-[#161a1e] rounded-xl p-5 border border-[#2b3139]">
            <div className="text-[#848e9c] text-sm mb-2">Güncel Fiyat</div>
            <div className="text-3xl font-bold text-white">
              ₺{currentPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-[#848e9c] font-medium">
              Tetikleme Fiyatı (₺)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={triggerPrice}
              onChange={(e) => setTriggerPrice(e.target.value)}
              className="w-full px-4 py-4 bg-[#161a1e] border-2 border-[#2b3139] rounded-xl text-white text-lg font-semibold focus:outline-none focus:border-[#f6465d] transition-colors placeholder:text-[#848e9c]"
              placeholder="0.00"
            />
            {triggerPriceNum > 0 && (
              <div className="text-xs text-[#848e9c]">
                Bu fiyatın altına düştüğünde otomatik satış yapılacak
              </div>
            )}
          </div>

          {triggerPriceNum > 0 && (
            <div className="bg-[#f6465d]/10 rounded-xl p-4 border border-[#f6465d]/30">
              <div className="text-sm text-[#848e9c] mb-1">Potansiyel Zarar</div>
              <div className="text-2xl font-bold text-[#f6465d]">
                -{lossPercent.toFixed(2)}%
              </div>
              <div className="text-xs text-[#848e9c] mt-1">
                ₺{(currentPrice - triggerPriceNum).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zarar
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-[#848e9c] font-medium">
                Miktar
              </label>
              <span className="text-xs text-[#848e9c]">
                Mevcut: {portfolioItem.quantity.toFixed(8)} {portfolioItem.symbol}
              </span>
            </div>
            <input
              type="number"
              min="0"
              step="0.00000001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-4 py-4 bg-[#161a1e] border-2 border-[#2b3139] rounded-xl text-white text-lg font-semibold focus:outline-none focus:border-[#f6465d] transition-colors placeholder:text-[#848e9c]"
              placeholder="0.00"
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[0.25, 0.5, 0.75, 1].map((percent) => (
              <button
                key={percent}
                type="button"
                onClick={() => setQuantity((portfolioItem.quantity * percent).toString())}
                className="py-2 px-3 bg-[#161a1e] border border-[#2b3139] rounded-lg text-sm font-medium text-[#848e9c] hover:text-white hover:border-[#f6465d] transition-all"
              >
                {percent === 1 ? 'MAX' : `${percent * 100}%`}
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-[#f6465d]/10 border border-[#f6465d]/30 rounded-xl p-3">
              <p className="text-sm text-[#f6465d] font-medium">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !triggerPrice || !quantity}
            className="w-full py-4 rounded-xl text-white font-bold text-lg transition-all shadow-lg bg-[#f6465d] hover:bg-[#e03e54] disabled:bg-[#f6465d]/50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Oluşturuluyor...
              </span>
            ) : (
              'Stop-Loss Emri Oluştur'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

