import type { Metadata } from 'next';
import SlotScreen from '@/components/game/slot/SlotScreen';

export const metadata: Metadata = {
  title: 'Slot Makinesi',
  description: 'Olasılık dersi: her sonucun olasılığı, geri ödeme oranı ve kasa avantajı açıkça gösterilir. Yalnızca oyun içi jetonla oynanır.',
  robots: { index: false, follow: false },
};

export default function SlotPage() {
  return <SlotScreen />;
}
