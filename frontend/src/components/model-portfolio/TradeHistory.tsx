'use client';

import { useState } from 'react';
import { cn, formatDateTime, formatQuantity, formatUSD } from '@portfoygo/shared/format';
import { Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { ClockIcon } from '@heroicons/react/24/outline';
import { DataTable, TBody, THead, Td, Th, Tr } from '@/components/common/Table';
import { useModelTrades } from '@/hooks/useModelPortfolios';

const REASON: Record<string, { label: string; tone: 'neutral' | 'brand' | 'gold' }> = {
  manual: { label: 'Manuel', tone: 'neutral' },
  rebalance: { label: 'Dengeleme', tone: 'brand' },
  initial: { label: 'Kurulum', tone: 'gold' },
};

const PAGE = 15;

/** İşlem geçmişi (en yeni önce, sayfalı). */
export default function TradeHistory({ portfolioId }: { portfolioId: string }) {
  const [page, setPage] = useState(0);
  const { data, isLoading } = useModelTrades(portfolioId, PAGE, page * PAGE);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  if (isLoading && !data) {
    return (
      <div className="space-y-2 px-5 pb-5 sm:px-6">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (!data || data.items.length === 0) {
    return <EmptyState icon={<ClockIcon />} title="Henüz işlem yok" description="Alım-satım ve dengeleme işlemleri burada listelenir." />;
  }
  return (
    <div className="pb-4">
      <DataTable label="İşlem geçmişi">
        <THead>
          <Th>İşlem</Th>
          <Th align="right" className="hidden sm:table-cell">
            Miktar
          </Th>
          <Th align="right" className="hidden md:table-cell">
            Fiyat
          </Th>
          <Th align="right">Tutar</Th>
          <Th align="right" className="hidden sm:table-cell">
            Komisyon
          </Th>
          <Th align="right" className="hidden lg:table-cell">
            Tarih
          </Th>
        </THead>
        <TBody>
          {data.items.map((t) => (
            <Tr key={t.id}>
              <Td>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn('text-xs font-semibold', t.side === 'buy' ? 'text-up' : 'text-down')}>{t.side === 'buy' ? 'AL' : 'SAT'}</span>
                  <span className="font-medium text-fg">{t.symbol}</span>
                  <Badge tone={REASON[t.reason]?.tone ?? 'neutral'}>{REASON[t.reason]?.label ?? t.reason}</Badge>
                </div>
                <p className="num mt-0.5 text-[11px] text-subtle lg:hidden">{formatDateTime(t.created_at)}</p>
              </Td>
              <Td align="right" className="num hidden whitespace-nowrap text-muted sm:table-cell">
                {formatQuantity(t.quantity)}
              </Td>
              <Td align="right" className="num hidden whitespace-nowrap text-muted md:table-cell">
                {formatUSD(t.price_usd, { precise: true })}
              </Td>
              <Td align="right" className="num whitespace-nowrap text-fg">
                {formatUSD(t.gross_usd)}
              </Td>
              <Td align="right" className="num hidden whitespace-nowrap text-muted sm:table-cell">
                {formatUSD(t.commission_usd)}
              </Td>
              <Td align="right" className="num hidden whitespace-nowrap text-muted lg:table-cell">
                {formatDateTime(t.created_at)}
              </Td>
            </Tr>
          ))}
        </TBody>
      </DataTable>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between px-5 text-xs text-muted sm:px-6">
          <span className="num">
            {page + 1} / {pages} · {total} işlem
          </span>
          <div className="flex gap-1.5">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="h-8 rounded-lg border border-line px-2.5 font-medium text-fg disabled:opacity-40">
              Önceki
            </button>
            <button
              type="button"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 rounded-lg border border-line px-2.5 font-medium text-fg disabled:opacity-40"
            >
              Sonraki
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
