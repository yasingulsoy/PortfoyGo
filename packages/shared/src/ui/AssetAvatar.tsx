import Image from 'next/image';
import type { AssetType } from '../types';
import { assetLogoSrc } from '../assetLogos';
import { cn } from '../format';

const typeTone: Record<AssetType, string> = {
  stock: 'bg-brand-soft text-brand',
  crypto: 'bg-gold-soft text-gold',
  currency: 'bg-up-soft text-up',
  commodity: 'bg-surface-3 text-muted',
};

/**
 * Logo çerçevesi: yuvarlak kırpma + yüklenirken hafif zemin. İnce iç halka (fg/10) logonun kenarını
 * açık temada koyu, koyu temada açık bir çizgiyle belirginleştirir (siyah marka dairesi koyu zeminde,
 * beyaz bayrak / beyaz daire açık zeminde kaybolmaz).
 */
const frame =
  'relative inline-block shrink-0 overflow-hidden rounded-full bg-surface-2 after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:ring-1 after:ring-inset after:ring-fg/10';

/**
 * Varlık simgesi. Öncelik: depodaki yerel logo (packages/shared/src/assetLogos.ts manifesti) → `image`
 * (ör. sağlayıcının verdiği kripto görseli; yalnızca yerel logo yoksa) → sembolün baş harfleri.
 * Dekoratiftir (alt=""): sembol / ad her zaman yanında yazılıdır.
 */
export default function AssetAvatar({ symbol, type, image, size = 36, className }: { symbol: string; type: AssetType; image?: string; size?: number; className?: string }) {
  const local = assetLogoSrc(type, symbol);
  const src = local ?? (image || null);
  if (src) {
    return (
      <span aria-hidden="true" className={cn(frame, className)} style={{ width: size, height: size }}>
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          // Yerel SVG'ler olduğu gibi sunulur (Next görüntü optimizasyonu SVG'yi işlemez)
          unoptimized={local !== null}
          loading="lazy"
          draggable={false}
          className="block size-full object-cover"
        />
      </span>
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
