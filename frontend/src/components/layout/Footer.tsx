import Link from 'next/link';
import Logo from '@/components/Logo';

export default function Footer() {
  return (
    <footer className="border-t border-line max-lg:pb-16">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Logo className="opacity-80" compact />
          <p className="text-xs leading-relaxed">
            PortfoyGo bir simülasyondur; işlemler sanal parayla yapılır ve yatırım tavsiyesi değildir.
          </p>
        </div>
        <nav aria-label="Alt bağlantılar" className="flex items-center gap-5 text-xs">
          <Link href="/terms" className="hover:text-fg">Kullanım şartları</Link>
          <Link href="/privacy" className="hover:text-fg">Gizlilik</Link>
          <span className="text-subtle">© {new Date().getFullYear()}</span>
        </nav>
      </div>
    </footer>
  );
}
