import type { Metadata } from 'next';
import { Geist, Geist_Mono, Outfit } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className={`${outfit.variable} ${geistSans.variable} ${geistMono.variable} min-h-dvh bg-canvas text-fg antialiased`}>
        <Providers>
          <AdminShell>{children}</AdminShell>
        </Providers>
      </body>
    </html>
  );
}
