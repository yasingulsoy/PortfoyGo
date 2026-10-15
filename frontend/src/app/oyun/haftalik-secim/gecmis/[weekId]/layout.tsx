import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Haftalık Seçim · Hafta',
  description: 'Bir haftalık seçimin kürsüsü, kitle portföyünün sonucu, tüm seçimler ve tartışma.',
  robots: { index: false, follow: false },
};

export default function WeekLayout({ children }: { children: React.ReactNode }) {
  return children;
}
