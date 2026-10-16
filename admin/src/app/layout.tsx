import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Geist, Geist_Mono, Outfit } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';
import ClientErrorReporter from '@portfoygo/shared/ui/ClientErrorReporter';
import AdminShell from '@/components/AdminShell';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin', 'latin-ext'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin', 'latin-ext'] });
// TailAdmin'in yazı tipi
const outfit = Outfit({ variable: '--font-outfit', subsets: ['latin', 'latin-ext'] });

export const metadata: Metadata = {
  title: { default: 'Yönetim paneli · PortfoyGo', template: '%s · PortfoyGo Yönetim' },
  robots: { index: false, follow: false },
  icons: { icon: '/fav.ico' },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // CSP nonce'u (src/proxy.ts): next-themes tema betiği için; headers() sayfaları dinamik render eder
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className={`${outfit.variable} ${geistSans.variable} ${geistMono.variable} min-h-dvh bg-canvas text-fg antialiased`}>
        <Providers nonce={nonce}>
          <AdminShell>{children}</AdminShell>
        </Providers>
        {/* Yakalanmamış tarayıcı hatalarını POST /api/client-errors'a bildirir (kişisel veri yok) */}
        <ClientErrorReporter app="admin" />
      </body>
    </html>
  );
}
