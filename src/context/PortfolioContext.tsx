'use client';

import React, { createContext, useContext, useReducer, useEffect, useState, ReactNode, useCallback } from 'react';
import { PortfolioItem, Transaction, Stock } from '@/types';
import { portfolioApi } from '@/services/backendApi';

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
  | { type: 'RESET_PORTFOLIO' }
  | { type: 'SET_PORTFOLIO'; payload: { balance: number; portfolioItems: PortfolioItem[]; transactions: Transaction[]; totalValue: number; totalProfitLoss: number } };

const initialState: PortfolioState = {
  balance: 10000000, // Başlangıç bakiyesi
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
      const commission = totalAmount * 0.0025; // %0.25 komisyon
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
      const commission = totalRevenue * 0.0025; // %0.25 komisyon
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
        // Case-insensitive symbol eşleştirmesi
        const updatedStock = updatedStocks.find(stock => 
          stock.symbol.toUpperCase() === item.symbol.toUpperCase()
        );
        if (updatedStock) {
          const newTotalValue = item.quantity * updatedStock.price;
          const newProfitLoss = (updatedStock.price - item.averagePrice) * item.quantity;
          const newProfitLossPercent = item.averagePrice > 0 
            ? ((updatedStock.price - item.averagePrice) / item.averagePrice) * 100 
            : 0;

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

    case 'SET_PORTFOLIO':
      return {
        ...state,
        balance: action.payload.balance,
        portfolioItems: action.payload.portfolioItems,
        transactions: action.payload.transactions,
        totalValue: action.payload.totalValue,
        totalProfitLoss: action.payload.totalProfitLoss
      };

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
  refreshPortfolio: () => Promise<void>;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined);

export const PortfolioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initial state'i localStorage'dan yükle
  const getInitialState = (): PortfolioState => {
    if (typeof window === 'undefined') return initialState;
    
    const savedPortfolio = localStorage.getItem('portfolio');
    if (savedPortfolio) {
      try {
        const parsed = JSON.parse(savedPortfolio);
        // Timestamp'leri Date objelerine çevir
        if (parsed.transactions && Array.isArray(parsed.transactions)) {
          parsed.transactions = parsed.transactions.map((t: { timestamp: string | number; [key: string]: unknown }) => ({
            ...t,
            timestamp: new Date(t.timestamp)
          }));
        }
        return {
          ...initialState,
          ...parsed,
          transactions: parsed.transactions || []
        };
      } catch (error) {
        console.error('Portfolio load error:', error);
        return initialState;
      }
    }
    return initialState;
  };

  const [state, dispatch] = useReducer(portfolioReducer, getInitialState());
  const [isInitialized, setIsInitialized] = useState(false);

  const buyStock = (stock: Stock, quantity: number, price: number) => {
    dispatch({ type: 'BUY_STOCK', payload: { stock, quantity, price } });
  };

  const sellStock = (stock: Stock, quantity: number, price: number) => {
    dispatch({ type: 'SELL_STOCK', payload: { stock, quantity, price } });
  };

  const updatePrices = useCallback((stocks: Stock[]) => {
    dispatch({ type: 'UPDATE_PRICES', payload: stocks });
  }, []);

  const resetPortfolio = () => {
    dispatch({ type: 'RESET_PORTFOLIO' });
    localStorage.removeItem('portfolio');
  };

  const refreshPortfolio = useCallback(async () => {
    try {
      const result = await portfolioApi.getPortfolio();
      if (result.success && result.portfolio) {
        // Portföy verilerini state'e aktar
        const portfolioItems: PortfolioItem[] = result.portfolio.map((item: any) => ({
          id: item.id,
          symbol: item.symbol,
          name: item.name,
          quantity: item.quantity,
          averagePrice: item.average_price,
          currentPrice: item.current_price,
          totalValue: item.total_value,
          profitLoss: item.profit_loss,
          profitLossPercent: item.profit_loss_percent
        }));

        // Transactions'ı da al
        const transactionsResult = await portfolioApi.getTransactions();
        const transactions: Transaction[] = transactionsResult.success && transactionsResult.transactions
          ? transactionsResult.transactions.map((t: any) => ({
              id: t.id,
              type: t.type,
              symbol: t.symbol,
              name: t.name,
              quantity: t.quantity,
              price: t.price,
              totalAmount: t.total_amount,
              commission: t.commission,
              timestamp: new Date(t.created_at)
            }))
          : [];

        // State'i güncelle
        dispatch({
          type: 'SET_PORTFOLIO',
          payload: {
            balance: result.balance || 0,
            portfolioItems,
            transactions,
            totalValue: result.portfolioValue || 0,
            totalProfitLoss: result.totalProfitLoss || 0
          }
        } as any);
      }
    } catch (error) {
      console.error('Refresh portfolio error:', error);
    }
  }, []);

  // Local storage'a kaydet (sadece state değiştiğinde)
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('portfolio', JSON.stringify(state));
    }
  }, [state, isInitialized]);

  // Sayfa yüklendiğinde kullanıcı varsa API'den veri çek
  useEffect(() => {
    const checkAndRefresh = async () => {
      const token = localStorage.getItem('token');
      if (token && !isInitialized) {
        try {
          await refreshPortfolio();
        } catch (error) {
          // Token geçersizse veya başka bir hata varsa
          // isInitialized'ı true yap ki tekrar denemesin
          // (backendApi zaten logout yapacak ve yönlendirecek)
          console.error('Portfolio refresh failed:', error);
        } finally {
          // Her durumda initialized olarak işaretle
          setIsInitialized(true);
        }
      } else if (!token) {
        setIsInitialized(true);
      }
    };
    
    checkAndRefresh();
  }, [refreshPortfolio, isInitialized]);

  return (
    <PortfolioContext.Provider value={{
      state,
      buyStock,
      sellStock,
      updatePrices,
      resetPortfolio,
      refreshPortfolio
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
