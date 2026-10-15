import type { Metadata } from 'next';
import RanksScreen from '@/components/game/ranks/RanksScreen';

export const metadata: Metadata = {
  title: 'Sıralama',
  description: 'Oyun Merkezi puan ve seviye sıralamaları, kademeler ve düello kaydın.',
  robots: { index: false, follow: false },
};

export default function RanksPage() {
  return <RanksScreen />;
}
