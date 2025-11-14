'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { EyeIcon, EyeSlashIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/context/AuthContext';
import DotGrid from '@/components/DotGrid';
import Image from 'next/image';

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
  const { user, login } = useAuth();


  // Zaten giriş yapmış kullanıcıyı yönlendir
  useEffect(() => {
    if (user) {
      // Kısa bir gecikme ile yönlendir (başarı mesajının görünmesi için)
      setTimeout(() => {
        const redirectTo = searchParams.get('redirect') || '/';
        console.log('Redirecting to:', redirectTo);
        router.push(redirectTo);
      }, 1500);
    }
  }, [user, router, searchParams]);

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
      const loginSuccess = await login(sanitizedData.email, sanitizedData.password);
      
      if (loginSuccess) {
        // Başarılı giriş - deneme sayısını sıfırla
        setAttempts(0);
        setSuccessMessage('Giriş başarılı! Yönlendiriliyorsunuz...');
        
        // user state'i güncellendiğinde useEffect ile yönlendirme yapılacak
        // Burada ekstra yönlendirme yapmaya gerek yok
      } else {
        // Başarısız giriş - deneme sayısını artır
        setAttempts(prev => prev + 1);
        setError('Giriş başarısız. Email veya şifre hatalı.');
        
        // 3 denemeden sonra uyarı ver
        if (attempts >= 2) {
          setError(`Giriş başarısız. Email veya şifre hatalı. (${attempts + 1}/5 deneme)`);
        }
      }
    } catch {
      setAttempts(prev => prev + 1);
      setError('Sunucuya bağlanılamadı. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
      {/* DotGrid Arka Plan */}
      <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
        <DotGrid
          dotSize={2}
          gap={15}
          baseColor="#5227FF"
          activeColor="#5227FF"
          proximity={120}
          shockRadius={250}
          shockStrength={5}
          resistance={750}
          returnDuration={1.5}
        />
      </div>

      <div className="max-w-md w-full relative z-10">
        {/* Logo ve Başlık */}
        <div className="text-center mb-10">
          <div className="mx-auto mb-6 flex justify-center">
            <Image
              src="/PortfoyGo.png"
              alt="PortfoyGo Logo"
              width={180}
              height={80}
              className="object-contain"
              priority
            />
          </div>
          <h2 className="text-4xl font-bold text-white mb-2">
            Hoş Geldiniz
          </h2>
          <p className="text-gray-300 text-base">
            Hesabınıza giriş yapın ve yatırım yolculuğunuza başlayın
          </p>
        </div>

        {/* Başarı Mesajı */}
        {successMessage && (
          <div className="mb-6 bg-green-500/20 backdrop-blur-sm border border-green-400/30 text-green-300 px-5 py-4 rounded-xl text-sm text-center shadow-lg">
            {successMessage}
          </div>
        )}

        {/* Güvenlik Uyarısı */}
        {attempts > 0 && attempts < 5 && (
          <div className="mb-6 bg-yellow-500/20 backdrop-blur-sm border border-yellow-400/30 text-yellow-300 px-5 py-4 rounded-xl text-sm text-center shadow-lg">
            <div className="flex items-center justify-center">
              <ShieldCheckIcon className="h-5 w-5 mr-2" />
              Güvenlik: {attempts}/5 deneme hakkınız kaldı
            </div>
          </div>
        )}

        {/* Giriş Formu */}
        <div className="bg-white/10 dark:bg-gray-800/90 backdrop-blur-xl py-10 px-8 shadow-2xl rounded-3xl border border-white/20 dark:border-gray-700">
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
                className="w-full px-5 py-4 border border-white/20 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white/10 dark:bg-gray-700/50 backdrop-blur-sm text-white placeholder-gray-400 transition-all duration-200"
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
                  className="w-full px-5 py-4 pr-14 border border-white/20 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white/10 dark:bg-gray-700/50 backdrop-blur-sm text-white placeholder-gray-400 transition-all duration-200"
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
                    <EyeSlashIcon className="h-6 w-6 text-gray-400 hover:text-white transition-colors" />
                  ) : (
                    <EyeIcon className="h-6 w-6 text-gray-400 hover:text-white transition-colors" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/20 backdrop-blur-sm border border-red-400/30 text-red-300 px-5 py-4 rounded-xl text-sm shadow-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || isBlocked}
              className="w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-base font-semibold text-white bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
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
                <div className="w-full border-t border-white/20 dark:border-gray-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-white/10 dark:bg-gray-800 text-gray-300 dark:text-gray-400">
                  Hesabınız yok mu?
                </span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                href="/register"
                className="w-full flex justify-center py-4 px-4 border border-white/30 dark:border-gray-600 rounded-xl shadow-md text-base font-semibold text-white bg-white/5 dark:bg-gray-700/30 backdrop-blur-sm hover:bg-white/10 dark:hover:bg-gray-600/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
              >
                Yeni Hesap Oluştur
              </Link>
            </div>
          </div>
        </div>

        {/* Alt Bilgi */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Giriş yaparak{' '}
            <Link href="/terms" className="text-purple-400 hover:text-purple-300 hover:underline transition-colors">
              Kullanım Şartları
            </Link>{' '}
            ve{' '}
            <Link href="/privacy" className="text-purple-400 hover:text-purple-300 hover:underline transition-colors">
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
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
