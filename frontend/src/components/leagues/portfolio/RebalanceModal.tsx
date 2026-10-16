'use client';

import { useMemo, useState } from 'react';
import { cn, formatQuantity, formatUSD } from '@portfoygo/shared/format';
import Button from '@portfoygo/shared/ui/Button';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import Modal from '@portfoygo/shared/ui/Modal';
import { sandboxApi } from '@/lib/api';
import { portfolioLeagueApi } from '@/lib/portfolioLeagues';
import WeightsEditor from '@/components/sandbox/WeightsEditor';
import { assetKey, sumWeights, weightStatus } from '@/components/sandbox/model';
import type { RebalancePlan, SandboxValuation, StoredTargetWeights, WeightRow } from '@/components/sandbox/types';

interface Props {
  leagueId: string;
  valuation: SandboxValuation;
  target: StoredTargetWeights | null;
  commissionLabel: string;
  onClose: () => void;
  onDone: () => void;
}

/** Başlangıç satırları: kayıtlı hedef varsa o, yoksa güncel ağırlıklar */
function initialRows(target: StoredTargetWeights | null, v: SandboxValuation): { rows: WeightRow[]; cash: number } {
  const names = new Map(v.holdings.map((h) => [assetKey(h.asset_type, h.symbol), h]));
  if (target) {
    return {
      rows: target.weights.map((w) => ({
        asset_type: w.asset_type,
        symbol: w.symbol,
        name: names.get(assetKey(w.asset_type, w.symbol))?.name ?? w.symbol,
        weight: w.weight,
      })),
      cash: target.cash_weight,
    };
  }
  if (v.holdings.length === 0) return { rows: [], cash: 100 };
  return {
    rows: v.holdings.map((h) => ({ asset_type: h.asset_type, symbol: h.symbol, name: h.name, weight: Math.round(h.weight * 100) / 100 })),
    cash: Math.round(v.cash_weight * 100) / 100,
  };
}

/** Lig portföyü için hedef ağırlık → önizle (satışlar önce) → uygula. Ortak WeightsEditor bileşenini kullanır. */
export default function LeagueRebalanceModal({ leagueId, valuation, target, commissionLabel, onClose, onDone }: Props) {
  const init = useMemo(() => initialRows(target, valuation), [target, valuation]);
  const [rows, setRows] = useState<WeightRow[]>(init.rows);
  const [cash, setCash] = useState(init.cash);
  const [plan, setPlan] = useState<RebalancePlan | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = useMemo(() => {
    const m = new Map(valuation.holdings.map((h) => [assetKey(h.asset_type, h.symbol), h.weight]));
    m.set('__cash', valuation.cash_weight);
    return m;
  }, [valuation]);

  const ready = weightStatus(sumWeights(rows, cash)) === 'ok';
  const body = () => ({ weights: rows.map((r) => ({ asset_type: r.asset_type, symbol: r.symbol, weight: r.weight })), cash_weight: cash });

  const run = async (dry: boolean) => {
    setBusy(dry ? 'preview' : 'apply');
    setError(null);
    try {
      if (dry) {
        const res = await portfolioLeagueApi.previewWeights(leagueId, body());
        setPlan(res.plan);
      } else {
        await portfolioLeagueApi.setWeights(leagueId, body());
        onDone();
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem başarısız');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Hedef ağırlıklarla dengele"
      description={`Önce fazla olanlar satılır, sonra eksikler alınır. Her işleme ${commissionLabel} maliyet uygulanır; artan nakitte kalır.`}
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => void run(true)} loading={busy === 'preview'} disabled={!ready || !!busy}>
            Önizle
          </Button>
          <Button onClick={() => void run(false)} loading={busy === 'apply'} disabled={!ready || !!busy || !plan}>
            Uygula
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <WeightsEditor
          rows={rows}
          cashWeight={cash}
          onChange={(r, c) => {
            setRows(r);
            setCash(c);
            setPlan(null);
          }}
          search={sandboxApi.assets}
          equity={valuation.equity_usd}
          current={current}
          disabled={!!busy}
        />
        {plan && (
          <div className="rounded-xl border border-line">
            <p className="border-b border-line px-3 py-2 text-xs font-medium text-muted">
              {plan.trades.length} işlem · maliyet {formatUSD(plan.total_commission)} · sonrası nakit {formatUSD(plan.cash_after)}
            </p>
            <ul className="max-h-56 divide-y divide-line overflow-y-auto">
              {plan.trades.map((t, i) => (
                <li key={`${t.side}:${t.asset_type}:${t.symbol}:${i}`} className="num flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <span className="min-w-0 truncate">
                    <span className={cn('mr-1.5 font-semibold', t.side === 'buy' ? 'text-up' : 'text-down')}>{t.side === 'buy' ? 'AL' : 'SAT'}</span>
                    <span className="font-medium text-fg">{t.symbol}</span> <span className="text-subtle">× {formatQuantity(t.quantity)}</span>
                  </span>
                  <span className="shrink-0 text-muted">
                    {formatUSD(t.gross)} <span className="text-subtle">· {formatUSD(t.commission)}</span>
                  </span>
                </li>
              ))}
              {plan.trades.length === 0 && <li className="px-3 py-2 text-xs text-muted">Portföy zaten hedefe yakın; işlem gerekmiyor.</li>}
            </ul>
          </div>
        )}
        {!plan && ready && <p className="text-xs text-muted">Uygulamadan önce önizle: hangi işlemlerin yapılacağını ve maliyeti gör.</p>}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
