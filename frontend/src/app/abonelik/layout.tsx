import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Abonelik',
  description: 'Ücretsiz ve Premium planları karşılaştır, 14 günlük ücretsiz denemeyi başlat.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
