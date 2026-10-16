'use client';

import { useNow } from '@/hooks/useNow';
import { useStockSessionStatus } from '@/hooks/useUsMarketSession';
import { getMarketStatus } from '@/lib/marketHours';
import { cn } from '@portfoygo/shared/format';
import type { AssetType } from '@/types';

interface Props {
  type: AssetType;
  showNote?: boolean;
  /** Hisse: "Piyasa kapalı · açılışa 3 sa 12 dk" geri sayımı */
  showCountdown?: boolean;
  className?: string;
}

/** "● Piyasa açık" göstergesi. Hisselerde sunucudaki NYSE seansına (tatil, erken kapanış, yaz saati) göre. */
export default function MarketStatus({ type, ...rest }: Props) {
  return type === 'stock' ? <StockStatus {...rest} /> : <SimpleStatus type={type} {...rest} />;
}

function SimpleStatus({ type, showNote = false, className }: Props) {
  const now = useNow(60_000);
  const status = getMarketStatus(type, new Date(now));
  return <Indicator open={status.open} label={status.label} note={showNote ? status.note : null} title={status.note} className={className} />;
}

function StockStatus({ showNote = false, showCountdown = true, className }: Omit<Props, 'type'>) {
  const status = useStockSessionStatus();
  const now = useNow(60_000);
  const note = getMarketStatus('stock', new Date(now)).note;
  return (
    <Indicator
      open={status.open}
      label={status.label}
      detail={showCountdown ? status.detail : null}
      note={showNote ? note : null}
      title={note}
      className={className}
    />
  );
}

function Indicator({
  open,
  label,
  detail,
  note,
  title,
  className,
}: {
  open: boolean;
  label: string;
  detail?: string | null;
  note?: string | null;
  title?: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs', className)} title={title} data-market-open={open}>
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {open && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-60" />}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', open ? 'bg-up' : 'bg-subtle')} />
      </span>
      <span className={cn('font-medium', open ? 'text-up' : 'text-muted')}>{label}</span>
      {detail && <span className="num text-muted">· {detail}</span>}
      {note && <span className="text-subtle">· {note}</span>}
    </span>
  );
}
