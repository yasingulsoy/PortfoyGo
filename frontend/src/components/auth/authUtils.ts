'use client';

import { useCallback, useEffect, useState } from 'react';

/*
 * Kimlik doğrulama formları için istemci tarafı kurallar.
 * Backend'deki zod şemalarıyla (backend/src/utils/validation.ts) birebir aynı tutulmalıdır.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const CODE_LENGTH = 6;
/** Kod yeniden gönderme bekleme süresi (sn) */
export const RESEND_COOLDOWN = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validateEmail(value: string): string | undefined {
  const v = normalizeEmail(value);
  if (!v) return 'E-posta adresi gerekli';
  if (v.length > 254) return 'E-posta adresi çok uzun';
  if (!EMAIL_RE.test(v)) return 'Geçerli bir e-posta adresi girin';
}

export function validateUsername(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Kullanıcı adı gerekli';
  if (v.length < USERNAME_MIN) return `Kullanıcı adı en az ${USERNAME_MIN} karakter olmalı`;
  if (v.length > USERNAME_MAX) return `Kullanıcı adı en fazla ${USERNAME_MAX} karakter olabilir`;
  if (!USERNAME_RE.test(v)) return 'Yalnızca İngilizce harf, rakam ve alt çizgi (_) kullanılabilir';
}

/** Yeni şifre (kayıt / sıfırlama) kuralı */
export function validateNewPassword(value: string): string | undefined {
  if (!value) return 'Şifre gerekli';
  if (value.length < PASSWORD_MIN) return `Şifre en az ${PASSWORD_MIN} karakter olmalı`;
  if (value.length > PASSWORD_MAX) return `Şifre en fazla ${PASSWORD_MAX} karakter olabilir`;
}

export function validateConfirm(password: string, confirm: string): string | undefined {
  if (!confirm) return 'Şifreyi tekrar girin';
  if (password !== confirm) return 'Şifreler eşleşmiyor';
}

export interface PasswordCheck {
  key: 'length' | 'letter' | 'digit' | 'symbol';
  label: string;
  ok: boolean;
}

export function passwordChecks(value: string): PasswordCheck[] {
  return [
    { key: 'length', label: `En az ${PASSWORD_MIN} karakter`, ok: value.length >= PASSWORD_MIN },
    { key: 'letter', label: 'Harf', ok: /\p{L}/u.test(value) },
    { key: 'digit', label: 'Rakam', ok: /\d/.test(value) },
    { key: 'symbol', label: 'Sembol', ok: /[^\p{L}\d\s]/u.test(value) },
  ];
}

/** Geri sayım: `start(sn)` ile başlar, `remaining` saniye cinsinden kalan süreyi verir. */
export function useCooldown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!until) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, [until]);

  const start = useCallback((seconds: number) => {
    const t = Date.now();
    setNow(t);
    setUntil(t + seconds * 1000);
  }, []);

  const remaining = until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
  return { remaining, start };
}
