'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SparklesIcon } from '@heroicons/react/20/solid';
import { cn, formatQuantity, formatUSD } from '@portfoygo/shared/format';
import Button from '@portfoygo/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { Field } from '@portfoygo/shared/ui/Field';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { ApiError, modelPortfolioApi, sandboxApi } from '@/lib/api';
import { useRefreshModel } from '@/hooks/useModelPortfolios';
import WeightsEditor from '@/components/sandbox/WeightsEditor';
import SandboxDisclaimer from '@/components/sandbox/SandboxDisclaimer';
import { estimateInitialCost, sumWeights, weightStatus } from '@/components/sandbox/model';
import type { AdvisorTemplate, RebalancePlan, WeightRow } from '@/components/sandbox/types';
import { swrFetcher } from '@/lib/api';
import { TEMPLATE_LABELS, advisorTemplateRows, balancedTemplate, cashTemplate, equalTemplate, type TemplateId } from './templates';

const STARTING_CASH = 100_000;
const BPS = 25;

/** Yeni Model Portföy: ad + hedef ağırlıklar (şablonlar) + maliyet önizlemesi → oluştur. */
export default function CreatePortfolio({ defaultName, atLimit }: { defaultName: string; atLimit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const refresh = useRefreshModel();
  const [name, setName] = useState(defaultName);
  const [rows, setRows] = useState<WeightRow[]>([]);
  const [cash, setCash] = useState(100);
  const [notes, setNotes] = useState<string[]>([]);
  const [template, setTemplate] = useState<TemplateId | null>('cash');
  const [templateBusy, setTemplateBusy] = useState<TemplateId | null>(null);
  const [plan, setPlan] = useState<RebalancePlan | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sum = sumWeights(rows, cash);
  const ready = weightStatus(sum) === 'ok';
  const estimate = useMemo(() => estimateInitialCost(rows, STARTING_CASH, BPS), [rows]);
  const trimmed = name.trim();

  const change = (r: WeightRow[], c: number) => {
    setRows(r);
    setCash(c);
    setPlan(null);
    setTemplate(null);
  };

  const applyTemplate = async (id: TemplateId) => {
    setError(null);
    setPlan(null);
    setTemplateBusy(id);
    try {
      let res;
      if (id === 'cash') res = cashTemplate();
      else if (id === 'advisor') {
        try {
          res = advisorTemplateRows(await swrFetcher<AdvisorTemplate>(modelPortfolioApi.advisorTemplateKey));
        } catch (e) {
          if (e instanceof ApiError && e.code === 'NO_ADVISOR_PLAN') {
            setError('Henüz bir Portföy Sihirbazı önerin yok. Önce Sihirbaz’da risk profilini belirleyip bir öneri oluştur.');
            return;
          }
          throw e;
        }
      } else {
        const catalog = await sandboxApi.assets('', null);
        res = id === 'equal' ? equalTemplate(rows, catalog) : balancedTemplate(catalog);
      }
      setRows(res.rows);
      setCash(res.cash_weight);
      setNotes(res.notes);
      setTemplate(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Şablon yüklenemedi');
    } finally {
      setTemplateBusy(null);
    }
  };

  const body = () => ({ weights: rows.map((r) => ({ asset_type: r.asset_type, symbol: r.symbol, weight: r.weight })), cash_weight: cash });

  const preview = async () => {
    setPreviewing(true);
    setError(null);
    try {
      setPlan(await modelPortfolioApi.preview(body()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Önizleme alınamadı');
    } finally {
      setPreviewing(false);
    }
  };

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await modelPortfolioApi.create({ name: trimmed, ...body() });
      await refresh();
      toast.success('Model portföy oluşturuldu', { description: `${trimmed} · 100.000 USD` });
      router.push(`/model-portfoy/${res.portfolio.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Portföy oluşturulamadı');
      setCreating(false);
    }
  };

  return (
    <div className="grid gap-4 md:gap-6 xl:grid-cols-12">
      <Card className="min-w-0 xl:col-span-8">
        <CardHeader title="Dağılımı kur" description="100.000 USD'yi varlıklar ve nakit arasında yüzde olarak paylaştır" />
        <CardBody className="space-y-5 pt-0">
          <Field label="Portföy adı" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} error={trimmed ? undefined : 'Ad gerekli'} />

          <div>
            <p className="mb-2 text-sm font-medium text-fg/80">Hazır şablonlar</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(TEMPLATE_LABELS) as TemplateId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => applyTemplate(id)}
                  disabled={!!templateBusy}
                  aria-pressed={template === id}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-colors disabled:opacity-60',
                    template === id ? 'border-brand bg-brand-soft' : 'border-line hover:border-line-strong',
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                    {id === 'advisor' && <SparklesIcon className="h-4 w-4 text-brand" aria-hidden="true" />}
                    {TEMPLATE_LABELS[id].label}
                    {templateBusy === id && <span className="text-xs font-normal text-muted">yükleniyor…</span>}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{TEMPLATE_LABELS[id].help}</span>
                </button>
              ))}
            </div>
            {notes.length > 0 && (
              <Alert tone="info" className="mt-3">
                <ul className="space-y-0.5">
                  {notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </div>

          <WeightsEditor rows={rows} cashWeight={cash} onChange={change} search={sandboxApi.assets} equity={STARTING_CASH} disabled={creating} />
        </CardBody>
      </Card>

      <div className="min-w-0 space-y-4 md:space-y-6 xl:col-span-4">
        <Card className="xl:sticky xl:top-24">
          <CardHeader title="Özet ve maliyet" description="Onaylamadan önce kontrol et" />
          <CardBody className="space-y-4 pt-0">
            <dl className="num grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Başlangıç sermayesi</dt>
              <dd className="text-right font-medium text-fg">{formatUSD(STARTING_CASH)}</dd>
              <dt className="text-muted">Yatırılacak (brüt)</dt>
              <dd className="text-right text-fg">{formatUSD(plan ? plan.trades.reduce((s, t) => s + t.gross, 0) : estimate.gross)}</dd>
              <dt className="text-muted">Tahmini komisyon (%0,25)</dt>
              <dd className="text-right text-fg">{formatUSD(plan ? plan.total_commission : estimate.commission)}</dd>
              <dt className="text-muted">Kalacak nakit</dt>
              <dd className="text-right text-fg">{formatUSD(plan ? plan.cash_after : STARTING_CASH - estimate.gross - estimate.commission)}</dd>
            </dl>
            <p className="text-xs leading-relaxed text-muted">
              Komisyon her alımda ödenir ve başlangıç değerini hemen o kadar düşürür. Toplam %{sum.toLocaleString('tr-TR')} —{' '}
              {ready ? 'dağılım hazır.' : 'ağırlıkların toplamı %100 olmalı.'}
            </p>

            {plan && (
              <div className="rounded-xl border border-line">
                <p className="border-b border-line px-3 py-2 text-xs font-medium text-muted">Gerçekleşecek alımlar (güncel fiyatlarla)</p>
                <ul className="max-h-56 divide-y divide-line overflow-y-auto">
                  {plan.trades.map((t) => (
                    <li key={`${t.asset_type}:${t.symbol}`} className="num flex items-center justify-between gap-2 px-3 py-2 text-xs">
                      <span className="min-w-0 truncate font-medium text-fg">
                        {t.symbol} <span className="font-normal text-subtle">× {formatQuantity(t.quantity)}</span>
                      </span>
                      <span className="shrink-0 text-muted">
                        {formatUSD(t.gross)} <span className="text-subtle">+ {formatUSD(t.commission)}</span>
                      </span>
                    </li>
                  ))}
                  {plan.trades.length === 0 && <li className="px-3 py-2 text-xs text-muted">İşlem yok: tamamı nakit.</li>}
                </ul>
              </div>
            )}

            {error && <Alert tone="error">{error}</Alert>}
            {atLimit && (
              <Alert tone="error">
                En fazla 5 model portföy oluşturabilirsin. Yenisi için <Link href="/model-portfoy" className="font-medium underline">listeden</Link> birini sil.
              </Alert>
            )}

            <div className="grid gap-2">
              <Button variant="secondary" onClick={preview} loading={previewing} disabled={!ready || creating || rows.length === 0}>
                Maliyeti önizle
              </Button>
              <Button onClick={create} loading={creating} disabled={!ready || !trimmed || atLimit}>
                Portföyü oluştur
              </Button>
            </div>
            <SandboxDisclaimer />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
