'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, authApi, tokenStore, userStore } from '@/lib/api';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (username: string, email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  /** Bakiye, sıralama vb. değerleri backend'den tazeler. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUser(raw: any): User {
  return {
    ...raw,
    balance: Number(raw?.balance ?? 0),
    portfolio_value: Number(raw?.portfolio_value ?? 0),
    total_profit_loss: Number(raw?.total_profit_loss ?? 0),
    rank: raw?.rank == null ? null : Number(raw.rank),
    is_admin: raw?.is_admin === true || raw?.is_admin === 'true',
    email_verified: raw?.email_verified === true || raw?.email_verified === 'true',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    router.replace('/login');
  }, [router]);

  const refreshUser = useCallback(async () => {
    if (!tokenStore.get()) return;
    try {
      const res = await authApi.profile();
      if (res?.user) {
        const fresh = normalizeUser(res.user);
        setUser(fresh);
        userStore.set(fresh);
      }
    } catch (err) {
      // 401 durumunda api katmanı oturumu zaten kapatır
      if (!(err instanceof ApiError) || err.status !== 401) console.error('Profil yenilenemedi', err);
    }
  }, []);

  // İlk yükleme: kayıtlı oturumu geri yükle, süresi dolmuşsa temizle, sonra tazele.
  useEffect(() => {
    const token = tokenStore.get();
    const saved = userStore.get<User>();
    if (token && saved && !tokenStore.isExpired(token)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage yalnızca istemcide okunabilir
      setUser(normalizeUser(saved));
      setLoading(false);
      void refreshUser();
    } else {
      if (token) tokenStore.clear();
      setLoading(false);
    }
  }, [refreshUser]);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const data = await authApi.login(email.trim().toLowerCase(), password);
      if (!data?.success || !data.token) return { success: false, message: data?.message || 'Giriş başarısız.' };
      tokenStore.set(data.token);
      const u = normalizeUser(data.user);
      userStore.set(u);
      setUser(u);
      return { success: true };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Giriş başarısız.' };
    }
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    try {
      const data = await authApi.register(username.trim(), email.trim().toLowerCase(), password);
      return { success: !!data?.success, message: data?.message };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Kayıt başarısız.' };
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser }),
    [user, loading, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}
