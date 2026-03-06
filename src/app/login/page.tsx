'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { EyeIcon, EyeSlashIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/context/AuthContext';

function LoginForm() {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockTime, setBlockTime] = useState(0);
  const [successMessage, setSuccessMessage] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, login, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      setTimeout(() => {
        const redirectTo = searchParams.get('redirect') || '/';
        window.location.href = redirectTo;
      }, 1000);
    }
  }, [user, router, searchParams, authLoading]);

  useEffect(() => {
    const message = searchParams.get('message');
    if (message) {
      setSuccessMessage(decodeURIComponent(message));
      setTimeout(() => setSuccessMessage(''), 5000);
    }
  }, [searchParams]);

  useEffect(() => {
    if (isBlocked && blockTime > 0) {
      const timer = setInterval(() => {
        setBlockTime(prev => {
          if (prev <= 1) {
            setIsBlocked(false);
            setAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isBlocked, blockTime]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const validateInput = () => {
    if (!formData.email || !formData.password) {
      setError('Tüm alanları doldurun');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Geçerli bir email adresi girin');
      return false;
    }
    if (formData.password.length < 6) {
      setError('Şifre en az 6 karakter olmalı');
      return false;
    }
    return true;
  };

  const checkRateLimit = () => {
    if (attempts >= 5) {
      setIsBlocked(true);
      setBlockTime(300);
      setError('Çok fazla başarısız deneme. 5 dakika bekleyin.');
      return false;
    }
    return true;
  };

  const sanitizeInput = (input: string) => {
    return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isBlocked) {
      setError(`Çok fazla başarısız deneme. ${blockTime} saniye bekleyin.`);
      return;
    }
    if (!checkRateLimit()) return;
    if (!validateInput()) return;

    setLoading(true);
    setError('');

    const sanitizedData = {
      email: sanitizeInput(formData.email.trim().toLowerCase()),
      password: formData.password
    };

    try {
      const result = await login(sanitizedData.email, sanitizedData.password);

      if (result.success) {
        setAttempts(0);
        setSuccessMessage('Giriş başarılı! Yönlendiriliyorsunuz...');
        const redirectTo = searchParams.get('redirect') || '/';
        setTimeout(() => {
          window.location.href = redirectTo;
        }, 1000);
      } else {
        setAttempts(prev => prev + 1);
        const errorMsg = result.message || 'Giriş başarısız. Email veya şifre hatalı.';
        if (attempts >= 2) {
          setError(`${errorMsg} (${attempts + 1}/5 deneme)`);
        } else {
          setError(errorMsg);
        }
      }
    } catch (error) {
      setAttempts(prev => prev + 1);
      setError('Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.');
      console.error('Login catch error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0b0e11] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-2 border-[#0ecb81] border-t-transparent"></div>
          <p className="mt-4 text-[#848e9c] text-sm">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0e11] flex">
      {/* Sol panel - dekoratif */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0ecb81]/20 via-[#0b0e11] to-[#0ecb81]/5"></div>
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-[#0ecb81]/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-10 w-72 h-72 bg-[#0ecb81]/5 rounded-full blur-3xl"></div>

        <div className="relative z-10 max-w-md px-12 text-center">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#0ecb81]/10 border border-[#0ecb81]/20 mb-6">
              <svg className="w-10 h-10 text-[#0ecb81]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">PortfoyGo</h1>
            <p className="text-[#848e9c] text-lg leading-relaxed">
              Sanal portföyünüzü oluşturun, kripto dünyasını keşfedin ve risk almadan yatırım stratejilerinizi test edin.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-12">
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/5">
              <p className="text-[#0ecb81] text-2xl font-bold">100K</p>
              <p className="text-[#848e9c] text-xs mt-1">Sanal Bakiye</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/5">
              <p className="text-[#0ecb81] text-2xl font-bold">50+</p>
              <p className="text-[#848e9c] text-xs mt-1">Kripto Para</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/5">
              <p className="text-[#0ecb81] text-2xl font-bold">7/24</p>
              <p className="text-[#848e9c] text-xs mt-1">Canlı Fiyat</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sağ panel - form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          {/* Logo (mobil) */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-3xl font-bold text-white tracking-tight">PortfoyGo</h1>
          </div>

          {/* Başlık */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Giriş Yap</h2>
            <p className="text-[#848e9c] text-sm">
              Hesabınıza giriş yapın ve yatırım yolculuğunuza devam edin
            </p>
          </div>

          {/* Başarı Mesajı */}
          {successMessage && (
            <div className="mb-5 bg-[#0ecb81]/10 border border-[#0ecb81]/20 text-[#0ecb81] px-4 py-3 rounded-lg text-sm text-center backdrop-blur-sm">
              {successMessage}
            </div>
          )}

          {/* Güvenlik Uyarısı */}
          {attempts > 0 && attempts < 5 && (
            <div className="mb-5 bg-[#f0b90b]/10 border border-[#f0b90b]/20 text-[#f0b90b] px-4 py-3 rounded-lg text-sm">
              <div className="flex items-center justify-center gap-2">
                <ShieldCheckIcon className="h-4 w-4 shrink-0" />
                <span>Güvenlik: {attempts}/5 deneme hakkınız kaldı</span>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#eaecef] mb-2">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full px-4 py-3.5 rounded-lg bg-transparent border border-white/10 text-white placeholder-[#5e6673] focus:border-[#0ecb81] focus:outline-none transition-colors duration-200"
                placeholder="ornek@email.com"
                value={formData.email}
                onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#eaecef] mb-2">
                Şifre
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="w-full px-4 py-3.5 pr-12 rounded-lg bg-transparent border border-white/10 text-white placeholder-[#5e6673] focus:border-[#0ecb81] focus:outline-none transition-colors duration-200"
                  placeholder="Şifrenizi girin"
                  value={formData.password}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-[#5e6673] hover:text-white transition-colors" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-[#5e6673] hover:text-white transition-colors" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-[#f6465d]/10 border border-[#f6465d]/20 text-[#f6465d] px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || isBlocked}
              className="w-full py-3.5 rounded-lg text-base font-semibold bg-[#0ecb81] text-[#0b0e11] border border-[#0ecb81] hover:bg-transparent hover:text-[#0ecb81] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#0ecb81] disabled:hover:text-[#0b0e11] transition-all duration-300 cursor-pointer"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="animate-spin inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full"></span>
                  Giriş yapılıyor...
                </span>
              ) : isBlocked ? (
                `Bloklu (${blockTime}s)`
              ) : (
                'Giriş Yap'
              )}
            </button>
          </form>

          {/* Ayırıcı */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="px-4 bg-[#0b0e11] text-[#5e6673] text-sm">
                Hesabınız yok mu?
              </span>
            </div>
          </div>

          {/* Kayıt Ol */}
          <Link
            href="/register"
            className="w-full flex justify-center py-3.5 rounded-lg text-base font-semibold text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300"
          >
            Yeni Hesap Oluştur
          </Link>

          {/* Alt bilgi */}
          <p className="mt-8 text-center text-xs text-[#5e6673] leading-relaxed">
            Giriş yaparak{' '}
            <Link href="/terms" className="text-[#0ecb81] hover:underline transition-colors">
              Kullanım Şartları
            </Link>{' '}
            ve{' '}
            <Link href="/privacy" className="text-[#0ecb81] hover:underline transition-colors">
              Gizlilik Politikası
            </Link>
            &apos;nı kabul etmiş olursunuz.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0b0e11] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#0ecb81] border-t-transparent"></div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
