'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { safeRedirect } from '@/hooks/useRequireAuth';
import AuthLayout from '@/components/auth/AuthLayout';
import DevQuickLogin from '@portfoygo/shared/ui/DevQuickLogin';
import { PASSWORD_MAX, validateEmail } from '@/components/auth/authUtils';
import Button from '@portfoygo/shared/ui/Button';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { Field } from '@portfoygo/shared/ui/Field';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';

/** Yalnızca sabit metinler gösterilir; URL'den gelen serbest metin asla basılmaz. */
const NOTICES: Record<string, string> = {
  registered: 'Hesabın oluşturuldu. Şimdi giriş yapabilirsin.',
  verified: 'E-posta adresin doğrulandı. Giriş yaparak devam edebilirsin.',
  reset: 'Şifren güncellendi. Yeni şifrenle giriş yapabilirsin.',
};

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, login, devLogin } = useAuth();
  const redirectTo = safeRedirect(searchParams.get('redirect'));
  const notice = Object.keys(NOTICES).find((key) => searchParams.get(key) === '1');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Zaten oturum açıksa doğrudan hedefe gönder (form gönderimi kendi yönlendirmesini yapar)
  useEffect(() => {
    if (!authLoading && user && !submitting) router.replace(redirectTo);
  }, [authLoading, user, submitting, redirectTo, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next = {
      email: validateEmail(email),
      password: !password ? 'Şifre gerekli' : password.length > PASSWORD_MAX ? `Şifre en fazla ${PASSWORD_MAX} karakter olabilir` : undefined,
    };
    setErrors(next);
    setFormError('');
    if (next.email || next.password) return;

    setSubmitting(true);
    const result = await login(email, password);
    if (result.success) {
      router.replace(redirectTo);
      return;
    }
    setFormError(result.message || 'E-posta veya şifre hatalı.');
    setSubmitting(false);
  };

  if (authLoading || (user && !submitting)) return <PageLoader label={user ? 'Yönlendiriliyorsun…' : 'Yükleniyor…'} />;

  return (
    <AuthLayout
      title="Tekrar hoş geldin"
      description="Portföyüne ve piyasalara erişmek için hesabına giriş yap."
      footer={
        <>
          Hesabın yok mu?{' '}
          <Link href="/register" className="font-semibold text-brand hover:underline">
            Ücretsiz kayıt ol
          </Link>
        </>
      }
    >
      <DevQuickLogin
        onLogin={async (username) => {
          setSubmitting(true);
          const res = await devLogin(username);
          if (res.success) router.replace(redirectTo);
          else setSubmitting(false);
          return res;
        }}
      />
      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
        {notice && !formError && <Alert tone="success">{NOTICES[notice]}</Alert>}
        {formError && <Alert tone="error">{formError}</Alert>}

        <Field
          label="E-posta"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="ornek@eposta.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
          }}
          error={errors.email}
          autoFocus
        />

        <div>
          <Field
            label="Şifre"
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="Şifren"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
            }}
            error={errors.password}
          />
          <div className="mt-2 flex justify-end">
            <Link href="/forgot-password" className="text-xs font-medium text-brand hover:underline">
              Şifremi unuttum
            </Link>
          </div>
        </div>

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {submitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </Button>
      </form>
    </AuthLayout>
  );
}
