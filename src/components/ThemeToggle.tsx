'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';

export default function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const current = theme === 'system' ? systemTheme : theme;

  return (
    <div className="inline-flex items-center gap-1">
      <button
        onClick={() => setTheme('light')}
        className={`p-2 rounded-md ${current === 'light' ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100'}`}
        aria-label="Light"
      >
        <SunIcon className="h-5 w-5" />
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={`p-2 rounded-md ${current === 'dark' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
        aria-label="Dark"
      >
        <MoonIcon className="h-5 w-5" />
      </button>
      <button
        onClick={() => setTheme('system')}
        className={`p-2 rounded-md ${theme === 'system' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}
        aria-label="System"
      >
        <ComputerDesktopIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
