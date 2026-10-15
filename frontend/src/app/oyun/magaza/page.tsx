import type { Metadata } from 'next';
import ShopScreen from '@/components/game/shop/ShopScreen';

export const metadata: Metadata = {
  title: 'Mağaza',
  description: 'Oynayarak kazandığın jetonlarla avatar, çerçeve ve unvan al (gerçek parayla satın alma yoktur).',
  robots: { index: false, follow: false },
};

export default function ShopPage() {
  return <ShopScreen />;
}
