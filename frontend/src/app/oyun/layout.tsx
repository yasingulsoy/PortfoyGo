import type { Metadata } from 'next';
import './game.css';
import { gameFont } from '@/components/game/ui/font';
import GameShell from '@/components/game/GameShell';

export const metadata: Metadata = {
  title: { default: 'Oyun Merkezi', template: '%s · Oyun Merkezi · PortfoyGo' },
  description: 'Hızlı maçlar, düellolar, çark, görevler ve senaryolar — sanal parayla, sorumlu oyun.',
  robots: { index: false, follow: false },
};

export default function OyunLayout({ children }: { children: React.ReactNode }) {
  return <GameShell fontClass={gameFont.variable}>{children}</GameShell>;
}
