'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, authApi, session } from '@/lib/api';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  /** İlk açılışta oturum (çerez) backend'e sorulurken true. */
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (username: string, email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  /** Bu tarayıcıdaki oturumu kapatır ve giriş sayfasına yönlendirir. */
  logout: () => void;
  /** Tüm cihazlardaki oturumları iptal eder; başarılıysa giriş sayfasına yönlendirir. */
  logoutAll: () => Promise<{ success: boolean; message?: string }>;
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

  const endSession = useCallback(() => {
    session.setActive(false);
    setUser(null);
    router.replace('/login');
  }, [router]);

  const logout = useCallback(() => {
    // Çerezler httpOnly olduğu için yalnızca backend silebilir; istek başarısız olsa da arayüz çıkış yapar
    void authApi
      .logout()
      .catch(() => undefined)
      .finally(endSession);
  }, [endSession]);

  const logoutAll = useCallback(async () => {
    try {
      await authApi.logoutAll();
      endSession();
      return { success: true };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'İşlem başarısız.' };
    }
  }, [endSession]);

  const refreshUser = useCallback(async () => {
    if (!session.isActive()) return;
    try {
      const res = await authApi.profile();
      if (res?.user) setUser(normalizeUser(res.user));
    } catch (err) {
      // 401 durumunda api katmanı oturumu zaten kapatır
      if (!(err instanceof ApiError) || err.status !== 401) console.error('Profil yenilenemedi', err);
    }
  }, []);

  // İlk yükleme: oturum httpOnly çerezde; varlığını ve geçerliliğini yalnızca backend bilir.
  useEffect(() => {
    let cancelled = false;
    session.clearLegacy();
    authApi
      .profile({ silent401: true })
      .then((res) => {
        if (cancelled || !res?.user) return;
        session.setActive(true);
        setUser(normalizeUser(res.user));
      })
      .catch((err) => {
        if (!(err instanceof ApiError) || err.status !== 401) console.error('Oturum kontrol edilemedi', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const data = await authApi.login(email.trim().toLowerCase(), password);
      if (!data?.success || !data.user) return { success: false, message: data?.message || 'Giriş başarısız.' };
      session.setActive(true);
      setUser(normalizeUser(data.user));
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
    () => ({ user, loading, login, register, logout, logoutAll, refreshUser }),
    [user, loading, login, register, logout, logoutAll, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}
