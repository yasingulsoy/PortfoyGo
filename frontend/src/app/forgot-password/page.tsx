'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, CheckCircleIcon } from '@heroicons/react/20/solid';
import { emailApi } from '@/lib/api';
import AuthLayout from '@/components/auth/AuthLayout';
import CodeInput from '@/components/auth/CodeInput';
import PasswordStrength from '@/components/auth/PasswordStrength';
import {
  CODE_LENGTH,
  PASSWORD_MAX,
  RESEND_COOLDOWN,
  normalizeEmail,
  useCooldown,
  validateConfirm,
  validateEmail,
  validateNewPassword,
} from '@/components/auth/authUtils';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { Field } from '@portfoygo/shared/ui/Field';

type Step = 'request' | 'reset' | 'done';

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const { remaining, start } = useCooldown();

  if (step === 'done') {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-up-soft text-up">
            <CheckCircleIcon className="h-7 w-7" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-fg">Şifren güncellendi</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">Artık yeni şifrenle giriş yapabilirsin. Güvenliğin için diğer cihazlardaki oturumlarını da kontrol et.</p>
          <LinkButton href="/login?reset=1" size="lg" className="mt-7 w-full">
            Giriş yap
          </LinkButton>
        </div>
      </AuthLayout>
    );
  }

  if (step === 'reset') {
    return (
      <ResetStep
        email={email}
        cooldown={remaining}
        onResent={() => start(RESEND_COOLDOWN)}
        onBack={() => setStep('request')}
        onDone={() => setStep('done')}
      />
    );
  }

  return (
    <RequestStep
      email={email}
      onEmailChange={setEmail}
      cooldown={remaining}
      onSent={() => {
        start(RESEND_COOLDOWN);
        setStep('reset');
      }}
    />
  );
}

/* ------------------------------------------------------------------ */

function RequestStep({ email, onEmailChange, cooldown, onSent }: { email: string; onEmailChange: (v: string) => void; cooldown: number; onSent: () => void }) {
  const [fieldError, setFieldError] = useState<string>();
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validateEmail(email);
    setFieldError(err);
    setFormError('');
    if (err) return;

    setSubmitting(true);
    try {
      await emailApi.sendReset(normalizeEmail(email));
      onSent();
    } catch (error) {
      setFormError(errorMessage(error, 'Kod gönderilemedi. Lütfen tekrar dene.'));
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Şifreni sıfırla"
      description="Hesabına kayıtlı e-posta adresini gir; şifreni yenilemen için 6 haneli bir kod gönderelim."
      footer={<BackToLogin />}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
            onEmailChange(e.target.value);
            if (fieldError) setFieldError(undefined);
          }}
          error={fieldError}
          autoFocus
        />
        <Button type="submit" size="lg" className="num w-full" loading={submitting} disabled={cooldown > 0}>
          {submitting ? 'Gönderiliyor…' : cooldown > 0 ? `Tekrar göndermek için ${cooldown} sn` : 'Sıfırlama kodu gönder'}
        </Button>
      </form>
    </AuthLayout>
  );
}

/* ------------------------------------------------------------------ */

interface ResetStepProps {
  email: string;
  cooldown: number;
  onResent: () => void;
  onBack: () => void;
  onDone: () => void;
}

function ResetStep({ email, cooldown, onResent, onBack, onDone }: ResetStepProps) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ code?: string; password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const normalized = normalizeEmail(email);

  const handleResend = async () => {
    setResending(true);
    setFormError('');
    try {
      await emailApi.sendReset(normalized);
      setNotice(true);
      onResent();
    } catch (error) {
      setFormError(errorMessage(error, 'Kod gönderilemedi. Lütfen tekrar dene.'));
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next = {
      code: code.length === CODE_LENGTH ? undefined : `${CODE_LENGTH} haneli kodu eksiksiz gir`,
      password: validateNewPassword(password),
      confirm: validateConfirm(password, confirm),
    };
    setErrors(next);
    setFormError('');
    if (next.code || next.password || next.confirm) return;

    setSubmitting(true);
    try {
      await emailApi.resetPassword(normalized, code, password);
      onDone();
    } catch (error) {
      setNotice(false);
      setFormError(errorMessage(error, 'Şifre güncellenemedi. Kodu kontrol edip tekrar dene.'));
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Yeni şifre belirle"
      description={
        <>
          <span className="font-medium text-fg">{normalized}</span> adresine gönderilen kodu ve yeni şifreni gir.{' '}
          <button type="button" onClick={onBack} className="font-medium text-brand hover:underline">
            Adresi değiştir
          </button>
        </>
      }
      footer={<BackToLogin />}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {formError ? (
          <Alert tone="error">{formError}</Alert>
        ) : (
          notice && <Alert tone="info">Bu adres kayıtlıysa sıfırlama kodu gönderildi. Kod 30 dakika geçerlidir; spam klasörünü de kontrol et.</Alert>
        )}

        <div>
          <CodeInput
            value={code}
            onChange={(v) => {
              setCode(v);
              if (errors.code) setErrors((p) => ({ ...p, code: undefined }));
            }}
            label="Sıfırlama kodu"
            error={errors.code}
            disabled={submitting}
            autoFocus
          />
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-subtle">Kod gelmedi mi?</span>
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || resending}
              className="num font-medium text-brand hover:underline disabled:cursor-not-allowed disabled:text-subtle disabled:no-underline"
            >
              {resending ? 'Gönderiliyor…' : cooldown > 0 ? `Tekrar gönder (${cooldown} sn)` : 'Tekrar gönder'}
            </button>
          </div>
        </div>

        <div>
          <Field
            label="Yeni şifre"
            type="password"
            name="new-password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            placeholder="En az 8 karakter"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
            }}
            error={errors.password}
            {...(!errors.password && { 'aria-describedby': 'reset-password-strength' })}
          />
          <PasswordStrength id="reset-password-strength" value={password} />
        </div>

        <Field
          label="Yeni şifre (tekrar)"
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          placeholder="Yeni şifreni tekrar gir"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (errors.confirm) setErrors((p) => ({ ...p, confirm: undefined }));
          }}
          error={errors.confirm}
        />

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {submitting ? 'Güncelleniyor…' : 'Şifreyi güncelle'}
        </Button>
      </form>
    </AuthLayout>
  );
}

function BackToLogin() {
  return (
    <Link href="/login" className="inline-flex items-center gap-1.5 font-medium text-muted hover:text-fg">
      <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
      Giriş sayfasına dön
    </Link>
  );
}
