import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
          <p className="text-center sm:text-left">© {new Date().getFullYear()} Sanal Yatırım. Tüm hakları saklıdır.</p>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-gray-700 dark:hover:text-gray-300">Gizlilik</Link>
            <Link href="/" className="hover:text-gray-700 dark:hover:text-gray-300">Şartlar</Link>
            <Link href="/" className="hover:text-gray-700 dark:hover:text-gray-300">İletişim</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
