import Link from 'next/link';
import Logo from '@portfoygo/shared/ui/Logo';

/** Ziyaretçi sayfalarının sade alt bilgisi. */
export default function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <Link href="/" aria-label="PortfoyGo ana sayfa" className="w-fit shrink-0 rounded-lg">
            <Logo />
          </Link>
          <p className="max-w-md text-xs leading-relaxed text-muted">
            PortfoyGo bir simülasyondur; işlemler sanal parayla yapılır ve yatırım tavsiyesi değildir.
          </p>
        </div>
        <nav aria-label="Alt bağlantılar" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
          <Link href="/terms" className="transition-colors hover:text-fg">Kullanım şartları</Link>
          <Link href="/privacy" className="transition-colors hover:text-fg">Gizlilik</Link>
          <Link href="/cerez-politikasi" className="transition-colors hover:text-fg">Çerez politikası</Link>
          <span className="text-subtle">© {new Date().getFullYear()} PortfoyGo</span>
        </nav>
      </div>
    </footer>
  );
}
