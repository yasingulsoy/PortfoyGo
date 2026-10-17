'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DEV_AUTO_LOGIN_USER, devAutoLoginEnabled, pauseDevAutoLogin } from '@portfoygo/shared/devAutoLogin';
import { ApiError, authApi, session, twoFactorApi } from '@/lib/api';

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  is_admin: boolean;
}

/**
 * - `2fa_required`: yönetici, ama ADMIN_REQUIRE_2FA açık ve hesabında iki adımlı doğrulama kapalı
 *   (yönetim API'si 403 ADMIN_2FA_REQUIRED döner) → kabuk, sitedeki güvenlik ayarlarına yönlendiren ekranı gösterir.
 */
type Status = 'loading' | 'anonymous' | 'forbidden' | '2fa_required' | 'admin';

export interface LoginOutcome {
  success: boolean;
  message?: string;
  /** Şifre doğru, iki adımlı doğrulama gerekli: challenge ile completeLogin2fa */
  requires2fa?: boolean;
  challenge?: string;
}

interface AdminAuthContextType {
  user: AdminUser | null;
  status: Status;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  /** Girişin ikinci adımı: 6 haneli kod ya da kurtarma kodu */
  completeLogin2fa: (challenge: string, input: { code?: string; recovery_code?: string }) => Promise<{ success: boolean; message?: string; code?: string }>;
  /** Yalnızca yerel geliştirme: şifresiz giriş */
  devLogin: (username: string) => Promise<{ success: boolean; message?: string }>;
  /** 2FA zorunluluğunu yeniden kontrol eder (kullanıcı sitede 2FA'yı açtıktan sonra) */
  recheck: () => Promise<void>;
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

  /** Profil yanıtını uygular; yöneticiyse 2FA zorunluluğunu da kontrol eder. */
  const apply = useCallback(async (raw: any): Promise<Status> => {
    const u = normalize(raw);
    setUser(u);
    session.setActive(true);
    let next: Status = u.is_admin ? 'admin' : 'forbidden';
    if (u.is_admin) {
      try {
        const tfa = await twoFactorApi.status();
        if (tfa.admin_required && !tfa.enabled) next = '2fa_required';
      } catch {
        // Durum okunamazsa paneli aç; yönetim uçları zaten backend'de korunur
      }
    }
    session.setActive(next === 'admin');
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    authApi
      .profile()
      .then((res) => {
        if (cancelled) return;
        if (res?.user) void apply(res.user);
        else void devAutoLoginOr(() => !cancelled && setStatus('anonymous'));
      })
      .catch(() => void devAutoLoginOr(() => !cancelled && setStatus('anonymous')));

    /** Yalnızca yerel geliştirme: oturum yoksa demo (yönetici) ile otomatik giriş; olmazsa normal giriş ekranı. */
    async function devAutoLoginOr(fallback: () => unknown) {
      if (devAutoLoginEnabled()) {
        try {
          const res = await authApi.devLogin(DEV_AUTO_LOGIN_USER);
          if (!cancelled && res?.success && res.user) {
            await apply(res.user);
            return;
          }
        } catch {
          // hızlı giriş kapalı (canlı / uzak DB)
        }
      }
      fallback();
    }
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

  const finish = useCallback(
    async (raw: any) => {
      const next = await apply(raw);
      if (next === 'forbidden') return { success: false, message: 'Bu hesabın yönetim paneline erişim yetkisi yok.' };
      return { success: true };
    },
    [apply],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<LoginOutcome> => {
      try {
        const res = await authApi.login(email.trim().toLowerCase(), password);
        if (res?.success && res.requires_2fa && typeof res.challenge === 'string') {
          return { success: false, requires2fa: true, challenge: res.challenge };
        }
        if (!res?.success || !res.user) return { success: false, message: res?.message || 'Giriş başarısız.' };
        return finish(res.user);
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : 'Giriş başarısız.' };
      }
    },
    [finish],
  );

  const completeLogin2fa = useCallback(
    async (challenge: string, input: { code?: string; recovery_code?: string }) => {
      try {
        const res = await twoFactorApi.completeLogin(challenge, input);
        if (!res?.success || !res.user) return { success: false, message: res?.message || 'Doğrulama başarısız.' };
        return finish(res.user);
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Doğrulama başarısız.',
          code: err instanceof ApiError ? (err.code ?? undefined) : undefined,
        };
      }
    },
    [finish],
  );

  const devLogin = useCallback(
    async (username: string) => {
      try {
        const res = await authApi.devLogin(username);
        if (!res?.success || !res.user) return { success: false, message: res?.message || 'Giriş başarısız.' };
        return finish(res.user);
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : 'Giriş başarısız.' };
      }
    },
    [finish],
  );

  const recheck = useCallback(async () => {
    try {
      const res = await authApi.profile();
      if (res?.user) await apply(res.user);
      else setStatus('anonymous');
    } catch {
      setStatus('anonymous');
    }
  }, [apply]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {}
    pauseDevAutoLogin();
    session.setActive(false);
    setUser(null);
    setStatus('anonymous');
    router.replace('/login');
  }, [router]);

  const value = useMemo(
    () => ({ user, status, login, completeLogin2fa, devLogin, recheck, logout }),
    [user, status, login, completeLogin2fa, devLogin, recheck, logout],
  );
  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth, AdminAuthProvider içinde kullanılmalı');
  return ctx;
}

/** Oturum yoksa giriş sayfasına yönlendirir; yönetici değilse `forbidden`, 2FA eksikse `2fa_required` döner. */
export function useRequireAdmin() {
  const { user, status } = useAdminAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anonymous') router.replace(pathname === '/' ? '/login' : `/login?redirect=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  return { user, status, ready: status === 'admin' && !!user };
}
