import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@portfoygo/shared/format';

/**
 * TailAdmin tablo ilkelleri: kart iç boşluğuna hizalı tablo, başlıkta üst-alt ince çizgi,
 * satırlar arasında ayraç. Dar ekranlarda tablo kendi kabında yatay kayar (sayfa kaymaz).
 */
export function DataTable({
  label,
  children,
  className,
  tableClassName,
}: {
  /** Ekran okuyucular için tablo başlığı */
  label: string;
  children: ReactNode;
  className?: string;
  tableClassName?: string;
}) {
  return (
    <div className={cn('overflow-x-auto px-5 sm:px-6', className)}>
      <table className={cn('w-full text-sm', tableClassName)}>
        <caption className="sr-only">{label}</caption>
        {children}
      </table>
    </div>
  );
}

export function THead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <thead className={className}>
      <tr className="border-y border-line">{children}</tr>
    </thead>
  );
}

export function TBody({ children, className }: { children: ReactNode; className?: string }) {
  return <tbody className={cn('divide-y divide-line', className)}>{children}</tbody>;
}

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center';
}

export function Th({ align = 'left', className, children, ...rest }: ThProps) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap px-3 py-3 text-xs font-medium text-muted first:pl-0 last:pr-0',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center';
}

export function Td({ align = 'left', className, children, ...rest }: TdProps) {
  return (
    <td
      className={cn(
        'px-3 py-3.5 align-middle first:pl-0 last:pr-0',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

export function Tr({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors', className)} {...rest} />;
}
