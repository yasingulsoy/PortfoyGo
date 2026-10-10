import { useId } from 'react';
import { cn } from '@portfoygo/shared/format';

interface Props {
  values: readonly number[] | null | undefined;
  width?: number;
  height?: number;
  /** Veri yokken (yükleniyor) iskelet göster */
  loading?: boolean;
  /** Çizginin altını yumuşak bir gradyanla doldur */
  area?: boolean;
  className?: string;
  /** Verilirse ekran okuyucuya açıklama olarak sunulur; verilmezse dekoratiftir. */
  label?: string;
}

/** Yalnızca sonlu değerler. */
function finiteValues(values: readonly number[]): number[] {
  return values.filter((v) => typeof v === 'number' && Number.isFinite(v));
}

/** SVG polyline koordinatları (0..width, 0..height); y ekseni ters (yüksek değer yukarıda). */
export function sparklinePoints(values: readonly number[], width: number, height: number, pad = 1.5): string {
  const finite = finiteValues(values);
  if (finite.length < 2) return '';
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  const step = width / (finite.length - 1);
  return finite
    .map((v, i) => {
      const x = i * step;
      // Düz seride çizgiyi ortala
      const y = max === min ? height / 2 : pad + (1 - (v - min) / span) * (height - pad * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

/** İlk → son değişimin yönü (sonlu değerlere göre). */
export function sparklineTrend(values: readonly number[] | null | undefined): 'up' | 'down' | 'flat' {
  const finite = values ? finiteValues(values) : [];
  if (finite.length < 2) return 'flat';
  const first = finite[0];
  const last = finite[finite.length - 1];
  return last > first ? 'up' : last < first ? 'down' : 'flat';
}

const toneClass = { up: 'text-up', down: 'text-down', flat: 'text-subtle' } as const;

/** Küçük satır içi fiyat eğrisi; ilk→son değişime göre yeşil/kırmızı. Grafik kütüphanesi kullanmaz. */
export default function Sparkline({ values, width = 72, height = 24, loading, area = false, className, label }: Props) {
  const gradientId = useId();
  const points = values ? sparklinePoints(values, width, height) : '';

  if (!points) {
    return loading ? (
      <span aria-hidden="true" className={cn('shimmer inline-block rounded bg-surface-2', className)} style={{ width, height }} />
    ) : (
      <span aria-hidden="true" className={cn('inline-flex items-center justify-center text-xs text-subtle', className)} style={{ width, height }}>
        —
      </span>
    );
  }

  const tone = toneClass[sparklineTrend(values)];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('inline-block shrink-0 overflow-visible', tone, className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {area && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <polygon points={`0,${height} ${points} ${width},${height}`} fill={`url(#${gradientId})`} stroke="none" />
        </>
      )}
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
