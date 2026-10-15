import type { Metadata } from 'next';
import WheelScreen from '@/components/game/wheel/WheelScreen';

export const metadata: Metadata = {
  title: 'Günlük Çark',
  description: 'Ücretsiz günlük şans çarkı: olasılıklar açıkça gösterilir, ödüller yalnızca oyun içindir.',
  robots: { index: false, follow: false },
};

export default function WheelPage() {
  return <WheelScreen />;
}
