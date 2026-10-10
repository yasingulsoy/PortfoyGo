import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ChevronDownIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import Spinner from '@portfoygo/shared/ui/Spinner';

/* TailAdmin araç çubuğu denetimleri: 40px yükseklik, ince kenarlık, yumuşak odak halkası. */

const controlBase =
  'h-10 w-full rounded-lg border border-line text-sm text-fg shadow-card transition-[border-color,box-shadow] hover:border-line-strong focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10';

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Görünmeyen erişilebilir etiket */
  label: string;
  className?: string;
}) {
  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{label}</span>
      <MagnifyingGlassIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(controlBase, 'bg-transparent pl-10 pr-3.5 placeholder:text-subtle')}
      />
    </label>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  icon,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
  /** Sol taraftaki ikon (ör. sıralama) */
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{label}</span>
      {icon && (
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
          {icon}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={cn(controlBase, 'appearance-none bg-surface pr-9', icon ? 'pl-10' : 'pl-3.5')}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
    </label>
  );
}

/** TailAdmin "outline" araç çubuğu düğmesi (40px). */
export const toolbarButtonClass =
  'inline-flex h-10 shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-surface px-4 text-sm font-medium text-fg shadow-card ring-1 ring-inset ring-line-strong transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-50';

interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  loading?: boolean;
  /** Yalnızca ikon: kare düğme (aria-label zorunlu) */
  iconOnly?: boolean;
}

export function ToolbarButton({ icon, loading, iconOnly, className, children, disabled, type = 'button', ...rest }: ToolbarButtonProps) {
  return (
    <button type={type} className={cn(toolbarButtonClass, iconOnly && 'w-10 px-0', className)} disabled={disabled || loading} {...rest}>
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
}
