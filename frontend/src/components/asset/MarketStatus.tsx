'use client';

import { useNow } from '@/hooks/useNow';
import { getMarketStatus } from '@/lib/marketHours';
import { cn } from '@portfoygo/shared/format';
import type { AssetType } from '@/types';

/** "● Piyasa açık" göstergesi; dakikada bir yeniden değerlendirilir. */
export default function MarketStatus({ type, showNote = false, className }: { type: AssetType; showNote?: boolean; className?: string }) {
  const now = useNow(60_000);
  const status = getMarketStatus(type, new Date(now));

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', className)} title={status.note}>
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {status.open && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-60" />}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', status.open ? 'bg-up' : 'bg-subtle')} />
      </span>
      <span className={cn('font-medium', status.open ? 'text-up' : 'text-muted')}>{status.label}</span>
      {showNote && <span className="text-subtle">· {status.note}</span>}
    </span>
  );
}
