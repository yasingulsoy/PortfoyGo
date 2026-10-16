import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Geist, Geist_Mono, Outfit } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';
import ClientErrorReporter from '@portfoygo/shared/ui/ClientErrorReporter';
import AppShell from '@/components/layout/AppShell';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin', 'latin-ext'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin', 'latin-ext'] });
// TailAdmin'in yazı tipi
const outfit = Outfit({ variable: '--font-outfit', subsets: ['latin', 'latin-ext'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: {
    default: 'PortfoyGo — Sanal Yatırım Simülasyonu',
    template: '%s · PortfoyGo',
  },
  description: 'Gerçek piyasa verileriyle risksiz yatırım yapın: hisse, kripto, döviz ve emtia alıp satın, portföyünüzü büyütün, liderlik tablosunda yarışın.',
  applicationName: 'PortfoyGo',
  icons: { icon: '/fav.ico' },
  openGraph: {
    title: 'PortfoyGo — Sanal Yatırım Simülasyonu',
    description: 'Gerçek piyasa verileriyle sanal portföy oluşturun ve yarışın.',
    images: ['/PortfoyGo.png'],
    locale: 'tr_TR',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9fafb' },
    { media: '(prefers-color-scheme: dark)', color: '#101828' },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // CSP nonce'u (src/proxy.ts her istekte üretir): next-themes'in tema betiği (karanlık mod yanıp sönmesin diye
  // boyamadan önce çalışır) bu nonce ile işaretlenir. headers() okumak sayfaları dinamik render eder — nonce'lu
  // CSP için gerekli (Next kendi betiklerine de nonce'u render sırasında ekler).
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className={`${outfit.variable} ${geistSans.variable} ${geistMono.variable} min-h-dvh bg-canvas text-fg antialiased`}>
        <Providers nonce={nonce}>
          <AppShell>{children}</AppShell>
        </Providers>
        {/* Yakalanmamış tarayıcı hatalarını POST /api/client-errors'a bildirir (kişisel veri yok) */}
        <ClientErrorReporter app="web" />
      </body>
    </html>
  );
}
