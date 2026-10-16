import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ortak Akıl',
  description: 'Yatırım fikirlerini gerekçe, senaryo, risk ve izleme kriterleriyle kaydet ve karşılaştır.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
