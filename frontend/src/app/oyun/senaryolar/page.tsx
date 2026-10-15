import type { Metadata } from 'next';
import ScenariosScreen from '@/components/game/scenarios/ScenariosScreen';

export const metadata: Metadata = {
  title: 'Senaryolar',
  description: 'Tarihî piyasa olaylarını ve eğitim amaçlı sentetik krizleri kısa arena turlarında yeniden oyna (sanal para).',
  robots: { index: false, follow: false },
};

export default function ScenariosPage() {
  return <ScenariosScreen />;
}
