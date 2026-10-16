'use client';

import { useState } from 'react';
import { ArrowPathIcon, ArrowTopRightOnSquareIcon, LockClosedIcon } from '@heroicons/react/20/solid';
import Logo from '@portfoygo/shared/ui/Logo';
import ThemeToggle from '@portfoygo/shared/ui/ThemeToggle';
import Button from '@portfoygo/shared/ui/Button';
import { Card } from '@portfoygo/shared/ui/Card';
import { useAdminAuth } from '@/lib/auth';
import { SECURITY_SETTINGS_URL } from '@/lib/api';

/**
 * ADMIN_REQUIRE_2FA açıkken iki adımlı doğrulaması kapalı yöneticiye gösterilen ekran
 * (backend yönetim uçları 403 ADMIN_2FA_REQUIRED döner). 2FA sitede Profil → Güvenlik kartından açılır.
 */
export default function TwoFactorRequired() {
  const { user, recheck, logout } = useAdminAuth();
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    await recheck();
    setChecking(false);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 sm:px-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-lg p-6 sm:p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <LockClosedIcon className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-xl font-semibold text-fg">İki adımlı doğrulama gerekli</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Yönetim paneline erişmek için yönetici hesaplarında iki adımlı doğrulama (TOTP) açık olmalıdır
            {user?.username ? (
              <>
                {' '}— <span className="font-medium text-fg">{user.username}</span> hesabında henüz kapalı
              </>
            ) : null}
            .
          </p>
          <ol className="mt-5 list-decimal space-y-1.5 pl-5 text-sm text-muted marker:text-subtle">
            <li>Sitede Profil → Güvenlik bölümünü aç.</li>
            <li>&quot;İki adımlı doğrulama&quot; satırında Etkinleştir&apos;e tıkla, QR kodunu doğrulama uygulamanla tara.</li>
            <li>Kurtarma kodlarını kaydet, sonra bu sayfaya dönüp &quot;Yeniden kontrol et&quot;e tıkla.</li>
          </ol>
          <p className="mt-4 text-xs text-subtle">
            Not: 2FA açılınca diğer cihazlardaki oturumların kapanır; panele yeniden giriş yapman gerekebilir.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href={SECURITY_SETTINGS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand sm:w-auto sm:flex-1 px-4 text-sm font-medium text-brand-fg shadow-card transition-colors hover:bg-brand-hover"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
              Güvenlik ayarlarına git
            </a>
            <Button variant="secondary" className="w-full sm:w-auto sm:flex-1" loading={checking} icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => void check()}>
              Yeniden kontrol et
            </Button>
          </div>
          <button type="button" onClick={() => void logout()} className="mt-4 text-sm text-muted hover:text-fg">
            Başka hesapla giriş yap
          </button>
        </Card>
      </main>
    </div>
  );
}
