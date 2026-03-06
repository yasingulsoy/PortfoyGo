'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [displayChildren, setDisplayChildren] = useState(children);
  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      setLoading(true);
      prevPathnameRef.current = pathname;
      
      const timer = setTimeout(() => {
        setDisplayChildren(children);
        setTimeout(() => {
          setLoading(false);
        }, 100);
      }, 200);

      return () => clearTimeout(timer);
    } else {
      setDisplayChildren(children);
    }
  }, [pathname, children]);

  return (
    <>
      {loading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-950/95 backdrop-blur-md">
          <div className="flex flex-col items-center gap-6 animate-[fadeIn_0.3s_ease-out]">

            <div className="relative flex items-center justify-center w-20 h-20">
              <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 animate-[ping_1.5s_ease-in-out_infinite]" />
              <div className="absolute inset-1 rounded-full border-2 border-transparent border-t-emerald-400 animate-[spin_0.8s_linear_infinite]" />
              <div className="absolute inset-3 rounded-full border-2 border-transparent border-b-cyan-400 animate-[spin_1.2s_linear_infinite_reverse]" />
              <svg className="w-7 h-7 text-emerald-400 relative z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </div>

            <div className="flex flex-col items-center gap-2">
              <span className="text-base font-semibold text-white tracking-wide">
                PortfoyGo
              </span>
              <div className="w-36 h-1 rounded-full bg-gray-800 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-emerald-500 animate-[progressSlide_1.2s_ease-in-out_infinite]" />
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className={`transition-opacity duration-300 ease-out ${loading ? 'opacity-0' : 'opacity-100'}`}>
        {displayChildren}
      </div>
      
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes progressSlide {
          0% { transform: translateX(-100%); width: 40%; }
          50% { width: 60%; }
          100% { transform: translateX(250%); width: 40%; }
        }
      `}</style>
    </>
  );
}
