import type { Metadata } from 'next';
import PicksHistoryScreen from '@/components/game/picks/HistoryScreen';

export const metadata: Metadata = {
  title: 'Haftalık Seçim · Geçmiş',
  description: 'Geçmiş haftalık seçimlerin kazananları, kitle portföyünün sonucu ve senin yerin.',
  robots: { index: false, follow: false },
};

export default function WeeklyPicksHistoryPage() {
  return <PicksHistoryScreen />;
}
