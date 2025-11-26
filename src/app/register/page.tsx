'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { register, loading: authLoading } = useAuth();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Şifre kontrolü
    if (formData.password !== formData.confirmPassword) {
      setError('Şifreler eşleşmiyor');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Şifre en az 6 karakter olmalı');
      setLoading(false);
      return;
    }

    try {
      const success = await register(formData.username, formData.email, formData.password);
      
      if (success) {
        // Kayıt başarılı, giriş sayfasına yönlendir
        router.push('/login?message=' + encodeURIComponent('Kayıt başarılı! Giriş yapabilirsiniz.'));
      } else {
        setError('Kayıt başarısız. Lütfen tekrar deneyin.');
      }
    } catch (error: any) {
      setError(error.message || 'Sunucuya bağlanılamadı');
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
            Yeni Hesap Oluşturun
          </h2>
          <p className="text-[#848e9c] text-base">
            Veya{' '}
            <Link href="/login" className="text-[#0ecb81] hover:text-[#0bb975] hover:underline transition-colors">
              mevcut hesabınızla giriş yapın
            </Link>
          </p>
        </div>

        {/* Form */}
        <div className="bg-[#1e2329] rounded-xl border border-[#2b3139] py-10 px-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="username" className="block text-sm font-semibold text-white mb-3">
                Kullanıcı Adı
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="w-full px-5 py-4 border border-[#2b3139] rounded-xl focus:ring-2 focus:ring-[#0ecb81] focus:border-[#0ecb81] bg-[#161a1e] text-white placeholder-[#848e9c] transition-all duration-200"
                placeholder="Kullanıcı adınız"
                value={formData.username}
                onChange={handleChange}
              />
            </div>

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
              <input
                id="password"
                name="password"
                type="password"
                required
                className="w-full px-5 py-4 border border-[#2b3139] rounded-xl focus:ring-2 focus:ring-[#0ecb81] focus:border-[#0ecb81] bg-[#161a1e] text-white placeholder-[#848e9c] transition-all duration-200"
                placeholder="Şifreniz (en az 6 karakter)"
                value={formData.password}
                onChange={handleChange}
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-white mb-3">
                Şifre Tekrar
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                className="w-full px-5 py-4 border border-[#2b3139] rounded-xl focus:ring-2 focus:ring-[#0ecb81] focus:border-[#0ecb81] bg-[#161a1e] text-white placeholder-[#848e9c] transition-all duration-200"
                placeholder="Şifrenizi tekrar girin"
                value={formData.confirmPassword}
                onChange={handleChange}
              />
            </div>

            {error && (
              <div className="bg-[#f6465d]/10 border border-[#f6465d]/30 text-[#f6465d] px-5 py-4 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-4 px-4 rounded-xl text-base font-semibold text-white bg-[#0ecb81] hover:bg-[#0bb975] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0ecb81] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                  Hesap oluşturuluyor...
                </div>
              ) : (
                'Hesap Oluştur'
              )}
            </button>
          </form>

          {/* Giriş Yap Linki */}
          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#2b3139]" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-[#1e2329] text-[#848e9c]">
                  Zaten hesabınız var mı?
                </span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                href="/login"
                className="w-full flex justify-center py-4 px-4 border border-[#2b3139] rounded-xl text-base font-semibold text-white bg-[#2b3139] hover:bg-[#3a4149] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0ecb81] transition-all duration-200"
              >
                Giriş Yap
              </Link>
            </div>
          </div>
        </div>

        {/* Alt Bilgi */}
        <div className="mt-8 text-center">
          <p className="text-xs text-[#848e9c]">
            Kayıt olarak{' '}
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
