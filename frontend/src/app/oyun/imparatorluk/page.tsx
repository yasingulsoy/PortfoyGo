import type { Metadata } from 'next';
import EmpireScreen from '@/components/game/idle/EmpireScreen';

export const metadata: Metadata = {
  title: 'Yatırım İmparatorluğu',
  description: 'Boşta kazanan yatırım imparatorluğunu kur: binalar al, yükselt, halka arz et. Gelirler gerçek piyasa hareketlerinden etkilenir (sanal para).',
  robots: { index: false, follow: false },
};

export default function EmpirePage() {
  return <EmpireScreen />;
}
