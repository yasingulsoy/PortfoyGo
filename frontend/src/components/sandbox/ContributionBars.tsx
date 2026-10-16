import { cn, formatUSD } from '@portfoygo/shared/format';
import { fmtPct, fmtPoints } from './model';

export interface ContributionItem {
  key: string;
  label: string;
  sub?: string;
  /** Toplam getiriye katkı (yüzde puan) */
  contribution_pct: number;
  contribution_usd: number;
  /** Kapatılmış pozisyon */
  closed?: boolean;
}

interface Props {
  items: ContributionItem[];
  /** Portföyün toplam getirisi (yüzde) — katkıların toplamı */
  totalPct: number;
  className?: string;
}

/**
 * "Toplam portföye etkisi": her varlığın toplam getiriye katkısı (yüzde puan), sıfır ekseninden sağa (+) / sola (−)
 * çubuklar. Katkı = değer değişimi + gerçekleşen K/Z − komisyon, başlangıç sermayesine oranla; toplamı = portföy getirisi.
 */
export default function ContributionBars({ items, totalPct, className }: Props) {
  const rows = [...items].sort((a, b) => b.contribution_pct - a.contribution_pct);
  const max = Math.max(0.0001, ...rows.map((r) => Math.abs(r.contribution_pct)));
  const best = rows[0];
  const worst = rows[rows.length - 1];

  return (
    <div className={cn('min-w-0', className)}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Henüz pozisyon yok: getiri tamamen nakitten (0) oluşuyor.</p>
      ) : (
        <ul className="space-y-2.5" aria-label="Varlıkların toplam getiriye katkısı">
          {rows.map((r) => {
            const w = (Math.abs(r.contribution_pct) / max) * 50;
            const pos = r.contribution_pct >= 0;
            return (
              <li key={r.key} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,9rem)_1fr_auto]">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-fg">{r.label}</span>
                  {r.closed && <span className="ml-1 text-[11px] text-subtle">(kapandı)</span>}
                </span>
                <span className="relative h-3 rounded-full bg-surface-3" aria-hidden="true">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                  <span
                    className={cn('absolute inset-y-0 rounded-full', pos ? 'left-1/2 bg-up' : 'right-1/2 bg-down')}
                    style={{ width: `${Math.max(w, r.contribution_pct === 0 ? 0 : 1)}%` }}
                  />
                </span>
                <span className={cn('num w-24 text-right text-xs font-semibold', pos ? 'text-up' : 'text-down')} title={formatUSD(r.contribution_usd)}>
                  {fmtPoints(r.contribution_pct)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-muted">
        Katkıların toplamı portföyün toplam getirisine eşittir: <span className="num font-semibold text-fg">{fmtPct(totalPct, { sign: true, digits: 2 })}</span>.
        {best && worst && best.key !== worst.key && (
          <>
            {' '}
            En çok katkı <span className="font-medium text-fg">{best.label}</span>, en çok kayıp{' '}
            <span className="font-medium text-fg">{worst.label}</span> pozisyonundan. Komisyonlar ilgili varlığın katkısından düşülür.
          </>
        )}
      </div>
    </div>
  );
}
