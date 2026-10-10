'use client';

import { ArrowRightIcon } from '@heroicons/react/20/solid';
import { ClockIcon } from '@heroicons/react/24/outline';
import { cn, formatDateTime } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { DataTable, TBody, THead, Td, Th, Tr } from '@/components/common/Table';
import { useAdvisorPlans } from '@/hooks/useAdvisor';
import { pct } from './model';

/** Geçmiş öneriler: tarih, profil, beklenen getiri, tipik maksimum düşüş, uygulandı rozeti. */
export default function PastPlans({ onOpen, activeId, className }: { onOpen: (id: string) => void; activeId?: string | null; className?: string }) {
  const { data, error, isLoading, mutate } = useAdvisorPlans(10);

  return (
    <Card className={cn('min-w-0 overflow-hidden', className)}>
      <CardHeader icon={<ClockIcon />} title="Geçmiş öneriler" description="Son 10 hesaplama" />
      {isLoading && !data ? (
        <div className="space-y-3 px-5 pb-6 sm:px-6">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : error && !data ? (
        <div className="px-5 pb-6 sm:px-6">
          <Alert tone="error">
            Geçmiş öneriler yüklenemedi.{' '}
            <button type="button" onClick={() => void mutate()} className="font-semibold underline underline-offset-2">
              Tekrar dene
            </button>
          </Alert>
        </div>
      ) : !data?.length ? (
        <EmptyState icon={<ClockIcon />} title="Henüz öneri yok" description="Hesapladığın öneriler burada listelenir; istediğinde yeniden açabilirsin." />
      ) : (
        <DataTable label="Geçmiş öneriler" className="pb-2">
          <THead>
            <Th>Tarih</Th>
            <Th className="hidden sm:table-cell">Profil</Th>
            <Th align="right">Getiri</Th>
            <Th align="right" className="hidden md:table-cell">
              Tipik düşüş
            </Th>
            <Th align="right">
              <span className="sr-only">İşlem</span>
            </Th>
          </THead>
          <TBody>
            {data.map((p) => (
              <Tr key={p.id} className={cn(p.id === activeId && 'bg-brand-soft/40')}>
                <Td>
                  <p className="num whitespace-nowrap text-fg">{formatDateTime(p.created_at)}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted sm:hidden">{p.profile.label}</span>
                    {p.applied_at && <Badge tone="up">Uygulandı</Badge>}
                  </div>
                </Td>
                <Td className="hidden sm:table-cell">
                  <span className="text-fg">{p.profile.label}</span>
                </Td>
                <Td align="right" className="num whitespace-nowrap text-fg">
                  {pct(p.metrics.expected_return, { sign: true })}
                </Td>
                <Td align="right" className="num hidden whitespace-nowrap text-down md:table-cell">
                  -{pct(p.metrics.max_drawdown_median)}
                </Td>
                <Td align="right">
                  <button
                    type="button"
                    onClick={() => onOpen(p.id)}
                    aria-current={p.id === activeId ? 'true' : undefined}
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-brand hover:bg-brand-soft"
                    aria-label={`${formatDateTime(p.created_at)} tarihli öneriyi aç`}
                  >
                    Aç <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </DataTable>
      )}
    </Card>
  );
}
