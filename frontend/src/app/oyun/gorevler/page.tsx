import type { Metadata } from 'next';
import QuestsScreen from '@/components/game/quests/QuestsScreen';

export const metadata: Metadata = {
  title: 'Görevler',
  description: 'Günlük görevler, ödüller ve 7 günlük seri (sanal jeton ve XP).',
  robots: { index: false, follow: false },
};

export default function QuestsPage() {
  return <QuestsScreen />;
}
