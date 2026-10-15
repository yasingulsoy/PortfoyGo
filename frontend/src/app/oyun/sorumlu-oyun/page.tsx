import type { Metadata } from 'next';
import ResponsibleScreen from '@/components/game/responsible/ResponsibleScreen';

export const metadata: Metadata = {
  title: 'Sorumlu Oyun',
  description: 'Günlük tur sınırı, oturum hatırlatıcısı ve mola ayarları. Oyun Merkezi’ndeki para tamamen sanaldır.',
  robots: { index: false, follow: false },
};

export default function ResponsiblePage() {
  return <ResponsibleScreen />;
}
