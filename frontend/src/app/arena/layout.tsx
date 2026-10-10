import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Arena',
  description: 'Kısa süreli, hızlı al-sat turları ve canlı meydan okumalar (sanal para).',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
