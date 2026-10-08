'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import AuthLayout from '@/components/auth/AuthLayout';
import PasswordStrength from '@/components/auth/PasswordStrength';
import {
  PASSWORD_MAX,
  USERNAME_MAX,
  validateConfirm,
  validateEmail,
  validateNewPassword,
  validateUsername,
} from '@/components/auth/authUtils';
import Button from '@portfoygo/shared/ui/Button';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { Field } from '@portfoygo/shared/ui/Field';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import { STARTING_BALANCE } from '@/lib/constants';
import { cn, formatNumber } from '@portfoygo/shared/format';

type FormKey = 'username' | 'email' | 'password' | 'confirm' | 'terms';
type Errors = Partial<Record<FormKey, string>>;

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading, register, login } = useAuth();

  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Oturum zaten açıksa kayıt formuna gerek yok (kayıt sonrası otomatik giriş kendi yönlendirmesini yapar)
  useEffect(() => {
    if (!authLoading && user && !submitting) router.replace('/');
  }, [authLoading, user, submitting, router]);

  const update = (key: Exclude<FormKey, 'terms'>, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: undefined }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Errors = {
      username: validateUsername(form.username),
      email: validateEmail(form.email),
      password: validateNewPassword(form.password),
      confirm: validateConfirm(form.password, form.confirm),
      terms: accepted ? undefined : 'Devam etmek için şartları kabul etmelisin',
    };
    setErrors(next);
    setFormError('');
    if (Object.values(next).some(Boolean)) return;

    setSubmitting(true);
    const result = await register(form.username, form.email, form.password);
    if (!result.success) {
      setFormError(result.message || 'Kayıt tamamlanamadı. Lütfen tekrar dene.');
      setSubmitting(false);
      return;
    }

    const session = await login(form.email, form.password);
    router.replace(session.success ? '/verify-email?new=1' : '/login?registered=1');
  };

  if (authLoading || (user && !submitting)) return <PageLoader />;

  return (
    <AuthLayout
      title="Hesabını oluştur"
      description={`Ücretsiz kaydol, ${formatNumber(STARTING_BALANCE, 0)} ₺ sanal bakiyeyle hemen işlem yapmaya başla.`}
      footer={
        <>
          Zaten hesabın var mı?{' '}
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Giriş yap
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}

        <Field
          label="Kullanıcı adı"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={USERNAME_MAX}
          placeholder="ornek_yatirimci"
          value={form.username}
          onChange={(e) => update('username', e.target.value)}
          error={errors.username}
          hint="3–20 karakter; İngilizce harf, rakam ve alt çizgi (_)."
          autoFocus
        />

        <Field
          label="E-posta"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="ornek@eposta.com"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          error={errors.email}
        />

        <div>
          <Field
            label="Şifre"
            type="password"
            name="new-password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            placeholder="En az 8 karakter"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            error={errors.password}
            {...(!errors.password && { 'aria-describedby': 'password-strength' })}
          />
          <PasswordStrength id="password-strength" value={form.password} />
        </div>

        <Field
          label="Şifre (tekrar)"
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          placeholder="Şifreni tekrar gir"
          value={form.confirm}
          onChange={(e) => update('confirm', e.target.value)}
          error={errors.confirm}
        />

        <div>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed text-muted">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => {
                setAccepted(e.target.checked);
                if (errors.terms) setErrors((p) => ({ ...p, terms: undefined }));
              }}
              aria-invalid={!!errors.terms}
              aria-describedby={errors.terms ? 'terms-err' : undefined}
              className={cn('mt-[3px] h-4 w-4 shrink-0 cursor-pointer rounded accent-brand', errors.terms && 'outline outline-1 outline-offset-1 outline-down')}
            />
            <span>
              <Link href="/terms" target="_blank" className="font-medium text-fg underline decoration-line-strong underline-offset-2 hover:decoration-brand">
                Kullanım şartlarını
              </Link>{' '}
              ve{' '}
              <Link href="/privacy" target="_blank" className="font-medium text-fg underline decoration-line-strong underline-offset-2 hover:decoration-brand">
                gizlilik politikasını
              </Link>{' '}
              okudum, kabul ediyorum.
            </span>
          </label>
          {errors.terms && <p id="terms-err" className="mt-1.5 text-xs text-down">{errors.terms}</p>}
        </div>

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {submitting ? 'Hesap oluşturuluyor…' : 'Hesap oluştur'}
        </Button>
      </form>
    </AuthLayout>
  );
}
