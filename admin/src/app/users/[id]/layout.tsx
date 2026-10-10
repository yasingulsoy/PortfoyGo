import type { Metadata } from 'next';

export const metadata: Metadata = {
  // Üst segment (users) kendi başlığını tanımladığından kök şablon burada uygulanmaz
  title: { absolute: 'Kullanıcı detayı · PortfoyGo Yönetim' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
