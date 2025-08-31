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
    <div className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
      <button
        onClick={() => setTheme('light')}
        className={`p-2 rounded-md transition-all duration-200 ${
          current === 'light' 
            ? 'bg-white text-yellow-600 shadow-sm' 
            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
        aria-label="Light Mode"
        title="Light Mode"
      >
        <SunIcon className="h-5 w-5" />
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={`p-2 rounded-md transition-all duration-200 ${
          current === 'dark' 
            ? 'bg-gray-700 text-blue-400 shadow-sm' 
            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
        aria-label="Dark Mode"
        title="Dark Mode"
      >
        <MoonIcon className="h-5 w-5" />
      </button>
      <button
        onClick={() => setTheme('system')}
        className={`p-2 rounded-md transition-all duration-200 ${
          theme === 'system' 
            ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 shadow-sm' 
            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
        }`}
        aria-label="System Theme"
        title="System Theme"
      >
        <ComputerDesktopIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
