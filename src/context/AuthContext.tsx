'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  email: string;
  email_verified: boolean;
  balance: number;
  portfolio_value: number;
  total_profit_loss: number;
  rank: number;
  created_at: string;
  is_admin?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Logout fonksiyonunu önce tanımla (useEffect'te kullanılacak)
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('portfolio');
    
    // Cookie'yi de temizle
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    
    // Logout sonrası login sayfasına yönlendir
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }, []);

  // Sayfa yüklendiğinde localStorage'dan kullanıcı bilgilerini yükle
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      
      // Cookie'ye de token'ı kaydet (middleware için)
      document.cookie = `token=${savedToken}; path=/; max-age=86400; SameSite=Lax`;
    }
    setLoading(false);
  }, []);

  // Logout event'ini dinle (backendApi'den gelen)
  useEffect(() => {
    const handleLogout = () => {
      logout();
    };

    window.addEventListener('auth:logout', handleLogout);
    return () => {
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, [logout]);

  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest', // CSRF koruması için
        },
        body: JSON.stringify({ email, password }),
      });

      // Response'un başarılı olup olmadığını kontrol et
      if (!response.ok) {
        // Hata durumunda response'u parse et
        let errorMessage = 'Giriş başarısız';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          // JSON parse edilemezse status text'i kullan
          errorMessage = response.statusText || 'Sunucu hatası';
        }
        // 401 hatası normal bir durum (yanlış şifre), console.error yerine info log
        if (response.status === 401) {
          console.info('Login failed:', errorMessage);
        } else {
          console.error('Login failed:', errorMessage, 'Status:', response.status);
        }
        return { success: false, message: errorMessage };
      }

      const data = await response.json();

      if (data.success) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        // Cookie'ye de token'ı kaydet (middleware için)
        document.cookie = `token=${data.token}; path=/; max-age=86400; SameSite=Lax`;
        
        console.log('Login successful:', data.user);
        return { success: true };
      } else {
        const errorMessage = data.message || 'Bilinmeyen hata';
        console.info('Login failed:', errorMessage);
        return { success: false, message: errorMessage };
      }
    } catch (error) {
      console.error('Login error:', error);
      // Network hatası veya diğer hatalar
      let errorMessage = 'Sunucuya bağlanılamadı. Lütfen tekrar deneyin.';
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = 'Backend sunucusuna bağlanılamadı. Lütfen sunucunun çalıştığından emin olun.';
      }
      return { success: false, message: errorMessage };
    }
  };

  const register = async (username: string, email: string, password: string): Promise<boolean> => {
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Register error:', error);
      return false;
    }
  };

  const value = {
    user,
    token,
    login,
    register,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
