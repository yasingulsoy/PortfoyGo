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
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';
    const loginUrl = `${API_BASE_URL}/auth/login`;
    const timestamp = new Date().toISOString();
    
    console.log('\n🔐 LOGIN ATTEMPT');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Timestamp: ${timestamp}`);
    console.log(`API URL: ${loginUrl}`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${password ? '***' : 'Not provided'}`);
    console.log(`NEXT_PUBLIC_API_URL: ${process.env.NEXT_PUBLIC_API_URL || 'Not set'}`);
    console.log(`Window location: ${typeof window !== 'undefined' ? window.location.origin : 'N/A'}`);
    
    try {
      console.log('📤 Sending login request...');
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest', // CSRF koruması için
        },
        credentials: 'include', // CORS için gerekli (backend'de credentials: true var)
        body: JSON.stringify({ email, password }),
      });

      console.log(`📥 Response received:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
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
          console.warn('⚠️  Login failed (401):', errorMessage);
        } else {
          console.error('❌ Login failed:', errorMessage, 'Status:', response.status);
        }
        console.log('═══════════════════════════════════════════════════════\n');
        return { success: false, message: errorMessage };
      }

      const data = await response.json();
      console.log('📦 Response data:', { 
        success: data.success, 
        hasToken: !!data.token,
        hasUser: !!data.user,
        userEmail: data.user?.email,
      });

      if (data.success) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        // Cookie'ye de token'ı kaydet (middleware için)
        document.cookie = `token=${data.token}; path=/; max-age=86400; SameSite=Lax`;
        
        console.log('✅ Login successful!');
        console.log('═══════════════════════════════════════════════════════\n');
        return { success: true };
      } else {
        const errorMessage = data.message || 'Bilinmeyen hata';
        console.warn('⚠️  Login failed:', errorMessage);
        console.log('═══════════════════════════════════════════════════════\n');
        return { success: false, message: errorMessage };
      }
    } catch (error: any) {
      console.error('\n❌ LOGIN ERROR');
      console.error('═══════════════════════════════════════════════════════');
      console.error('Error type:', error.name || 'Unknown');
      console.error('Error message:', error.message || 'Unknown error');
      console.error('Error stack:', error.stack);
      console.error('Is TypeError:', error instanceof TypeError);
      console.error('Is NetworkError:', error.message?.includes('fetch') || error.message?.includes('Failed to fetch'));
      console.error('═══════════════════════════════════════════════════════\n');
      
      // Network hatası veya diğer hatalar
      let errorMessage = 'Sunucuya bağlanılamadı. Lütfen tekrar deneyin.';
      if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('Failed to fetch'))) {
        errorMessage = 'Backend sunucusuna bağlanılamadı. Lütfen sunucunun çalıştığından emin olun.';
      } else if (error.message?.includes('CORS')) {
        errorMessage = 'CORS hatası: Sunucu isteği reddetti. Lütfen yöneticiye başvurun.';
      }
      return { success: false, message: errorMessage };
    }
  };

  const register = async (username: string, email: string, password: string): Promise<boolean> => {
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';
    const registerUrl = `${API_BASE_URL}/auth/register`;
    const timestamp = new Date().toISOString();
    
    console.log('\n📝 REGISTER ATTEMPT');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Timestamp: ${timestamp}`);
    console.log(`API URL: ${registerUrl}`);
    console.log(`Username: ${username}`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${password ? '***' : 'Not provided'}`);
    
    try {
      console.log('📤 Sending register request...');
      const response = await fetch(registerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, email, password }),
      });

      console.log(`📥 Response received:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      const data = await response.json();
      console.log('📦 Response data:', { success: data.success, message: data.message });
      
      if (data.success) {
        console.log('✅ Register successful!');
      } else {
        console.warn('⚠️  Register failed:', data.message);
      }
      console.log('═══════════════════════════════════════════════════════\n');
      
      return data.success;
    } catch (error: any) {
      console.error('\n❌ REGISTER ERROR');
      console.error('═══════════════════════════════════════════════════════');
      console.error('Error type:', error.name || 'Unknown');
      console.error('Error message:', error.message || 'Unknown error');
      console.error('Error stack:', error.stack);
      console.error('═══════════════════════════════════════════════════════\n');
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
