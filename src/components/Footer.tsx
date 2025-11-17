import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-[#2b3139] bg-[#181a20]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-[#848e9c]">
          <p className="text-center sm:text-left">Created by Yasin Gülsoy · Cengaversoft</p>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-white transition-colors">Gizlilik</Link>
            <Link href="/" className="hover:text-white transition-colors">Şartlar</Link>
            <Link href="/" className="hover:text-white transition-colors">İletişim</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
