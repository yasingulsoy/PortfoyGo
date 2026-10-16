'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChartPieIcon, ExclamationTriangleIcon, PlusIcon } from '@heroicons/react/20/solid';
import { cn, formatDate, formatUSD } from '@portfoygo/shared/format';
import { LinkButton } from '@portfoygo/shared/ui/Button';
import { Card, CardBody } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { Alert, Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useModelList } from '@/hooks/useModelPortfolios';
import SandboxDisclaimer from '@/components/sandbox/SandboxDisclaimer';
import ComparePanel from './ComparePanel';

const COMPARE_MAX = 3;

/** /model-portfoy: liste (≤ 5) + karşılaştırma seçimi (≤ 3) */
export default function ModelPortfolioList() {
  const { data, error, isLoading } = useModelList();
  const items = data?.items ?? [];
  const [selected, setSelected] = useState<string[] | null>(null);

  // Kullanıcı seçim yapana kadar varsayılan: ilk 3 (en az 2 portföy varsa). Silinen portföyler seçimden düşer.
  const chosen =
    selected === null ? (items.length >= 2 ? items.slice(0, COMPARE_MAX).map((i) => i.id) : []) : selected.filter((id) => items.some((i) => i.id === id));
  const toggle = (id: string) =>
    setSelected(chosen.includes(id) ? chosen.filter((x) => x !== id) : chosen.length >= COMPARE_MAX ? chosen : [...chosen, id]);

  const atLimit = !!data && items.length >= data.limit;

  return (
    <div className="space-y-4 md:space-y-6">
      <Card>
        <CardBody className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 max-w-3xl space-y-1.5 text-sm leading-relaxed text-muted">
            <p className="text-base font-semibold text-fg">100.000 USD ile dağılım kur, sonuçları karşılaştır</p>
            <p>
              Her model portföy aynı varsayımsal <span className="num font-medium text-fg">100.000 USD</span> ile başlar. Parayı hisse, kripto, döviz, emtia
              ve nakit arasında paylaştır; değer değişimlerinin toplam portföye etkisini, risk ve çeşitlendirmeyi gör. En fazla 5 portföy kurup 3 tanesini
              yan yana karşılaştırabilirsin.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1.5 md:items-end">
            {atLimit ? (
              <span className="text-xs text-gold">5 portföy sınırına ulaştın; yenisi için birini sil.</span>
            ) : (
              <LinkButton href="/model-portfoy/yeni" icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}>
                Yeni model portföy
              </LinkButton>
            )}
            {data && <span className="num text-xs text-subtle">{items.length} / {data.limit} portföy</span>}
          </div>
        </CardBody>
      </Card>

      {error ? (
        <Alert tone="error">Model portföyler yüklenemedi: {error instanceof Error ? error.message : ''}</Alert>
      ) : isLoading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ChartPieIcon />}
            title="Henüz model portföyün yok"
            description="Hazır şablonlardan biriyle (eşit ağırlık, dengeli, tamamı nakit ya da Portföy Sihirbazı önerin) başlayabilirsin."
            action={
              <LinkButton href="/model-portfoy/yeni" icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}>
                İlk portföyünü kur
              </LinkButton>
            }
          />
        </Card>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((p) => {
              const isSel = chosen.includes(p.id);
              const disabled = !isSel && chosen.length >= COMPARE_MAX;
              return (
                <li key={p.id}>
                  <Card className={cn('relative h-full transition-colors', isSel && 'border-brand')}>
                    <CardBody className="flex h-full flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/model-portfoy/${p.id}`} className="min-w-0 after:absolute after:inset-0 after:content-['']">
                          <p className="truncate text-base font-semibold text-fg hover:text-brand">{p.name}</p>
                          <p className="text-xs text-subtle">{formatDate(p.created_at)}</p>
                        </Link>
                        {p.status !== 'active' && <Badge tone="gold">Donduruldu</Badge>}
                      </div>
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <span className="num text-2xl font-semibold text-fg">{formatUSD(p.equity_usd)}</span>
                        <Delta value={p.return_pct} />
                        {p.stale && <ExclamationTriangleIcon className="h-4 w-4 text-gold" aria-label="Bazı fiyatlar güncel değil" />}
                      </div>
                      <p className="num text-xs text-muted">
                        {p.holdings_count} varlık · nakit {formatUSD(p.cash)}
                      </p>
                      <label className="relative z-10 mt-auto inline-flex w-fit cursor-pointer items-center gap-2 text-sm text-muted has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                        <input type="checkbox" className="h-4 w-4 accent-brand" checked={isSel} disabled={disabled} onChange={() => toggle(p.id)} />
                        Karşılaştır
                      </label>
                    </CardBody>
                  </Card>
                </li>
              );
            })}
          </ul>

          <section aria-labelledby="karsilastirma" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="karsilastirma" className="text-lg font-semibold text-fg">
                Alternatif dağılımların karşılaştırılması
              </h2>
              <span className="text-xs text-muted">{chosen.length} / {COMPARE_MAX} seçili</span>
            </div>
            {chosen.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
                Karşılaştırmak için yukarıdan en fazla 3 portföy seç. Farklı dağılımlar (ör. dengeli ve tamamı hisse) kurup yan yana görmek en öğretici yoldur.
              </p>
            ) : (
              <ComparePanel ids={chosen} />
            )}
          </section>
        </>
      )}
      <SandboxDisclaimer className="justify-center text-center" />
    </div>
  );
}
