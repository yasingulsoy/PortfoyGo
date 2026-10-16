import type { ReactNode } from 'react';
import { cn, formatUSD } from '@portfoygo/shared/format';
import { InfoTip } from '@/components/advisor/bits';
import { METRIC_EDU, fmtPct } from './model';
import type { SandboxMetrics } from './types';

interface Props {
  metrics: SandboxMetrics;
  /** Kart başlığı altında risk değerlerinin kaynağını göster */
  showBasis?: boolean;
  className?: string;
}

function Tile({ label, value, hint, help, tone }: { label: string; value: ReactNode; hint?: ReactNode; help: string; tone?: 'up' | 'down' | 'gold' }) {
  return (
    <div className="min-w-0 rounded-xl border border-line p-3.5">
      <p className="flex items-center gap-1 text-xs font-medium text-muted">
        {label}
        <InfoTip label={label} align="start">
          {help}
        </InfoTip>
      </p>
      <p className={cn('num mt-1.5 text-xl font-semibold', tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'gold' ? 'text-gold' : 'text-fg')}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-subtle">{hint}</p>}
    </div>
  );
}

/** Sade dille risk metrikleri: oynaklık, en büyük düşüş, Sharpe, etkin varlık sayısı, devir hızı, işlem/komisyon. */
export default function MetricsGrid({ metrics: m, showBasis = true, className }: Props) {
  const concentration = m.effective_n <= 2 ? 'Yoğun' : m.effective_n <= 5 ? 'Orta' : 'Çeşitlendirilmiş';
  const sharpeHint =
    m.sharpe === null ? 'Hesaplanamadı (oynaklık yok ya da veri az)' : m.sharpe >= 1 ? 'Risk iyi ödüllendirilmiş' : m.sharpe >= 0 ? 'Risksiz getirinin üzerinde' : 'Risksiz getirinin altında';
  return (
    <div className={cn('min-w-0', className)}>
      {showBasis && m.basis && (
        <p className="mb-3 text-xs leading-relaxed text-muted">{m.basis === 'realized' ? METRIC_EDU.basis_realized : METRIC_EDU.basis_simulated}</p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile
          label="Yıllık oynaklık"
          value={fmtPct(m.volatility_ann)}
          hint={m.volatility_ann === null ? 'Veri az' : m.volatility_ann < 10 ? 'Düşük dalgalanma' : m.volatility_ann < 25 ? 'Orta dalgalanma' : 'Yüksek dalgalanma'}
          help={METRIC_EDU.volatility}
        />
        <Tile
          label="En büyük düşüş"
          value={m.max_drawdown_pct === null ? '—' : m.max_drawdown_pct === 0 ? '%0,0' : `−${fmtPct(m.max_drawdown_pct)}`}
          tone={m.max_drawdown_pct && m.max_drawdown_pct >= 15 ? 'down' : undefined}
          hint="Tepeden dibe en derin kayıp"
          help={METRIC_EDU.max_drawdown}
        />
        <Tile
          label="Sharpe oranı"
          value={m.sharpe === null ? '—' : m.sharpe.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          tone={m.sharpe === null ? undefined : m.sharpe >= 1 ? 'up' : m.sharpe < 0 ? 'down' : undefined}
          hint={sharpeHint}
          help={METRIC_EDU.sharpe}
        />
        <Tile
          label="Etkin varlık sayısı"
          value={m.effective_n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
          tone={m.effective_n <= 2 ? 'gold' : undefined}
          hint={`${concentration} · HHI ${m.hhi.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}`}
          help={METRIC_EDU.effective_n}
        />
        <Tile label="Devir hızı" value={fmtPct(m.turnover_pct)} hint="İlk kurulum hariç" help={METRIC_EDU.turnover} />
        <Tile
          label="İşlem · komisyon"
          value={m.trades_count.toLocaleString('tr-TR')}
          hint={`${formatUSD(m.commission_paid_usd)} komisyon · ${m.days} gün`}
          help="Toplam işlem sayısı ve ödenen komisyon. Her alım-satım %0,25 komisyonla getiriden düşer; sık işlem maliyeti büyütür."
        />
      </div>
    </div>
  );
}
