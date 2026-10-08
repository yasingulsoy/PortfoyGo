'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircleIcon, EnvelopeIcon, LockClosedIcon, PaperAirplaneIcon } from '@heroicons/react/20/solid';
import { useAuth } from '@/context/AuthContext';
import { emailApi } from '@/lib/api';
import AuthLayout from '@/components/auth/AuthLayout';
import CodeInput from '@/components/auth/CodeInput';
import { CODE_LENGTH, RESEND_COOLDOWN, useCooldown } from '@/components/auth/authUtils';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <VerifyEmail />
    </Suspense>
  );
}

function VerifyEmail() {
  const searchParams = useSearchParams();
  const isNew = searchParams.get('new') === '1';
  const { user, loading, refreshUser } = useAuth();

  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const { remaining, start } = useCooldown();

  if (loading) return <PageLoader />;

  if (!user) {
    return (
      <AuthLayout title="Önce giriş yapmalısın" description="E-posta doğrulaması hesabına bağlıdır. Giriş yaptıktan sonra bu sayfaya geri döneceksin.">
        <div className="flex flex-col items-center rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <LockClosedIcon className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="mt-4 text-sm text-muted">Doğrulama kodunu göndermek ve onaylamak için oturum açık olmalı.</p>
          <LinkButton href={`/login?redirect=${encodeURIComponent('/verify-email')}`} size="lg" className="mt-5 w-full">
            Giriş yap
          </LinkButton>
          <Link href="/register" className="mt-3 text-sm font-medium text-brand hover:underline">
            Hesabın yok mu? Kayıt ol
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (verified || user.email_verified) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-up-soft text-up">
            <CheckCircleIcon className="h-7 w-7" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-fg">
            {verified ? 'E-postan doğrulandı' : 'E-postan zaten doğrulanmış'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            <span className="font-medium text-fg">{user.email}</span> adresi onaylı. Artık liderlik tablosunda yer alabilirsin.
          </p>
          <LinkButton href="/" size="lg" className="mt-7 w-full">
            Piyasalara git
          </LinkButton>
          <LinkButton href="/leaderboard" variant="ghost" className="mt-2 w-full">
            Liderlik tablosunu gör
          </LinkButton>
        </div>
      </AuthLayout>
    );
  }

  const handleSend = async () => {
    setSending(true);
    setError('');
    try {
      await emailApi.sendVerification();
      setSent(true);
      start(RESEND_COOLDOWN);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kod gönderilemedi. Lütfen tekrar dene.');
    } finally {
      setSending(false);
    }
  };

  const verify = async (value: string) => {
    if (verifying) return;
    if (value.length !== CODE_LENGTH) {
      setError(`${CODE_LENGTH} haneli kodu eksiksiz gir.`);
      return;
    }
    setVerifying(true);
    setError('');
    try {
      await emailApi.verify(value);
      await refreshUser();
      setVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Doğrulama başarısız. Lütfen tekrar dene.');
      setVerifying(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void verify(code);
  };

  const sendLabel = remaining > 0 ? `Tekrar gönder (${remaining} sn)` : sent ? 'Tekrar gönder' : 'Kodu gönder';

  return (
    <AuthLayout
      title="E-postanı doğrula"
      description="Hesabını güvenceye almak ve liderlik tablosunda yer almak için e-posta adresini doğrula."
      footer={
        <Link href="/" className="font-medium text-muted hover:text-fg">
          Şimdilik geç, sonra doğrularım
        </Link>
      }
    >
      <div className="space-y-5">
        {isNew && !sent && !error && <Alert tone="success">Hesabın oluşturuldu! Son adım: e-posta adresini doğrula.</Alert>}
        {sent && !error && (
          <Alert tone="info">Kod gönderildi. 15 dakika geçerlidir; gelen kutunu ve spam klasörünü kontrol et.</Alert>
        )}
        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-card">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <EnvelopeIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">Kod gönderilecek adres</p>
            <p className="truncate text-sm font-medium text-fg" title={user.email}>{user.email}</p>
          </div>
          <Button
            variant={sent ? 'secondary' : 'primary'}
            size="sm"
            onClick={handleSend}
            loading={sending}
            disabled={remaining > 0}
            icon={!sending && !sent ? <PaperAirplaneIcon className="h-3.5 w-3.5" /> : undefined}
            className="num shrink-0"
          >
            {sendLabel}
          </Button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <CodeInput
            value={code}
            onChange={(v) => {
              setCode(v);
              if (error) setError('');
            }}
            onComplete={(v) => void verify(v)}
            disabled={verifying}
            hint="E-postandaki 6 haneli kodu gir ya da yapıştır."
          />
          <Button type="submit" size="lg" className="w-full" loading={verifying} disabled={code.length !== CODE_LENGTH}>
            {verifying ? 'Doğrulanıyor…' : 'Doğrula'}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
