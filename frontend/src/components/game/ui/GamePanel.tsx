import type { ReactNode } from 'react';
import { cn } from '@portfoygo/shared/format';

export type GameAccent = 'blue' | 'green' | 'gold' | 'red' | 'purple' | 'teal' | 'orange' | 'pink';

interface Props {
  title?: ReactNode;
  /** Başlık kurdelesinin rengi */
  accent?: GameAccent;
  /** Başlığın sağındaki öğe (ör. "Tümü" bağlantısı) */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** İç boşluk (varsayılan açık) */
  padded?: boolean;
  as?: 'section' | 'div' | 'aside';
  id?: string;
}

/** Kalın kenarlıklı beyaz oyun paneli; başlık üst kenara oturan renkli kurdeledir. */
export default function GamePanel({ title, accent = 'blue', action, children, className, padded = true, as: Tag = 'section', id }: Props) {
  return (
    <Tag id={id} className={cn('g-panel', title ? 'mt-4' : '', padded && 'p-4', className)}>
      {title && (
        <div className={cn('-mt-8 mb-2 flex items-center justify-between gap-2', !padded && 'px-4 pt-4')}>
          <h2 className={cn('g-ribbon min-w-0 truncate text-base', `g-ribbon--${accent}`)}>{title}</h2>
          {action && <div className="shrink-0 pt-4">{action}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}
