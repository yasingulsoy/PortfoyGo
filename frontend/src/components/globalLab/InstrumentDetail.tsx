'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { ArrowLeftIcon, ArrowsRightLeftIcon, BookmarkIcon as BookmarkSolid } from '@heroicons/react/20/solid';
import { BookmarkIcon, DocumentTextIcon, InformationCircleIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { cn, formatDate } from '@portfoygo/shared/format';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import { Alert, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { ApiError } from '@portfoygo/shared/api';
import Breadcrumb from '@/components/common/Breadcrumb';
import PremiumGate from '@/components/subscription/PremiumGate';
import { useCompareSelection, useLabInstrument } from '@/hooks/useGlobalLab';
import { globalLabApi, globalLabKeys } from '@/lib/globalLab';
import { FEATURES } from '@/lib/subscriptions';
import { ClassBadge, Chip, LabDisclaimer, QuoteText, RiskMeter } from './bits';
import { RISK_LABELS, classLabel, currencyLabel, money, vehicleLabel } from './model';

/** /global-lab/[symbol]: sınıflandırma, açıklama, (bağlıysa) güncel fiyat, araştırma notları ve liste / karşılaştırma eylemleri. */
export default function InstrumentDetail({ symbol }: { symbol: string }) {
  const { data, error, isLoading, mutate } = useLabInstrument(symbol);
  const { mutate: mutateKey } = useSWRConfig();
  const compare = useCompareSelection();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const crumbs = [
    { label: 'Panel', href: '/' },
    { label: 'Global Portföy Lab', href: '/global-lab' },
    { label: symbol.toUpperCase() },
  ];

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (error || !data) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <div className="space-y-4 md:space-y-6">
        <PageHeader title={symbol.toUpperCase()} actions={<Breadcrumb items={crumbs} />} />
        <Card>
          <EmptyState
            icon={<InformationCircleIcon />}
            title={missing ? 'Araç katalogda bulunamadı' : 'Araç yüklenemedi'}
            description={missing ? 'Kaldırılmış ya da pasif olabilir.' : error instanceof Error ? error.message : undefined}
            action={<LinkButton href="/global-lab">Kataloğa dön</LinkButton>}
          />
        </Card>
      </div>
    );
  }

  const i = data.instrument;
  const inCompare = compare.ids.includes(i.id);

  const toggleList = async () => {
    setBusy(true);
    try {
      if (data.in_research_list) await globalLabApi.removeFromList(i.id);
      else await globalLabApi.addToList(i.id);
      await Promise.all([mutate(), mutateKey(globalLabKeys.researchList)]);
      toast.success(data.in_research_list ? 'Araştırma listesinden çıkarıldı' : 'Araştırma listesine eklendi');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İşlem yapılamadı');
    } finally {
      setBusy(false);
    }
  };

  const rows: { label: string; value: ReactNode }[] = [
    { label: 'Araç türü', value: vehicleLabel(i.vehicle) },
    { label: 'Varlık sınıfı', value: <ClassBadge assetClass={i.asset_class} /> },
    { label: 'Alt sınıf', value: i.sub_class ?? '—' },
    { label: 'Bölge', value: i.region },
    { label: 'Ülke', value: i.country ?? 'Çok ülkeli' },
    { label: 'Para birimi', value: `${i.currency} · ${currencyLabel(i.currency)}` },
    {
      label: 'Risk seviyesi',
      value: (
        <span className="inline-flex items-center gap-2">
          <RiskMeter level={i.risk_level} />
          <span className="text-xs text-muted">{RISK_LABELS[i.risk_level]}</span>
        </span>
      ),
    },
    { label: 'Yıllık gider oranı', value: i.expense_ratio_pct === null ? '—' : `%${i.expense_ratio_pct.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}` },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        eyebrow={`${classLabel(i.asset_class)} · ${i.region}`}
        title={
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="num">{i.symbol}</span>
            <span className="text-base font-normal text-muted sm:text-lg">{i.name}</span>
          </span>
        }
        actions={<Breadcrumb items={crumbs} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.back()} icon={<ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />}>
          Geri
        </Button>
        <Button
          variant={data.in_research_list ? 'secondary' : 'primary'}
          size="sm"
          loading={busy}
          onClick={() => void toggleList()}
          icon={data.in_research_list ? <BookmarkSolid className="h-4 w-4" aria-hidden="true" /> : <BookmarkIcon className="h-4 w-4" aria-hidden="true" />}
        >
          {data.in_research_list ? 'Listemde' : 'Araştırma listesine ekle'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={inCompare}
          onClick={() => {
            if (compare.toggle(i.id) === 'full') toast.info('En fazla 4 araç karşılaştırılabilir');
          }}
          icon={<ArrowsRightLeftIcon className="h-4 w-4" aria-hidden="true" />}
        >
          {inCompare ? 'Karşılaştırmada' : 'Karşılaştırmaya ekle'}
        </Button>
        {compare.ids.length > 0 && (
          <Link href="/global-lab?tab=siniflandir" className="text-sm font-medium text-brand hover:underline">
            Karşılaştırmayı aç ({compare.ids.length})
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
        <Card className="min-w-0 overflow-hidden lg:col-span-2">
          <CardHeader title="Sınıflandırma" description="Katalogdaki tanımlayıcı bilgiler" />
          <dl className="grid grid-cols-1 gap-x-6 border-t border-line px-5 py-2 sm:grid-cols-2 sm:px-6">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
                <dt className="text-sm text-muted">{r.label}</dt>
                <dd className="min-w-0 text-right text-sm font-medium text-fg">{r.value}</dd>
              </div>
            ))}
          </dl>
          {i.description_tr && <p className="border-t border-line px-5 py-4 text-sm leading-relaxed text-fg sm:px-6">{i.description_tr}</p>}
          <p className="border-t border-line bg-surface-2 px-5 py-3 text-xs leading-relaxed text-subtle sm:px-6">
            Kaynak: {i.data_source} · {i.license_note}
          </p>
        </Card>

        <Card className="h-fit min-w-0 p-5 sm:p-6">
          <p className="text-sm text-muted">Uygulamadaki güncel fiyat</p>
          {i.quote ? (
            <>
              <p className="num mt-1 text-2xl font-semibold text-fg">{money(i.quote.price, i.quote.currency)}</p>
              <QuoteText quote={i.quote} className="mt-1 items-start" />
              <p className="mt-3 text-xs text-subtle">
                Bağlantı: {i.provider_symbol}. Fiyat uygulamanın kendi piyasa verisinden gelir; aracın borsa fiyatıyla birebir aynı olmayabilir.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              {i.provider_symbol
                ? 'Bağlı fiyat şu an güncel değil.'
                : 'Bu araç için uygulamada fiyat verisi yok; katalog yalnızca sınıflandırma ve araştırma amaçlıdır.'}
            </p>
          )}
        </Card>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader title="Araştırma notları" description={`${data.notes.length} not`} icon={<DocumentTextIcon />} />
        {data.notes.length === 0 ? (
          <EmptyState className="border-t border-line py-8" icon={<DocumentTextIcon />} title="Bu araç için henüz not yok" />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {data.notes.map((n) => (
              <li key={n.id} className="px-5 py-4 sm:px-6">
                <p className="flex items-center gap-2 font-medium text-fg">
                  {data.notes_locked && <LockClosedIcon className="h-4 w-4 shrink-0 text-subtle" aria-label="Kilitli" />}
                  {n.title}
                </p>
                <p className="mt-0.5 text-xs text-subtle">
                  {n.author ? `${n.author} · ` : ''}
                  {formatDate(n.created_at)}
                </p>
                {n.body && <p className={cn('mt-2 whitespace-pre-line text-sm leading-relaxed text-fg')}>{n.body}</p>}
              </li>
            ))}
          </ul>
        )}
        {data.notes_locked && data.notes.length > 0 && (
          <div className="border-t border-line p-4 sm:p-5">
            <PremiumGate
              feature={FEATURES.GLOBAL_LAB_NOTES}
              variant="compact"
              title="Notların tam metni Premium'da"
              description="Ücretsiz planda not başlıklarını görürsün; analiz metinleri Premium ile açılır."
            >
              {null}
            </PremiumGate>
          </div>
        )}
      </Card>

      {data.notes_locked === false && data.notes.length > 0 && (
        <Alert tone="info">Notlar ekibin eğitim amaçlı yorumlarıdır; alım-satım önerisi değildir.</Alert>
      )}
      <LabDisclaimer />
    </div>
  );
}
