'use client';

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { PortfolioItem, Transaction, Stock } from '@/types';

interface PortfolioState {
  balance: number;
  portfolioItems: PortfolioItem[];
  transactions: Transaction[];
  totalValue: number;
  totalProfitLoss: number;
}

type PortfolioAction =
  | { type: 'BUY_STOCK'; payload: { stock: Stock; quantity: number; price: number } }
  | { type: 'SELL_STOCK'; payload: { stock: Stock; quantity: number; price: number } }
  | { type: 'UPDATE_PRICES'; payload: Stock[] }
  | { type: 'RESET_PORTFOLIO' };

const initialState: PortfolioState = {
  balance: 10000, // Başlangıç bakiyesi
  portfolioItems: [],
  transactions: [],
  totalValue: 0,
  totalProfitLoss: 0,
};

const portfolioReducer = (state: PortfolioState, action: PortfolioAction): PortfolioState => {
  switch (action.type) {
    case 'BUY_STOCK': {
      const { stock, quantity, price } = action.payload;
      const totalAmount = quantity * price;
      const commission = totalAmount * 0.001; // %0.1 komisyon
      const totalCost = totalAmount + commission;

      if (totalCost > state.balance) {
        return state; // Yetersiz bakiye
      }

      const existingItem = state.portfolioItems.find(item => item.symbol === stock.symbol);
      let newPortfolioItems: PortfolioItem[];

      if (existingItem) {
        // Mevcut pozisyonu güncelle
        const newQuantity = existingItem.quantity + quantity;
        const newTotalCost = (existingItem.quantity * existingItem.averagePrice) + totalAmount;
        const newAveragePrice = newTotalCost / newQuantity;

        newPortfolioItems = state.portfolioItems.map(item =>
          item.symbol === stock.symbol
            ? {
                ...item,
                quantity: newQuantity,
                averagePrice: newAveragePrice,
                totalValue: newQuantity * stock.price,
                profitLoss: (stock.price - newAveragePrice) * newQuantity,
                profitLossPercent: ((stock.price - newAveragePrice) / newAveragePrice) * 100
              }
            : item
        );
      } else {
        // Yeni pozisyon oluştur
        newPortfolioItems = [
          ...state.portfolioItems,
          {
            id: Date.now().toString(),
            symbol: stock.symbol,
            name: stock.name,
            quantity,
            averagePrice: price,
            currentPrice: stock.price,
            totalValue: quantity * stock.price,
            profitLoss: 0,
            profitLossPercent: 0
          }
        ];
      }

      const newTransaction: Transaction = {
        id: Date.now().toString(),
        type: 'buy',
        symbol: stock.symbol,
        name: stock.name,
        quantity,
        price,
        totalAmount,
        commission,
        timestamp: new Date()
      };

      const newBalance = state.balance - totalCost;
      const newTotalValue = newPortfolioItems.reduce((sum, item) => sum + item.totalValue, 0);
      const newTotalProfitLoss = newPortfolioItems.reduce((sum, item) => sum + item.profitLoss, 0);

      return {
        ...state,
        balance: newBalance,
        portfolioItems: newPortfolioItems,
        transactions: [newTransaction, ...state.transactions],
        totalValue: newTotalValue,
        totalProfitLoss: newTotalProfitLoss
      };
    }

    case 'SELL_STOCK': {
      const { stock, quantity, price } = action.payload;
      const existingItem = state.portfolioItems.find(item => item.symbol === stock.symbol);

      if (!existingItem || existingItem.quantity < quantity) {
        return state; // Yetersiz miktar
      }

      const totalRevenue = quantity * price;
      const commission = totalRevenue * 0.001; // %0.1 komisyon
      const netRevenue = totalRevenue - commission;

      let newPortfolioItems: PortfolioItem[];

      if (existingItem.quantity === quantity) {
        // Tüm pozisyonu sat
        newPortfolioItems = state.portfolioItems.filter(item => item.symbol !== stock.symbol);
      } else {
        // Kısmi satış
        const newQuantity = existingItem.quantity - quantity;
        newPortfolioItems = state.portfolioItems.map(item =>
          item.symbol === stock.symbol
            ? {
                ...item,
                quantity: newQuantity,
                totalValue: newQuantity * stock.price,
                profitLoss: (stock.price - item.averagePrice) * newQuantity,
                profitLossPercent: ((stock.price - item.averagePrice) / item.averagePrice) * 100
              }
            : item
        );
      }

      const newTransaction: Transaction = {
        id: Date.now().toString(),
        type: 'sell',
        symbol: stock.symbol,
        name: stock.name,
        quantity,
        price,
        totalAmount: totalRevenue,
        commission,
        timestamp: new Date()
      };

      const newBalance = state.balance + netRevenue;
      const newTotalValue = newPortfolioItems.reduce((sum, item) => sum + item.totalValue, 0);
      const newTotalProfitLoss = newPortfolioItems.reduce((sum, item) => sum + item.profitLoss, 0);

      return {
        ...state,
        balance: newBalance,
        portfolioItems: newPortfolioItems,
        transactions: [newTransaction, ...state.transactions],
        totalValue: newTotalValue,
        totalProfitLoss: newTotalProfitLoss
      };
    }

    case 'UPDATE_PRICES': {
      const updatedStocks = action.payload;
      const newPortfolioItems = state.portfolioItems.map(item => {
        const updatedStock = updatedStocks.find(stock => stock.symbol === item.symbol);
        if (updatedStock) {
          const newTotalValue = item.quantity * updatedStock.price;
          const newProfitLoss = (updatedStock.price - item.averagePrice) * item.quantity;
          const newProfitLossPercent = ((updatedStock.price - item.averagePrice) / item.averagePrice) * 100;

          return {
            ...item,
            currentPrice: updatedStock.price,
            totalValue: newTotalValue,
            profitLoss: newProfitLoss,
            profitLossPercent: newProfitLossPercent
          };
        }
        return item;
      });

      const newTotalValue = newPortfolioItems.reduce((sum, item) => sum + item.totalValue, 0);
      const newTotalProfitLoss = newPortfolioItems.reduce((sum, item) => sum + item.profitLoss, 0);

      return {
        ...state,
        portfolioItems: newPortfolioItems,
        totalValue: newTotalValue,
        totalProfitLoss: newTotalProfitLoss
      };
    }

    case 'RESET_PORTFOLIO':
      return initialState;

    default:
      return state;
  }
};

interface PortfolioContextType {
  state: PortfolioState;
  buyStock: (stock: Stock, quantity: number, price: number) => void;
  sellStock: (stock: Stock, quantity: number, price: number) => void;
  updatePrices: (stocks: Stock[]) => void;
  resetPortfolio: () => void;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined);

export const PortfolioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(portfolioReducer, initialState);

  const buyStock = (stock: Stock, quantity: number, price: number) => {
    dispatch({ type: 'BUY_STOCK', payload: { stock, quantity, price } });
  };

  const sellStock = (stock: Stock, quantity: number, price: number) => {
    dispatch({ type: 'SELL_STOCK', payload: { stock, quantity, price } });
  };

  const updatePrices = (stocks: Stock[]) => {
    dispatch({ type: 'UPDATE_PRICES', payload: stocks });
  };

  const resetPortfolio = () => {
    dispatch({ type: 'RESET_PORTFOLIO' });
  };

  // Local storage'a kaydet
  useEffect(() => {
    localStorage.setItem('portfolio', JSON.stringify(state));
  }, [state]);

  // Local storage'dan yükle
  useEffect(() => {
    const savedPortfolio = localStorage.getItem('portfolio');
    if (savedPortfolio) {
      try {
        const parsed = JSON.parse(savedPortfolio);
        // Timestamp'leri Date objelerine çevir
        parsed.transactions = parsed.transactions.map((t: any) => ({
          ...t,
          timestamp: new Date(t.timestamp)
        }));
        // State'i güncelle
        Object.assign(state, parsed);
      } catch (error) {
        console.error('Portfolio load error:', error);
      }
    }
  }, []);

  return (
    <PortfolioContext.Provider value={{
      state,
      buyStock,
      sellStock,
      updatePrices,
      resetPortfolio
    }}>
      {children}
    </PortfolioContext.Provider>
  );
};

export const usePortfolio = () => {
  const context = useContext(PortfolioContext);
  if (context === undefined) {
    throw new Error('usePortfolio must be used within a PortfolioProvider');
  }
  return context;
};
