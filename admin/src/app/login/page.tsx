'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheckIcon } from '@heroicons/react/20/solid';
import AuthSplitLayout from '@portfoygo/shared/ui/AuthSplitLayout';
import Button from '@portfoygo/shared/ui/Button';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { Field } from '@portfoygo/shared/ui/Field';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import { safeRedirect } from '@portfoygo/shared/url';
import DevQuickLogin from '@portfoygo/shared/ui/DevQuickLogin';
import { useAdminAuth } from '@/lib/auth';
import { APP_URL } from '@/lib/api';

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { status, login, devLogin } = useAdminAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get('redirect'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Zaten yönetici oturumu varsa panele geç
  useEffect(() => {
    if (status === 'admin') router.replace(redirectTo);
  }, [status, router, redirectTo]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('E-posta ve şifre gerekli.');
      return;
    }
    setSubmitting(true);
    setError('');
    const res = await login(email, password);
    setSubmitting(false);
    if (res.success) router.replace(redirectTo);
    else setError(res.message || 'Giriş başarısız.');
  };

  return (
    <AuthSplitLayout
      title="Yönetici girişi"
      description="Yalnızca yönetici yetkisi olan hesaplar yönetim paneline erişebilir."
      backHref={APP_URL}
      backExternal
      backLabel="Siteye dön"
      tagline="Kullanıcıları, piyasa önbelleğini ve sezonları tek yerden yönet."
      panelBadge={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-fg/10 px-3 py-1 text-sm font-medium text-brand-fg">
          <ShieldCheckIcon className="h-4 w-4" aria-hidden="true" /> Yönetim paneli
        </span>
      }
      legal={<span>© {new Date().getFullYear()} PortfoyGo · Yönetim paneli</span>}
    >
      {status === 'forbidden' && !error && (
        <Alert tone="error" className="mb-5">
          Oturum açık olan hesabın yönetici yetkisi yok. Yönetici hesabıyla giriş yapın.
        </Alert>
      )}

      <DevQuickLogin
        adminOnly
        onLogin={async (username) => {
          const res = await devLogin(username);
          if (res.success) router.replace(redirectTo);
          return res;
        }}
      />

      <form onSubmit={submit} noValidate className="mt-5 space-y-5">
        <Field label="E-posta" type="email" autoComplete="username" inputMode="email" placeholder="yonetici@eposta.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        <Field label="Şifre" type="password" autoComplete="current-password" placeholder="Şifren" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {submitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </Button>
      </form>
    </AuthSplitLayout>
  );
}
