'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { EyeIcon, EyeSlashIcon, ChartBarIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
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

      <div className="max-w-md w-full">
        {/* Logo ve Başlık */}
        <div className="text-center mb-8">
          <div className="mx-auto h-16 w-16 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full flex items-center justify-center mb-4">
            <ChartBarIcon className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white">
            Hoş Geldiniz
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Hesabınıza giriş yapın ve yatırım yolculuğunuza başlayın
          </p>
        </div>

        {/* Başarı Mesajı */}
        {successMessage && (
          <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 px-4 py-3 rounded-lg text-sm text-center">
            {successMessage}
          </div>
        )}

        {/* Güvenlik Uyarısı */}
        {attempts > 0 && attempts < 5 && (
          <div className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-600 dark:text-yellow-400 px-4 py-3 rounded-lg text-sm text-center">
            <div className="flex items-center justify-center">
              <ShieldCheckIcon className="h-4 w-4 mr-2" />
              Güvenlik: {attempts}/5 deneme hakkınız kaldı
            </div>
          </div>
        )}

        {/* Giriş Formu */}
        <div className="bg-gray-800 py-8 px-6 shadow-xl rounded-2xl border border-gray-700">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email Adresi
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full px-4 py-3 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-700 dark:text-white transition-colors"
                placeholder="ornek@email.com"
                value={formData.email}
                onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Şifre
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="w-full px-4 py-3 pr-12 border border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-700 dark:text-white transition-colors"
                  placeholder="Şifrenizi girin"
                  value={formData.password}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || isBlocked}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
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
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-800 text-gray-500 dark:text-gray-400">
                  Hesabınız yok mu?
                </span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                href="/register"
                className="w-full flex justify-center py-3 px-4 border border-gray-600 rounded-lg shadow-sm text-sm font-medium text-gray-300 bg-white bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200"
              >
                Yeni Hesap Oluştur
              </Link>
            </div>
          </div>
        </div>

        {/* Alt Bilgi */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Giriş yaparak{' '}
            <Link href="/terms" className="text-indigo-600 dark:text-indigo-400 hover:underline">
              Kullanım Şartları
            </Link>{' '}
            ve{' '}
            <Link href="/privacy" className="text-indigo-600 dark:text-indigo-400 hover:underline">
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
