'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

/**
 * Oturum gerektiren sayfalar için. Oturum yoksa giriş sayfasına yönlendirir.
 * `adminOnly` verilirse yönetici olmayanlar ana sayfaya gönderilir
 * (asıl yetki kontrolü her zaman backend'dedir).
 */
export function useRequireAuth({ adminOnly = false }: { adminOnly?: boolean } = {}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    else if (adminOnly && !user.is_admin) router.replace('/');
  }, [user, loading, adminOnly, router, pathname]);

  const ready = !loading && !!user && (!adminOnly || !!user.is_admin);
  return { user, ready };
}

/** Yönlendirme parametresini yalnızca site içi göreli yollarla sınırlar (open-redirect / javascript: XSS önlemi). */
export function safeRedirect(target: string | null | undefined, fallback = '/') {
  if (!target) return fallback;
  if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return fallback;
  return target;
}
