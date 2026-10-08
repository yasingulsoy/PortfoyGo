'use client';

import { useState } from 'react';
import { cn } from '@/lib/format';

/** Değer değiştiğinde yönüne göre kısa bir renk vurgusu yapan fiyat hücresi. */
export default function PriceTick({ value, children, className }: { value: number | null; children: React.ReactNode; className?: string }) {
  const [prev, setPrev] = useState(value);
  const [dir, setDir] = useState<'up' | 'down' | null>(null);

  // Önceki render'daki değeri saklama (React'in önerdiği render-sırası güncelleme kalıbı)
  if (value !== prev) {
    setPrev(value);
    if (value != null && prev != null) setDir(value > prev ? 'up' : 'down');
  }

  return (
    <span key={value ?? 'none'} className={cn('num -mx-1 rounded px-1', dir && `flash-${dir}`, className)}>
      {children}
    </span>
  );
}
