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
  /**
   * Yerleşim: 'phone' telefon sahnesi (~520px, varsayılan), 'wide' tur ekranı (max-w-7xl),
   * 'full' masaüstünde ekranı dolduran lobi (telefonda yine tek sütun)
   */
  layout?: 'phone' | 'wide' | 'full';
  /** Üstte jeton / avatar çubuğu */
  topBar?: boolean;
  /** Başlığın sağındaki öğeler */
  actions?: ReactNode;
  className?: string;
}

const LAYOUT_WIDTH = {
  phone: 'max-w-[520px]',
  wide: 'max-w-7xl sm:px-6',
  full: 'max-w-[1600px] sm:px-6 lg:px-10 lg:pt-5',
} as const;

/**
 * Oyun ekranı: tam genişlik arka plan (gökyüzü / gece / altın) ve ortalanmış oyun sahnesi.
 * Telefonda tam ekran oyun gibi; masaüstünde 'phone' ortada ~520px sütun, 'full' ekranı doldurur.
 */
export default function GameScreen({ title, back, backLabel, children, background = 'sky', wide, layout, topBar, actions, className }: Props) {
  const width = LAYOUT_WIDTH[layout ?? (wide ? 'wide' : 'phone')];
  return (
    <div className={cn('g-screen', `g-bg-${background}`)}>
      <main
        id="main"
        className={cn(
          'relative mx-auto w-full px-4 pb-[max(env(safe-area-inset-bottom),2rem)] pt-[max(env(safe-area-inset-top),0.75rem)]',
          width,
          className,
        )}
      >
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
