'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, ArrowRightIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import { useLivePortfolio } from '@/context/PortfolioContext';
import { assetHref } from '@/components/market/MarketTable';
import { cn, formatDateTime } from '@portfoygo/shared/format';
import { Card } from '@portfoygo/shared/ui/Card';
import { LinkButton } from '@portfoygo/shared/ui/Button';
import { Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

const PAGE_SIZE = 8;

/** 1 … 4 5 6 … 10 biçiminde sayfa listesi. */
export function pageList(current: number, total: number): Array<number | 'gap'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: Array<number | 'gap'> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push('gap');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push('gap');
  out.push(total);
  return out;
}

const th = 'py-3 text-left text-xs font-medium text-muted whitespace-nowrap';

/** Panel: son işlemler tablosu (arama + sayfalama), TailAdmin "Latest Transactions". */
export default function RecentTransactionsCard({ className }: { className?: string }) {
  const dc = useDisplayCurrency();
  const { transactions, loaded, market } = useLivePortfolio();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    if (!q) return transactions;
    return transactions.filter((t) => t.symbol.toLocaleLowerCase('tr').includes(q) || t.name.toLocaleLowerCase('tr').includes(q));
  }, [transactions, query]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <Card className={cn('min-w-0 overflow-hidden', className)}>
      <div className="flex flex-col gap-3 px-5 pb-4 pt-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg">Son işlemler</h2>
          <p className="mt-1 text-sm text-muted">Gerçekleşen alım ve satımların</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative block min-w-0 flex-1 sm:w-60 sm:flex-none">
            <span className="sr-only">İşlemlerde ara</span>
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Ara…"
              className="h-11 w-full rounded-lg border border-line bg-transparent pl-10 pr-3 text-sm text-fg shadow-card placeholder:text-subtle focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10"
            />
          </label>
          <LinkButton href="/transactions" variant="secondary" className="shrink-0">
            Tümü
          </LinkButton>
        </div>
      </div>

      {!loaded ? (
        <div className="space-y-3 border-t border-line px-5 py-4 sm:px-6" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          className="border-t border-line"
          icon={<ArrowsRightLeftIcon />}
          title={query.trim() ? 'Eşleşen işlem yok' : 'Henüz işlem yapmadın'}
          description={query.trim() ? `"${query.trim()}" için sonuç bulunamadı.` : 'Piyasalardan bir varlık seçip ilk alımını yaptığında burada görünür.'}
          action={!query.trim() ? <LinkButton href="/markets" size="sm">Piyasalara git</LinkButton> : undefined}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line">
                  <th scope="col" className={cn(th, 'pl-5 pr-3 sm:pl-6')}>Varlık</th>
                  <th scope="col" className={cn(th, 'hidden px-3 md:table-cell')}>Tarih</th>
                  <th scope="col" className={cn(th, 'px-3 text-right sm:text-left')}>Tutar</th>
                  <th scope="col" className={cn(th, 'hidden px-3 sm:table-cell')}>Tür</th>
                  <th scope="col" className={cn(th, 'hidden pl-3 pr-6 lg:table-cell')}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => {
                  const live = market.find(t.assetType, t.symbol);
                  const buy = t.type === 'buy';
                  return (
                    <tr key={t.id} className="border-b border-line last:border-b-0">
                      <td className="py-3.5 pl-5 pr-3 sm:pl-6">
                        <Link href={assetHref({ type: t.assetType, symbol: t.symbol, coinId: live?.coinId })} className="group flex min-w-0 items-center gap-3">
                          <AssetAvatar symbol={t.symbol} type={t.assetType} image={live?.image} size={32} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-fg group-hover:text-brand">
                              {t.symbol} {buy ? 'alındı' : 'satıldı'}
                            </span>
                            <span className="block truncate text-xs text-muted md:hidden">{formatDateTime(t.createdAt)}</span>
                            <span className="hidden max-w-[16rem] truncate text-xs text-muted md:block">{t.name}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="num hidden whitespace-nowrap px-3 py-3.5 text-muted md:table-cell">{formatDateTime(t.createdAt)}</td>
                      <td className="num whitespace-nowrap px-3 py-3.5 text-right font-medium text-fg sm:text-left">{dc.money(t.totalAmount)}</td>
                      <td className="hidden px-3 py-3.5 sm:table-cell">
                        <Badge tone={buy ? 'brand' : 'gold'}>{buy ? 'Alış' : 'Satış'}</Badge>
                      </td>
                      <td className="hidden py-3.5 pl-3 pr-6 lg:table-cell">
                        <Badge tone="up">Tamamlandı</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav aria-label="Sayfalama" className="flex items-center justify-between gap-2 border-t border-line px-5 py-4 sm:px-6">
              <button
                type="button"
                onClick={() => setPage(current - 1)}
                disabled={current <= 1}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium text-fg shadow-card transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
                <span className="max-sm:sr-only">Önceki</span>
              </button>
              <span className="num text-sm text-muted sm:hidden">
                {current} / {pages}
              </span>
              <ul className="hidden items-center gap-1 sm:flex">
                {pageList(current, pages).map((p, i) =>
                  p === 'gap' ? (
                    <li key={`gap-${i}`} className="px-1 text-sm text-muted" aria-hidden="true">
                      …
                    </li>
                  ) : (
                    <li key={p}>
                      <button
                        type="button"
                        onClick={() => setPage(p)}
                        aria-current={p === current ? 'page' : undefined}
                        aria-label={`Sayfa ${p}`}
                        className={cn(
                          'num flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium transition-colors',
                          p === current ? 'bg-brand text-brand-fg' : 'text-muted hover:bg-brand-soft hover:text-brand',
                        )}
                      >
                        {p}
                      </button>
                    </li>
                  ),
                )}
              </ul>
              <button
                type="button"
                onClick={() => setPage(current + 1)}
                disabled={current >= pages}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium text-fg shadow-card transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                <span className="max-sm:sr-only">Sonraki</span>
                <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </nav>
          )}
        </>
      )}
    </Card>
  );
}
