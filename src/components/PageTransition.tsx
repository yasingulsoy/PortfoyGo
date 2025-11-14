'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [displayChildren, setDisplayChildren] = useState(children);
  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    // Sadece pathname değiştiğinde loading göster
    if (prevPathnameRef.current !== pathname) {
      setLoading(true);
      prevPathnameRef.current = pathname;
      
      // Kısa bir delay ile loading'i göster ve sonra içeriği güncelle
      const timer = setTimeout(() => {
        setDisplayChildren(children);
        // İçerik güncellendikten sonra loading'i kapat
        setTimeout(() => {
          setLoading(false);
        }, 100);
      }, 200);

      return () => clearTimeout(timer);
    } else {
      // Pathname değişmediyse sadece children'ı güncelle
      setDisplayChildren(children);
    }
  }, [pathname, children]);

  return (
    <>
      {loading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/90 dark:bg-gray-900/90 backdrop-blur-md transition-opacity duration-300">
          <div className="flex flex-col items-center gap-6">
            {/* Animated Logo/Icon */}
            <div className="relative">
              <div className="h-20 w-20 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl">
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              {/* Pulsing ring */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 animate-ping opacity-20"></div>
            </div>
            
            {/* Spinner */}
            <div className="relative">
              <div className="h-12 w-12 border-4 border-indigo-200 dark:border-indigo-800 rounded-full"></div>
              <div className="absolute top-0 left-0 h-12 w-12 border-4 border-transparent border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin"></div>
            </div>
            
            {/* Loading text */}
            <div className="flex flex-col items-center gap-2">
              <p className="text-base font-semibold text-gray-700 dark:text-gray-300">
                Sayfa yükleniyor...
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Lütfen bekleyin
              </p>
            </div>
            
            {/* Progress bar */}
            <div className="w-64 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 rounded-full"
                style={{
                  animation: 'loading-progress 1.5s ease-in-out infinite',
                }}
              ></div>
            </div>
          </div>
        </div>
      )}
      
      <div className={`transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}>
        {displayChildren}
      </div>
      
      <style jsx global>{`
        @keyframes loading-progress {
          0% {
            transform: translateX(-100%);
            width: 0%;
          }
          50% {
            transform: translateX(0%);
            width: 70%;
          }
          100% {
            transform: translateX(100%);
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}

