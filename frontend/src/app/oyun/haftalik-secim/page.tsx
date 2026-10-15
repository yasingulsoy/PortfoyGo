import type { Metadata } from 'next';
import PicksScreen from '@/components/game/picks/PicksScreen';

export const metadata: Metadata = {
  title: 'Haftalık Seçim',
  description: 'Kitlelerin Bilgeliği: her hafta tek gizli seçim (varlık + yön), Pazar 15:00’te açılış, Pazartesi–Cuma yarış. Sanal yarışma.',
  robots: { index: false, follow: false },
};

export default function WeeklyPicksPage() {
  return <PicksScreen />;
}
