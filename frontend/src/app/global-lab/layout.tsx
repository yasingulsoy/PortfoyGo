import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Global Portföy Lab',
  description:
    'Farklı ülke ve piyasalardaki yatırım araçlarını araştır, sınıflandır ve küresel portföy senaryolarını değerlendir (eğitim amaçlı; yatırım tavsiyesi değildir).',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
