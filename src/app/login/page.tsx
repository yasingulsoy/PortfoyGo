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


  // Zaten giriş yapmış kullanıcıyı yönlendir
  useEffect(() => {
    if (!authLoading && user) {
      // Kısa bir gecikme ile yönlendir (başarı mesajının görünmesi için)
      setTimeout(() => {
        const redirectTo = searchParams.get('redirect') || '/';
        // window.location.href kullan (router.push bazen çalışmıyor)
        window.location.href = redirectTo;
      }, 1000);
    }
  }, [user, router, searchParams, authLoading]);

  // Başarı mesajını göster
  useEffect(() => {
    const message = searchParams.get('message');
    if (message) {
      setSuccessMessage(decodeURIComponent(message));
      // 5 saniye sonra mesajı temizle
      setTimeout(() => setSuccessMessage(''), 5000);
    }
  }, [searchParams]);

  // Blok süresini kontrol et
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

  // Input validasyonu
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

  // Rate limiting kontrolü
  const checkRateLimit = () => {
    if (attempts >= 5) {
      setIsBlocked(true);
      setBlockTime(300); // 5 dakika blok
      setError('Çok fazla başarısız deneme. 5 dakika bekleyin.');
      return false;
    }
    return true;
  };

  // XSS koruması
  const sanitizeInput = (input: string) => {
    return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Blok kontrolü
    if (isBlocked) {
      setError(`Çok fazla başarısız deneme. ${blockTime} saniye bekleyin.`);
      return;
    }

    // Rate limiting
    if (!checkRateLimit()) {
      return;
    }

    // Input validasyonu
    if (!validateInput()) {
      return;
    }

    setLoading(true);
    setError('');

    // Input sanitization
    const sanitizedData = {
      email: sanitizeInput(formData.email.trim().toLowerCase()),
      password: formData.password
    };

    try {
      // Sadece AuthContext'in login fonksiyonunu kullan
      const result = await login(sanitizedData.email, sanitizedData.password);
      
      if (result.success) {
        // Başarılı giriş - deneme sayısını sıfırla
        setAttempts(0);
        setSuccessMessage('Giriş başarılı! Yönlendiriliyorsunuz...');
        
        // Yönlendirmeyi hemen yap (useEffect'e güvenmek yerine)
        const redirectTo = searchParams.get('redirect') || '/';
        setTimeout(() => {
          // window.location.href kullan (router.push bazen çalışmıyor)
          window.location.href = redirectTo;
        }, 1000);
      } else {
        // Başarısız giriş - deneme sayısını artır
        setAttempts(prev => prev + 1);
        // Backend'den gelen spesifik hata mesajını göster
        const errorMsg = result.message || 'Giriş başarısız. Email veya şifre hatalı.';
        
        // 3 denemeden sonra uyarı ver
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

  // AuthContext yüklenirken loading göster
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#181a20] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#0ecb81]"></div>
          <p className="mt-4 text-[#848e9c]">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#181a20] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        {/* Başlık */}
        <div className="text-center mb-10">
          <h2 className="text-4xl font-bold text-white mb-2">
            Hoş Geldiniz
          </h2>
          <p className="text-[#848e9c] text-base">
            Hesabınıza giriş yapın ve yatırım yolculuğunuza başlayın
          </p>
        </div>

        {/* Başarı Mesajı */}
        {successMessage && (
          <div className="mb-6 bg-[#0ecb81]/10 border border-[#0ecb81]/30 text-[#0ecb81] px-5 py-4 rounded-xl text-sm text-center">
            {successMessage}
          </div>
        )}

        {/* Güvenlik Uyarısı */}
        {attempts > 0 && attempts < 5 && (
          <div className="mb-6 bg-[#f0b90b]/10 border border-[#f0b90b]/30 text-[#f0b90b] px-5 py-4 rounded-xl text-sm text-center">
            <div className="flex items-center justify-center">
              <ShieldCheckIcon className="h-5 w-5 mr-2" />
              Güvenlik: {attempts}/5 deneme hakkınız kaldı
            </div>
          </div>
        )}

        {/* Giriş Formu */}
        <div className="bg-[#1e2329] rounded-xl border border-[#2b3139] py-10 px-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-white mb-3">
                Email Adresi
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full px-5 py-4 border border-[#2b3139] rounded-xl focus:ring-2 focus:ring-[#0ecb81] focus:border-[#0ecb81] bg-[#161a1e] text-white placeholder-[#848e9c] transition-all duration-200"
                placeholder="ornek@email.com"
                value={formData.email}
                onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-white mb-3">
                Şifre
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="w-full px-5 py-4 pr-14 border border-[#2b3139] rounded-xl focus:ring-2 focus:ring-[#0ecb81] focus:border-[#0ecb81] bg-[#161a1e] text-white placeholder-[#848e9c] transition-all duration-200"
                  placeholder="Şifrenizi girin"
                  value={formData.password}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-4 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-6 w-6 text-[#848e9c] hover:text-white transition-colors" />
                  ) : (
                    <EyeIcon className="h-6 w-6 text-[#848e9c] hover:text-white transition-colors" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-[#f6465d]/10 border border-[#f6465d]/30 text-[#f6465d] px-5 py-4 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || isBlocked}
              className="w-full flex justify-center py-4 px-4 rounded-xl text-base font-semibold text-white bg-[#0ecb81] hover:bg-[#0bb975] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0ecb81] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                  Giriş yapılıyor...
                </div>
              ) : isBlocked ? (
                `Bloklu (${blockTime}s)`
              ) : (
                'Giriş Yap'
              )}
            </button>
          </form>

          {/* Kayıt Ol Butonu */}
          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#2b3139]" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-[#1e2329] text-[#848e9c]">
                  Hesabınız yok mu?
                </span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                href="/register"
                className="w-full flex justify-center py-4 px-4 border border-[#2b3139] rounded-xl text-base font-semibold text-white bg-[#2b3139] hover:bg-[#3a4149] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0ecb81] transition-all duration-200"
              >
                Yeni Hesap Oluştur
              </Link>
            </div>
          </div>
        </div>

        {/* Alt Bilgi */}
        <div className="mt-8 text-center">
          <p className="text-xs text-[#848e9c]">
            Giriş yaparak{' '}
            <Link href="/terms" className="text-[#0ecb81] hover:text-[#0bb975] hover:underline transition-colors">
              Kullanım Şartları
            </Link>{' '}
            ve{' '}
            <Link href="/privacy" className="text-[#0ecb81] hover:text-[#0bb975] hover:underline transition-colors">
              Gizlilik Politikası
            </Link>{' '}
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
      <div className="min-h-screen bg-[#181a20] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0ecb81]"></div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
