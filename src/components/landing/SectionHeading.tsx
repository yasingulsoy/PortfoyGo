import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

/** Tanıtım sayfası bölüm başlığı: küçük üst etiket + başlık + açıklama. */
export default function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  align = 'left',
  className,
}: {
  id?: string;
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <header className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-[28px] font-semibold leading-[1.15] tracking-tight text-fg sm:text-4xl">
        {title}
      </h2>
      {description && <p className="mt-3 text-[15px] leading-relaxed text-muted sm:text-base">{description}</p>}
    </header>
  );
}
