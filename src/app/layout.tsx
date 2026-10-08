import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';
import AppShell from '@/components/layout/AppShell';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin', 'latin-ext'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin', 'latin-ext'] });

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
    { media: '(prefers-color-scheme: light)', color: '#f5f6fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0d16' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-dvh bg-canvas text-fg antialiased`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
