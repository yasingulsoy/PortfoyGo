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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-white/95 via-gray-50/95 to-white/95 dark:from-gray-900/95 dark:via-gray-800/95 dark:to-gray-900/95 backdrop-blur-xl transition-all duration-500 ease-out">
          <div className="flex flex-col items-center gap-8 animate-fade-in">
            {/* Modern Animated Logo/Icon */}
            <div className="relative">
              {/* Outer glow rings */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/30 via-purple-500/30 to-pink-500/30 blur-2xl animate-pulse"></div>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 blur-xl animate-ping"></div>
              
              {/* Main icon container */}
              <div className="relative h-24 w-24 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 flex items-center justify-center shadow-2xl transform transition-all duration-300 hover:scale-105">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent"></div>
                <svg className="w-12 h-12 text-white relative z-10 animate-bounce-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
            
            {/* Modern Spinner - Three dots */}
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="h-3 w-3 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="h-3 w-3 rounded-full bg-gradient-to-br from-pink-500 to-indigo-600 animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
            
            {/* Loading text with modern typography */}
            <div className="flex flex-col items-center gap-3">
              <p className="text-lg font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400 animate-pulse">
                Sayfa yükleniyor...
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                Lütfen bekleyin
              </p>
            </div>
            
            {/* Modern Progress bar */}
            <div className="w-72 h-2 bg-gray-200/50 dark:bg-gray-700/50 rounded-full overflow-hidden backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 via-pink-500 to-indigo-500 rounded-full shadow-lg relative overflow-hidden"
                style={{
                  backgroundSize: '200% 100%',
                  animation: 'loading-progress 1.5s ease-in-out infinite, gradient-shift 2s ease infinite',
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className={`transition-all duration-500 ease-out ${loading ? 'opacity-0 scale-[0.98] blur-sm' : 'opacity-100 scale-100 blur-0'}`}>
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
        
        @keyframes gradient-shift {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes bounce-slow {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
        }
        
        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
        
        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
        }
        
        .animate-shimmer {
          animation: shimmer 1.5s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}

