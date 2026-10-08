'use client';

import type { MouseEvent } from 'react';
import { StarIcon as StarOutline } from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/format';
import type { AssetType } from '@/types';

interface Props {
  type: AssetType;
  symbol: string;
  /** sm: tablo satırları (32px), md: sayfa başlığı (40px) */
  size?: 'sm' | 'md';
  className?: string;
}

/** İzleme listesine ekle/çıkar düğmesi (iyimser; hata olursa geri alınır ve bildirim gösterilir). Oturum yoksa görünmez. */
export default function WatchStar({ type, symbol, size = 'sm', className }: Props) {
  const { isWatched, toggle, enabled } = useWatchlist();
  const toast = useToast();

  if (!enabled) return null;

  const active = isWatched(type, symbol);
  const Icon = active ? StarSolid : StarOutline;

  const onClick = async (e: MouseEvent<HTMLButtonElement>) => {
    // Satır/başlık bağlantısının içinde kullanılırsa gezinmeyi tetiklemesin
    e.preventDefault();
    e.stopPropagation();
    try {
      await toggle(type, symbol);
    } catch (err) {
      toast.error('İzleme listesi güncellenemedi', {
        description: err instanceof Error && err.message ? err.message : undefined,
      });
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? `${symbol} izleme listesinden çıkar` : `${symbol} izleme listesine ekle`}
      title={active ? 'İzleme listesinden çıkar' : 'İzleme listesine ekle'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
        size === 'sm' ? 'h-8 w-8' : 'h-10 w-10 border',
        size === 'md' && (active ? 'border-transparent bg-gold-soft' : 'border-line bg-surface-2'),
        active ? 'text-gold hover:bg-gold-soft' : cn('text-subtle hover:text-gold', size === 'sm' ? 'hover:bg-surface-2' : 'hover:bg-surface-3'),
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'h-[18px] w-[18px]' : 'h-5 w-5'} aria-hidden="true" />
    </button>
  );
}
