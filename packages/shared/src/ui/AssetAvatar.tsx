import Image from 'next/image';
import type { AssetType } from '@/types';
import { cn } from '@/lib/format';

const typeTone: Record<AssetType, string> = {
  stock: 'bg-brand-soft text-brand',
  crypto: 'bg-gold-soft text-gold',
  currency: 'bg-up-soft text-up',
  commodity: 'bg-surface-3 text-muted',
};

/** Varlık simgesi: görsel varsa onu, yoksa sembolün baş harflerini gösterir. */
export default function AssetAvatar({ symbol, type, image, size = 36, className }: { symbol: string; type: AssetType; image?: string; size?: number; className?: string }) {
  if (image) {
    return (
      <Image
        src={image}
        alt=""
        width={size}
        height={size}
        className={cn('shrink-0 rounded-full bg-surface-2', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 items-center justify-center rounded-full font-mono font-semibold tracking-tight', typeTone[type], className)}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.3)) }}
    >
      {symbol.slice(0, type === 'currency' ? 3 : 2)}
    </span>
  );
}
