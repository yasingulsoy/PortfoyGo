import type { ReactNode } from 'react';
import { cn } from '@portfoygo/shared/format';
import { BackButton } from './bits';
import GameTopBar from './GameTopBar';

export type GameBackground = 'sky' | 'night' | 'gold';

interface Props {
  title?: ReactNode;
  /** Geri düğmesinin hedefi */
  back?: string;
  backLabel?: string;
  children: ReactNode;
  background?: GameBackground;
  /** Geniş yerleşim (tur ekranı); varsayılan telefon sahnesi (~520px) */
  wide?: boolean;
  /** Üstte jeton / avatar çubuğu */
  topBar?: boolean;
  /** Başlığın sağındaki öğeler */
  actions?: ReactNode;
  className?: string;
}

/**
 * Oyun ekranı: tam genişlik arka plan (gökyüzü / gece / altın) ve ortalanmış "telefon sahnesi".
 * Telefonda tam ekran oyun gibi; masaüstünde ortada ~520px sütun.
 */
export default function GameScreen({ title, back, backLabel, children, background = 'sky', wide, topBar, actions, className }: Props) {
  return (
    <div className={cn('g-screen', `g-bg-${background}`)}>
      <main id="main" className={cn('relative mx-auto w-full px-4 pb-[max(env(safe-area-inset-bottom),2rem)] pt-3', wide ? 'max-w-7xl sm:px-6' : 'max-w-[520px]', className)}>
        {topBar && <GameTopBar back={back} backLabel={backLabel} />}
        {(title || actions || (!topBar && back)) && (
          <header className="mb-4 flex min-h-[46px] items-center gap-3">
            {!topBar && back && <BackButton href={back} label={backLabel} />}
            {title && <h1 className="g-title min-w-0 flex-1 truncate py-1 text-[28px] sm:text-[32px]">{title}</h1>}
            {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
          </header>
        )}
        {children}
      </main>
    </div>
  );
}
