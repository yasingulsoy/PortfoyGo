'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authApi, session } from '@/lib/api';

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  is_admin: boolean;
}

type Status = 'loading' | 'anonymous' | 'forbidden' | 'admin';

interface AdminAuthContextType {
  user: AdminUser | null;
  status: Status;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

function normalize(raw: any): AdminUser {
  return {
    id: String(raw?.id ?? ''),
    username: String(raw?.username ?? ''),
    email: String(raw?.email ?? ''),
    is_admin: raw?.is_admin === true || raw?.is_admin === 'true',
  };
}

/**
 * Yönetim paneli oturumu. Kullanıcı uygulamasıyla aynı backend oturum çerezini kullanır;
 * yalnızca `is_admin` olan hesaplar paneli görebilir (asıl kontrol backend'de).
 */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const router = useRouter();

  const apply = useCallback((raw: any) => {
    const u = normalize(raw);
    setUser(u);
    setStatus(u.is_admin ? 'admin' : 'forbidden');
    session.setActive(u.is_admin);
    return u;
  }, []);

  useEffect(() => {
    let cancelled = false;
    authApi
      .profile()
      .then((res) => {
        if (cancelled) return;
        if (res?.user) apply(res.user);
        else setStatus('anonymous');
      })
      .catch(() => !cancelled && setStatus('anonymous'));
    return () => {
      cancelled = true;
    };
  }, [apply]);

  useEffect(() => {
    const onLogout = () => {
      setUser(null);
      setStatus('anonymous');
    };
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await authApi.login(email.trim().toLowerCase(), password);
        if (!res?.success || !res.user) return { success: false, message: res?.message || 'Giriş başarısız.' };
        const u = apply(res.user);
        if (!u.is_admin) return { success: false, message: 'Bu hesabın yönetim paneline erişim yetkisi yok.' };
        return { success: true };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : 'Giriş başarısız.' };
      }
    },
    [apply],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {}
    session.setActive(false);
    setUser(null);
    setStatus('anonymous');
    router.replace('/login');
  }, [router]);

  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout]);
  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth, AdminAuthProvider içinde kullanılmalı');
  return ctx;
}

/** Oturum yoksa giriş sayfasına yönlendirir; yönetici değilse `forbidden` döner. */
export function useRequireAdmin() {
  const { user, status } = useAdminAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anonymous') router.replace(pathname === '/' ? '/login' : `/login?redirect=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  return { user, status, ready: status === 'admin' && !!user };
}
