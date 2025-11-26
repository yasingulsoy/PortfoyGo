'use client';

import Link from 'next/link';
import { HomeIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#181a20] flex items-center justify-center px-4">
      <div className="text-center">
        <div className="mx-auto h-24 w-24 bg-[#f6465d]/10 rounded-full flex items-center justify-center mb-6 border-2 border-[#f6465d]">
          <ExclamationTriangleIcon className="h-12 w-12 text-[#f6465d]" />
        </div>
        <h1 className="text-6xl font-bold text-white mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-white mb-2">Sayfa Bulunamadı</h2>
        <p className="text-[#848e9c] mb-8 max-w-md mx-auto">
          Aradığınız sayfa mevcut değil veya taşınmış olabilir.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-[#0ecb81] hover:bg-[#0bb975] text-white px-6 py-3 rounded-xl font-semibold transition-all"
        >
          <HomeIcon className="h-5 w-5" />
          Ana Sayfaya Dön
        </Link>
      </div>
    </div>
  );
}

