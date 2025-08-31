export default function Footer() {
  return (
    <footer className="border-t bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500">
          <p className="text-center sm:text-left">© {new Date().getFullYear()} Sanal Yatırım. Tüm hakları saklıdır.</p>
          <div className="flex items-center gap-4">
            <a href="/" className="hover:text-gray-700">Gizlilik</a>
            <a href="/" className="hover:text-gray-700">Şartlar</a>
            <a href="/" className="hover:text-gray-700">İletişim</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
