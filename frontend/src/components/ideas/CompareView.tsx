import type { ReactNode } from 'react';
import Link from 'next/link';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import { formatDateTime, formatPercent } from '@portfoygo/shared/format';
import { HORIZON_LABELS, formatDay, formatQuote, ideaHref, performanceLabel } from '@/lib/ideas';
import type { IdeaDetail } from '@/types/ideas';
import { AuthorChip, OutcomeBadge, PerfValue, ScopeBadge, StanceChip, StatusBadge } from './parts';

type Row = { label: string; render: (i: IdeaDetail) => ReactNode; long?: boolean };

const ROWS: Row[] = [
  { label: 'Durum', render: (i) => <StatusBadge card={i} /> },
  { label: 'Vade', render: (i) => HORIZON_LABELS[i.horizon] },
  { label: 'Kapsam', render: (i) => <ScopeBadge card={i} /> },
  { label: 'Yazar', render: (i) => <AuthorChip author={i.author} size={22} /> },
  { label: 'Yayın', render: (i) => formatDateTime(i.published_at) },
  { label: 'Referans fiyat', render: (i) => <span className="num">{formatQuote(i.ref_price, i.quote_currency)}</span> },
  { label: 'Güncel / kapanış', render: (i) => <span className="num">{formatQuote(i.price, i.quote_currency)}</span> },
  {
    label: 'Yayından beri',
    render: (i) => (
      <span className="inline-flex flex-col">
        <PerfValue value={i.performance_pct} directional={i.directional} />
        <span className="text-[11px] text-muted">{performanceLabel(i)}</span>
      </span>
    ),
  },
  { label: 'Gerekçe', render: (i) => i.rationale, long: true },
  {
    label: 'Beklenen senaryo',
    long: true,
    render: (i) => (
      <>
        {i.scenario}
        {i.scenario_cases.bull && <span className="mt-1 block text-xs text-up">İyimser: {i.scenario_cases.bull}</span>}
        {i.scenario_cases.base && <span className="mt-1 block text-xs text-brand">Temel: {i.scenario_cases.base}</span>}
        {i.scenario_cases.bear && <span className="mt-1 block text-xs text-down">Kötümser: {i.scenario_cases.bear}</span>}
      </>
    ),
  },
  { label: 'Riskler', render: (i) => i.risks, long: true },
  {
    label: 'Hedef seviye',
    render: (i) =>
      i.target_price === null ? (
        '—'
      ) : (
        <span className="num">
          {formatQuote(i.target_price, i.quote_currency)}
          {i.target_hit_at ? <span className="block text-xs text-up">görüldü</span> : i.target_distance_pct !== null && <span className="block text-xs text-muted">uzaklık {formatPercent(i.target_distance_pct)}</span>}
        </span>
      ),
  },
  {
    label: 'Geçersizlik seviyesi',
    render: (i) =>
      i.invalidation_price === null ? (
        '—'
      ) : (
        <span className="num">
          {formatQuote(i.invalidation_price, i.quote_currency)}
          {i.invalidation_hit_at ? (
            <span className="block text-xs text-down">görüldü</span>
          ) : (
            i.invalidation_distance_pct !== null && <span className="block text-xs text-muted">uzaklık {formatPercent(i.invalidation_distance_pct)}</span>
          )}
        </span>
      ),
  },
  { label: 'Değerlendirme tarihi', render: (i) => formatDay(i.review_date) },
  { label: 'Topluluk', render: (i) => `${i.counts.agree} katılıyor · ${i.counts.disagree} katılmıyor · ${i.counts.comments} yorum` },
  {
    label: 'Değerlendirme',
    long: true,
    render: (i) =>
      i.evaluation ? (
        <>
          {i.outcome && <OutcomeBadge outcome={i.outcome} />}
          <span className="mt-1 block">{i.evaluation}</span>
        </>
      ) : (
        <span className="text-subtle">Henüz kapanmadı</span>
      ),
  },
];

/** 2–3 öneri yan yana: yapılandırılmış alanlar + yayından bu yana performans. Dar ekranda yatay kaydırılır. */
export default function CompareView({ items }: { items: IdeaDetail[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
        <caption className="sr-only">Önerilerin karşılaştırması</caption>
        <colgroup>
          <col className="w-32 sm:w-40" />
          {items.map((i) => (
            <col key={i.id} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="p-3 text-left text-xs font-medium text-muted">
              Alan
            </th>
            {items.map((i) => (
              <th key={i.id} scope="col" className="p-3 text-left align-top">
                <Link href={ideaHref(i.id)} className="flex items-center gap-2 hover:text-brand">
                  <AssetAvatar symbol={i.symbol} type={i.asset_type} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-fg">{i.symbol}</span>
                    <span className="block truncate text-xs font-normal text-muted">{i.name}</span>
                  </span>
                </Link>
                <StanceChip stance={i.stance} className="mt-2" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.label} className="border-b border-line last:border-b-0 even:bg-surface-2/50">
              <th scope="row" className="p-3 text-left align-top text-xs font-medium text-muted">
                {r.label}
              </th>
              {items.map((i) => (
                <td key={i.id} className={`p-3 align-top text-fg/90 ${r.long ? 'whitespace-pre-line break-words leading-relaxed' : ''}`}>
                  {r.render(i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
