import { cn } from '@portfoygo/shared/format';
import type { IdeaTrackRecord, PublicIdeasRecord } from '@/types/ideas';

/**
 * Yazarın sakin başarı kaydı: yayınlanan / kapanan öneri, kapananlarda "Beklendiği gibi" payı ve ortalama kapanma
 * süresi. Sıralama ya da puan yoktur; amaç fikirlerin değerlendirilerek kapatılmasını görünür kılmak.
 */
export default function TrackRecord({ record, className }: { record: IdeaTrackRecord | PublicIdeasRecord; className?: string }) {
  const items = [
    { label: 'Yayınlanan', value: String(record.published) },
    { label: 'Kapanan', value: String(record.closed) },
    { label: 'Beklendiği gibi', value: record.as_expected_pct === null ? '—' : `%${record.as_expected_pct.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` },
    { label: 'Ort. kapanma', value: record.avg_days_to_close === null ? '—' : `${record.avg_days_to_close.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} gün` },
  ];
  return (
    <dl className={cn('grid grid-cols-2 gap-2', className)}>
      {items.map((i) => (
        <div key={i.label} className="rounded-lg bg-surface-2 px-3 py-2">
          <dt className="text-[11px] text-muted">{i.label}</dt>
          <dd className="num mt-0.5 text-sm font-semibold text-fg">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
