import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Portföy Sihirbazı',
  description: 'Risk profili anketiyle kişisel varlık dağılımı önerisi, Monte Carlo senaryoları ve olası düşüşler (simülasyon; yatırım tavsiyesi değildir).',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
