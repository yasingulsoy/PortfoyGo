import type { Metadata } from 'next';
import '../oyun/game.css';
import { gameFont } from '@/components/game/ui/font';

export const metadata: Metadata = {
  title: 'Canlı yayın',
  robots: { index: false, follow: false },
};

/** Yayın (OBS) katmanı: herkese açık, kabuksuz; oyun derisi ve gece paleti. */
export default function YayinLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-skin="game" className={`${gameFont.variable} g-force-night min-h-dvh`}>
      {children}
    </div>
  );
}
