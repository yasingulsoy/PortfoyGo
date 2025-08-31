'use client';

import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Stock } from '@/types';
import { usePortfolio } from '@/context/PortfolioContext';

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  stock: Stock | null;
  type: 'buy' | 'sell';
}

export default function TradeModal({ isOpen, onClose, stock, type }: TradeModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [totalAmount, setTotalAmount] = useState(0);
  const [commission, setCommission] = useState(0);
  const [error, setError] = useState('');
  
  const { state, buyStock, sellStock } = usePortfolio();

  useEffect(() => {
    if (stock) {
      const amount = quantity * stock.price;
      const comm = amount * 0.001; // %0.1 komisyon
      setTotalAmount(amount);
      setCommission(comm);
    }
  }, [quantity, stock]);

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (value > 0) {
      setQuantity(value);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stock) return;

    if (type === 'buy') {
      const totalCost = totalAmount + commission;
      if (totalCost > state.balance) {
        setError('Yetersiz bakiye!');
        return;
      }
      buyStock(stock, quantity, stock.price);
    } else {
      const portfolioItem = state.portfolioItems.find(item => item.symbol === stock.symbol);
      if (!portfolioItem || portfolioItem.quantity < quantity) {
        setError('Yetersiz hisse miktarı!');
        return;
      }
      sellStock(stock, quantity, stock.price);
    }

    onClose();
    setQuantity(1);
    setError('');
  };

  if (!isOpen || !stock) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {type === 'buy' ? 'Hisse Al' : 'Hisse Sat'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Stock Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center">
                <span className="text-lg font-medium text-indigo-600">
                  {stock.symbol.charAt(0)}
                </span>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{stock.name}</h3>
                <p className="text-sm text-gray-500">{stock.symbol}</p>
              </div>
            </div>
            <div className="mt-3 flex justify-between items-center">
              <span className="text-sm text-gray-500">Güncel Fiyat</span>
              <span className="text-lg font-semibold text-gray-900">
                ₺{stock.price.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Quantity Input */}
          <div>
            <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-2">
              Miktar
            </label>
            <input
              type="number"
              id="quantity"
              min="1"
              value={quantity}
              onChange={handleQuantityChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Miktar girin"
            />
          </div>

          {/* Transaction Details */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Toplam Tutar</span>
              <span className="font-medium">₺{totalAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Komisyon (%0.1)</span>
              <span className="font-medium">₺{commission.toLocaleString()}</span>
            </div>
            <div className="border-t pt-3">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {type === 'buy' ? 'Toplam Maliyet' : 'Net Gelir'}
                </span>
                <span className={`font-semibold ${type === 'buy' ? 'text-red-600' : 'text-green-600'}`}>
                  ₺{(type === 'buy' ? totalAmount + commission : totalAmount - commission).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Balance Info */}
          {type === 'buy' && (
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-blue-700">Mevcut Bakiye</span>
                <span className="font-medium text-blue-700">₺{state.balance.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-sm text-blue-700">İşlem Sonrası Bakiye</span>
                <span className="font-medium text-blue-700">
                  ₺{(state.balance - totalAmount - commission).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {type === 'sell' && (
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-green-700">Mevcut Miktar</span>
                <span className="font-medium text-green-700">
                  {state.portfolioItems.find(item => item.symbol === stock.symbol)?.quantity || 0}
                </span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              className={`flex-1 px-4 py-2 rounded-lg text-white font-medium transition-colors ${
                type === 'buy' 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {type === 'buy' ? 'Satın Al' : 'Sat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
