'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EnvelopeIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/context/AuthContext';

function VerifyEmailContent() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    } else if (user?.email) {
      setEmail(user.email);
    } else {
      router.push('/login');
    }
  }, [searchParams, user, router]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length !== 6) {
      setError('6 haneli doğrulama kodunu girin');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';
      const response = await fetch(`${API_BASE_URL}/email/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, code }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/');
        }, 2000);
      } else {
        setError(data.message || 'Doğrulama başarısız');
      }
    } catch (error) {
      setError('Sunucuya bağlanılamadı');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setResendLoading(true);
    setError('');

    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';
      const response = await fetch(`${API_BASE_URL}/email/send-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.success) {
        setResendCooldown(60); // 60 saniye cooldown
        setError('');
      } else {
        setError(data.message || 'Kod gönderilemedi');
      }
    } catch (error) {
      setError('Sunucuya bağlanılamadı');
    } finally {
      setResendLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#181a20] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full text-center">
          <div className="mx-auto h-16 w-16 bg-[#0ecb81]/10 rounded-full flex items-center justify-center mb-4 border-2 border-[#0ecb81]">
            <CheckCircleIcon className="h-8 w-8 text-[#0ecb81]" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">
            Email Doğrulandı!
          </h2>
          <p className="text-[#848e9c] mb-6">
            Hesabınız başarıyla aktifleştirildi. Ana sayfaya yönlendiriliyorsunuz...
          </p>
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#0ecb81] mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#181a20] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        {/* Logo ve Başlık */}
        <div className="text-center mb-8">
          <div className="mx-auto h-16 w-16 bg-[#0ecb81]/10 rounded-full flex items-center justify-center mb-4 border-2 border-[#0ecb81]">
            <EnvelopeIcon className="h-8 w-8 text-[#0ecb81]" />
          </div>
          <h2 className="text-3xl font-bold text-white">
            Email Doğrulama
          </h2>
          <p className="mt-2 text-sm text-[#848e9c]">
            <strong className="text-white">{email}</strong> adresine gönderilen 6 haneli kodu girin
          </p>
        </div>

        {/* Doğrulama Formu */}
        <div className="bg-[#1e2329] rounded-xl border border-[#2b3139] py-8 px-6">
          <form className="space-y-6" onSubmit={handleVerify}>
            <div>
              <label htmlFor="code" className="block text-sm font-semibold text-white mb-3">
                Doğrulama Kodu
              </label>
              <input
                id="code"
                name="code"
                type="text"
                maxLength={6}
                required
                className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border border-[#2b3139] rounded-xl focus:ring-2 focus:ring-[#0ecb81] focus:border-[#0ecb81] bg-[#161a1e] text-white transition-colors"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
              <p className="mt-2 text-xs text-[#848e9c] text-center">
                6 haneli sayısal kod
              </p>
            </div>

            {error && (
              <div className="bg-[#f6465d]/10 border border-[#f6465d]/30 text-[#f6465d] px-4 py-3 rounded-xl text-sm flex items-center">
                <XCircleIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full flex justify-center py-4 px-4 rounded-xl text-base font-semibold text-white bg-[#0ecb81] hover:bg-[#0bb975] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0ecb81] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Doğrulanıyor...
                </div>
              ) : (
                'Email Doğrula'
              )}
            </button>
          </form>

          {/* Yeniden Gönder */}
          <div className="mt-6 pt-6 border-t border-[#2b3139]">
            <p className="text-sm text-[#848e9c] text-center mb-4">
              Kodu almadınız mı?
            </p>
            <button
              onClick={handleResend}
              disabled={resendLoading || resendCooldown > 0}
              className="w-full flex justify-center py-3 px-4 border border-[#2b3139] rounded-xl text-sm font-semibold text-white bg-[#2b3139] hover:bg-[#3a4149] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0ecb81] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {resendLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Gönderiliyor...
                </div>
              ) : resendCooldown > 0 ? (
                `Yeniden gönder (${resendCooldown}s)`
              ) : (
                'Kodu Yeniden Gönder'
              )}
            </button>
          </div>
        </div>

        {/* Alt Bilgi */}
        <div className="mt-8 text-center">
          <p className="text-xs text-[#848e9c]">
            Doğrulama kodu 15 dakika geçerlidir. Spam klasörünüzü kontrol etmeyi unutmayın.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#181a20] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0ecb81]"></div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
