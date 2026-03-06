'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">PortfoyGo</h1>
            <p className="text-[#848e9c] text-lg leading-relaxed">
              Hemen ücretsiz hesap oluşturun ve 100.000$ sanal bakiye ile kripto yatırım deneyimine başlayın.
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
            <h2 className="text-2xl font-bold text-white mb-2">Hesap Oluştur</h2>
            <p className="text-[#848e9c] text-sm">
              Ücretsiz hesap oluşturun ve yatırım yolculuğunuza başlayın
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-[#eaecef] mb-2">
                Kullanıcı Adı
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="w-full px-4 py-3.5 rounded-lg bg-transparent border border-white/10 text-white placeholder-[#5e6673] focus:border-[#0ecb81] focus:outline-none transition-colors duration-200"
                placeholder="Kullanıcı adınız"
                value={formData.username}
                onChange={handleChange}
              />
            </div>

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
                  required
                  className="w-full px-4 py-3.5 pr-12 rounded-lg bg-transparent border border-white/10 text-white placeholder-[#5e6673] focus:border-[#0ecb81] focus:outline-none transition-colors duration-200"
                  placeholder="En az 6 karakter"
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

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#eaecef] mb-2">
                Şifre Tekrar
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  className="w-full px-4 py-3.5 pr-12 rounded-lg bg-transparent border border-white/10 text-white placeholder-[#5e6673] focus:border-[#0ecb81] focus:outline-none transition-colors duration-200"
                  placeholder="Şifrenizi tekrar girin"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
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
              disabled={loading}
              className="w-full py-3.5 rounded-lg text-base font-semibold bg-[#0ecb81] text-[#0b0e11] border border-[#0ecb81] hover:bg-transparent hover:text-[#0ecb81] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#0ecb81] disabled:hover:text-[#0b0e11] transition-all duration-300 cursor-pointer"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="animate-spin inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full"></span>
                  Hesap oluşturuluyor...
                </span>
              ) : (
                'Hesap Oluştur'
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
                Zaten hesabınız var mı?
              </span>
            </div>
          </div>

          {/* Giriş Yap */}
          <Link
            href="/login"
            className="w-full flex justify-center py-3.5 rounded-lg text-base font-semibold text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300"
          >
            Giriş Yap
          </Link>

          {/* Alt bilgi */}
          <p className="mt-8 text-center text-xs text-[#5e6673] leading-relaxed">
            Kayıt olarak{' '}
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
