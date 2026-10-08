'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheckIcon } from '@heroicons/react/20/solid';
import Logo from '@portfoygo/shared/ui/Logo';
import ThemeToggle from '@portfoygo/shared/ui/ThemeToggle';
import Button from '@portfoygo/shared/ui/Button';
import { Card } from '@portfoygo/shared/ui/Card';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { Field } from '@portfoygo/shared/ui/Field';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import { safeRedirect } from '@portfoygo/shared/url';
import DevQuickLogin from '@portfoygo/shared/ui/DevQuickLogin';
import { useAdminAuth } from '@/lib/auth';

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
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
            <ShieldCheckIcon className="h-3.5 w-3.5" /> Yönetim paneli
          </span>
        </div>
        <Card className="p-6">
          <h1 className="text-lg font-semibold tracking-tight">Yönetici girişi</h1>
          <p className="mt-1 text-sm text-muted">Yalnızca yönetici yetkisi olan hesaplar erişebilir.</p>

          {status === 'forbidden' && !error && (
            <Alert tone="error" className="mt-4">
              Oturum açık olan hesabın yönetici yetkisi yok. Yönetici hesabıyla giriş yapın.
            </Alert>
          )}

          <div className="mt-5">
            <DevQuickLogin
              adminOnly
              onLogin={async (username) => {
                const res = await devLogin(username);
                if (res.success) router.replace(redirectTo);
                return res;
              }}
            />
          </div>

          <form onSubmit={submit} noValidate className="mt-5 space-y-4">
            <Field label="E-posta" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field label="Şifre" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" size="lg" className="w-full" loading={submitting}>
              Giriş yap
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
