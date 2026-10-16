'use client';

import { useState, type FormEvent } from 'react';
import { ArrowLeftIcon, ShieldCheckIcon } from '@heroicons/react/20/solid';
import Button from './Button';
import { Alert } from './Feedback';
import { Field } from './Field';

export interface TwoFactorStepResult {
  success: boolean;
  message?: string;
  /** Backend hata kodu: CHALLENGE_INVALID → kullanıcı baştan giriş yapmalı */
  code?: string;
}

interface TwoFactorStepProps {
  /** 6 haneli kod ya da kurtarma kodu ile girişi tamamlar */
  onSubmit: (input: { code?: string; recovery_code?: string }) => Promise<TwoFactorStepResult>;
  /** E-posta / şifre adımına dön */
  onBack: () => void;
}

const RECOVERY_RE = /^[A-HJ-NP-Z2-9]{10}$/;

/**
 * Girişin ikinci adımı ("Doğrulama kodu"): doğrulama uygulamasındaki 6 haneli kod ya da tek kullanımlık
 * kurtarma kodu. 6. hane girilince kendiliğinden gönderilir. Site ve yönetim paneli giriş sayfaları ortak kullanır.
 */
export default function TwoFactorStep({ onSubmit, onBack }: TwoFactorStepProps) {
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [expired, setExpired] = useState(false);

  const submit = async (raw: string) => {
    if (submitting) return;
    const compact = raw.replace(/[\s-]/g, '').toUpperCase();
    if (mode === 'totp' && !/^\d{6}$/.test(compact)) {
      setFieldError('Uygulamadaki 6 haneli kodu gir.');
      return;
    }
    if (mode === 'recovery' && !RECOVERY_RE.test(compact)) {
      setFieldError('Kurtarma kodu XXXXX-XXXXX biçiminde 10 karakterdir.');
      return;
    }
    setFieldError(undefined);
    setError('');
    setSubmitting(true);
    const res = await onSubmit(mode === 'totp' ? { code: compact } : { recovery_code: compact });
    if (res.success) return; // sayfa yönlendirir
    setSubmitting(false);
    if (res.code === 'CHALLENGE_INVALID') setExpired(true);
    setError(res.message || 'Doğrulama başarısız.');
    setValue('');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(value);
  };

  const switchMode = () => {
    setMode((m) => (m === 'totp' ? 'recovery' : 'totp'));
    setValue('');
    setError('');
    setFieldError(undefined);
  };

  if (expired) {
    return (
      <div className="space-y-5">
        <Alert tone="error">{error || 'Doğrulama süresi doldu. Lütfen yeniden giriş yap.'}</Alert>
        <Button size="lg" className="w-full" onClick={onBack} icon={<ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />}>
          Yeniden giriş yap
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5 text-sm text-muted">
        <ShieldCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <p>
          {mode === 'totp'
            ? 'Hesabında iki adımlı doğrulama açık. Doğrulama uygulamandaki (Google Authenticator, Microsoft Authenticator, 1Password …) 6 haneli kodu gir.'
            : 'Telefonuna erişemiyorsan iki adımlı doğrulamayı açarken kaydettiğin kurtarma kodlarından birini gir. Her kod yalnızca bir kez kullanılabilir.'}
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {mode === 'totp' ? (
        <Field
          key="totp"
          label="Doğrulama kodu"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={7}
          placeholder="123456"
          className="[&_input]:tabular-nums [&_input]:text-center [&_input]:text-lg [&_input]:tracking-[0.4em]"
          value={value}
          onChange={(e) => {
            const next = e.target.value.replace(/[^\d]/g, '').slice(0, 6);
            setValue(next);
            if (fieldError) setFieldError(undefined);
            if (next.length === 6 && !submitting) void submit(next);
          }}
          error={fieldError}
          autoFocus
        />
      ) : (
        <Field
          key="recovery"
          label="Kurtarma kodu"
          name="recovery_code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={16}
          placeholder="XXXXX-XXXXX"
          className="[&_input]:tabular-nums [&_input]:text-center [&_input]:uppercase [&_input]:tracking-widest"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (fieldError) setFieldError(undefined);
          }}
          error={fieldError}
          autoFocus
        />
      )}

      <Button type="submit" size="lg" className="w-full" loading={submitting}>
        {submitting ? 'Doğrulanıyor…' : 'Doğrula ve giriş yap'}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-muted hover:text-fg">
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" /> Geri dön
        </button>
        <button type="button" onClick={switchMode} className="font-medium text-brand hover:text-brand-hover">
          {mode === 'totp' ? 'Kurtarma kodu kullan' : 'Doğrulama kodu kullan'}
        </button>
      </div>
    </form>
  );
}
