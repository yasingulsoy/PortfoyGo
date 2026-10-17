import type { ReactNode } from 'react';
import { cn } from '@portfoygo/shared/format';

/** İki sütunlu yerleşimde sütun oranı (12 sütunluk ızgarada sol / sağ) */
export type GameColumnsSplit = '5/7' | '4/8' | '6/6' | '7/5';

interface Props {
  /** Sol sütun (telefonda ilk sırada) */
  main: ReactNode;
  /** Sağ sütun; `extra` varsa xl'de orta sütun */
  side?: ReactNode;
  /** lg'de sağ sütunun altında, xl'de üçüncü sütun */
  extra?: ReactNode;
  /** İki sütunlu oran (yalnızca `extra` yokken) */
  split?: GameColumnsSplit;
  /** Sol sütun masaüstünde kaydırırken sabit kalsın (yalnızca ekrandan kısa içerik için) */
  stickyMain?: boolean;
  /** Sütun içi dikey boşluk */
  gap?: 'md' | 'lg';
  className?: string;
  mainClassName?: string;
  sideClassName?: string;
  extraClassName?: string;
  /** Sütunların erişilebilir adları (ör. bölge etiketi gerekiyorsa) */
  mainLabel?: string;
  sideLabel?: string;
  extraLabel?: string;
}

const SPLIT: Record<GameColumnsSplit, { main: string; side: string }> = {
  '5/7': { main: 'lg:col-span-5', side: 'lg:col-span-7 lg:col-start-6' },
  '4/8': { main: 'lg:col-span-5 xl:col-span-4', side: 'lg:col-span-7 lg:col-start-6 xl:col-span-8 xl:col-start-5' },
  '6/6': { main: 'lg:col-span-6', side: 'lg:col-span-6 lg:col-start-7' },
  '7/5': { main: 'lg:col-span-7', side: 'lg:col-span-5 lg:col-start-8' },
};

const GAP = { md: 'gap-5', lg: 'gap-6' } as const;

/**
 * Oyun ekranları için duyarlı sütun yerleşimi.
 * Telefonda tek sütun (main → side → extra; kod sırası = görsel sıra).
 * lg (≥1024px): iki sütun (sol main, sağ side ve altında extra).
 * xl (≥1280px): `extra` varsa üç eşit sütun, yoksa iki sütun (`split`).
 * Masaüstü yerleşimi yalnızca ızgara yerleşimiyle yapılır; DOM sırası değişmez.
 */
export default function GameColumns({
  main,
  side,
  extra,
  split = '5/7',
  stickyMain,
  gap = 'md',
  className,
  mainClassName,
  sideClassName,
  extraClassName,
  mainLabel,
  sideLabel,
  extraLabel,
}: Props) {
  const three = extra != null && extra !== false;
  const g = GAP[gap];
  // @container: sütun içindeki bileşenler sütun genişliğine göre uyarlanabilir (@md:, @2xl: …)
  const col = cn('@container flex min-w-0 flex-col', g);
  return (
    <div
      className={cn(
        'flex flex-col lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-8 xl:gap-x-10',
        g,
        three && 'lg:grid-rows-[auto_1fr]',
        className,
      )}
    >
      <div
        role={mainLabel ? 'region' : undefined}
        aria-label={mainLabel}
        className={cn(
          col,
          three ? 'lg:col-span-5 lg:row-[1/span_2] xl:col-span-4' : SPLIT[split].main,
          stickyMain && 'lg:sticky lg:top-4',
          mainClassName,
        )}
      >
        {main}
      </div>
      {side != null && side !== false && (
        <div
          role={sideLabel ? 'region' : undefined}
          aria-label={sideLabel}
          className={cn(
            col,
            three ? 'lg:col-span-7 lg:col-start-6 lg:row-[1] xl:col-span-4 xl:col-start-5 xl:row-[1/span_2]' : SPLIT[split].side,
            sideClassName,
          )}
        >
          {side}
        </div>
      )}
      {three && (
        <div
          role={extraLabel ? 'region' : undefined}
          aria-label={extraLabel}
          className={cn(col, 'lg:col-span-7 lg:col-start-6 lg:row-[2] xl:col-span-4 xl:col-start-9 xl:row-[1/span_2]', extraClassName)}
        >
          {extra}
        </div>
      )}
    </div>
  );
}
