'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowsRightLeftIcon, FolderOpenIcon, TrashIcon } from '@heroicons/react/20/solid';
import { BeakerIcon, RectangleStackIcon } from '@heroicons/react/24/outline';
import { cn, formatDate } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import Modal from '@portfoygo/shared/ui/Modal';
import { Alert, Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import PremiumGate from '@/components/subscription/PremiumGate';
import { useExampleScenario, useLabInstruments, useLabMeta, useSavedScenarios } from '@/hooks/useGlobalLab';
import { useEntitlements } from '@/hooks/useEntitlements';
import { globalLabApi, type Analysis, type SavedScenario, type ScenarioWithAnalysis } from '@/lib/globalLab';
import { FEATURES, isSubscriptionRequired } from '@/lib/subscriptions';
import ScenarioBuilder, { defaultState, fmtWeight, toInput, uid, type BuilderState } from './ScenarioBuilder';
import ScenarioResults from './ScenarioResults';
import { money, pct } from './model';

const BENEFITS = [
  'Bölge × varlık sınıfı veya katalog araçlarıyla dağılım kur (USD / TL bazı)',
  'Monte Carlo yelpazesi, zarar olasılığı ve bir yıllık VaR',
  'Çeşitlendirme: etkin bahis sayısı, bölge / para birimi yoğunlaşması, yerel ağırlık',
  'Stres testleri, senaryo kaydetme ve 3 senaryoya kadar karşılaştırma',
];

/** Senaryo sekmesi: Premium'da çalışma alanı; ücretsizde yükseltme kartı + salt okunur örnek. */
export default function ScenarioTab() {
  return (
    <PremiumGate
      feature={FEATURES.GLOBAL_LAB_PRO}
      title="Senaryo laboratuvarı Premium üyelere açık"
      description="Kendi küresel dağılımını kur, örnek uzun vadeli varsayımlarla beklenen getiri ve riski, olası gelecekleri ve stres senaryolarını incele."
      benefits={BENEFITS}
      fallback={<ExampleScenario />}
    >
      <ScenarioWorkspace />
    </PremiumGate>
  );
}

function fromSaved(s: { mode: SavedScenario['mode']; base_currency: SavedScenario['base_currency']; horizon_years: number; amount: number; allocations: SavedScenario['allocations'] }): BuilderState {
  return {
    mode: s.mode,
    base: s.base_currency,
    horizon: s.horizon_years,
    amount: Math.round(s.amount).toLocaleString('tr-TR'),
    rows: s.allocations.map((a) => ({ uid: uid(), ref: 'key' in a ? a.key : a.instrument_id, weight: fmtWeight(a.weight) })),
  };
}

function ExampleScenario() {
  const meta = useLabMeta();
  const ex = useExampleScenario();
  const saved = useSavedScenarios();
  if (ex.isLoading && !ex.data) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (!ex.data) return null;
  const sc = ex.data.scenario;
  const labelOf = (key: string) => meta.data?.assumptions.cells.find((c) => c.key === key)?.label ?? key;
  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="min-w-0 overflow-hidden">
        <CardHeader
          title={sc.name}
          description={`${sc.base_currency === 'TRY' ? 'TL' : 'USD'} bazında · ${sc.horizon_years} yıl · ${money(sc.amount, sc.base_currency)}`}
          icon={<BeakerIcon />}
          action={<Badge>Salt okunur örnek</Badge>}
        />
        <ul className="grid grid-cols-1 gap-x-6 gap-y-2 px-5 pb-5 text-sm sm:grid-cols-2 sm:px-6 sm:pb-6" aria-label="Örnek dağılım">
          {sc.allocations.map((a) => (
            <li key={a.key} className="flex items-center justify-between gap-3 border-b border-line pb-2">
              <span className="min-w-0 truncate text-fg">{labelOf(a.key)}</span>
              <span className="num shrink-0 font-semibold text-fg">%{a.weight.toLocaleString('tr-TR')}</span>
            </li>
          ))}
        </ul>
      </Card>
      <ScenarioResults analysis={ex.data.analysis} />
      {(saved.data?.items.length ?? 0) > 0 && <SavedPanel locked items={saved.data!.items} onChanged={() => void saved.mutate()} />}
    </div>
  );
}

function ScenarioWorkspace() {
  const meta = useLabMeta();
  const instruments = useLabInstruments();
  const saved = useSavedScenarios();
  const { refresh } = useEntitlements();
  const toast = useToast();
  const [state, setState] = useState<BuilderState>(defaultState);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [compare, setCompare] = useState<ScenarioWithAnalysis[] | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const handleError = (err: unknown) => {
    if (isSubscriptionRequired(err)) void refresh();
    setError(err instanceof Error ? err.message : 'İşlem yapılamadı');
  };

  const run = async (s: BuilderState = state, scroll = true) => {
    const { input, error: e } = toInput(s);
    if (!input) {
      setError(e);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setAnalysis(await globalLabApi.analyze(input));
      if (scroll) requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  // İlk açılışta varsayılan dağılımı analiz et (kaydırmadan)
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run(defaultState(), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (asNew: boolean) => {
    const { input, error: e } = toInput(state);
    if (!input) return setError(e);
    const n = (name || editing?.name || '').trim();
    if (!n) return setError('Senaryoya bir ad ver');
    setSaving(true);
    setError(null);
    try {
      const res = editing && !asNew ? await globalLabApi.update(editing.id, n, input) : await globalLabApi.save(n, input);
      setEditing({ id: res.scenario.id, name: res.scenario.name });
      setName(res.scenario.name);
      if (res.analysis) setAnalysis(res.analysis);
      await saved.mutate();
      toast.success(editing && !asNew ? 'Senaryo güncellendi' : 'Senaryo kaydedildi');
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const open = async (s: SavedScenario) => {
    const next = fromSaved(s);
    setState(next);
    setEditing({ id: s.id, name: s.name });
    setName(s.name);
    setBusy(true);
    setError(null);
    try {
      const res = await globalLabApi.get(s.id);
      if (res.analysis) setAnalysis(res.analysis);
      if (res.error) setError(res.error);
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const runCompare = async (ids: string[]) => {
    try {
      setCompare(await globalLabApi.compare(ids));
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <ScenarioBuilder
            meta={meta.data}
            instruments={instruments.data?.items ?? []}
            state={state}
            onChange={setState}
            onAnalyze={() => void run()}
            busy={busy}
            actions={
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                <label className="min-w-0 flex-1 basis-40 sm:max-w-56">
                  <span className="sr-only">Senaryo adı</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    placeholder="Senaryo adı"
                    className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg shadow-card placeholder:text-subtle focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10"
                  />
                </label>
                <Button variant="secondary" onClick={() => void save(false)} loading={saving}>
                  {editing ? 'Güncelle' : 'Kaydet'}
                </Button>
                {editing && (
                  <Button variant="ghost" onClick={() => void save(true)} disabled={saving}>
                    Yeni olarak kaydet
                  </Button>
                )}
              </div>
            }
          />
          {error && (
            <Alert tone="error" className="mt-4">
              {error}
            </Alert>
          )}
        </div>
        <SavedPanel
          items={saved.data?.items ?? []}
          loading={saved.isLoading && !saved.data}
          limit={saved.data?.limit ?? meta.data?.limits.savedMax ?? 20}
          activeId={editing?.id ?? null}
          onOpen={(s) => void open(s)}
          onCompare={(ids) => void runCompare(ids)}
          onChanged={(removedId) => {
            void saved.mutate();
            if (removedId && editing?.id === removedId) setEditing(null);
          }}
        />
      </div>

      <div ref={resultsRef} className="scroll-mt-24">
        {busy && !analysis ? (
          <Skeleton className="h-96 w-full rounded-2xl" />
        ) : analysis ? (
          <div className={cn('transition-opacity', busy && 'opacity-60')} aria-busy={busy}>
            <ScenarioResults analysis={analysis} />
          </div>
        ) : null}
      </div>

      {compare && <CompareTable items={compare} onClose={() => setCompare(null)} />}
    </div>
  );
}

function SavedPanel({
  items,
  loading,
  limit,
  activeId,
  onOpen,
  onCompare,
  onChanged,
  locked,
}: {
  items: SavedScenario[];
  loading?: boolean;
  limit?: number;
  activeId?: string | null;
  onOpen?: (s: SavedScenario) => void;
  onCompare?: (ids: string[]) => void;
  onChanged: (removedId?: string) => void;
  locked?: boolean;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<SavedScenario | null>(null);
  const [removing, setRemoving] = useState(false);
  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? cur : [...cur, id]));

  const remove = async () => {
    if (!confirm) return;
    setRemoving(true);
    try {
      await globalLabApi.remove(confirm.id);
      setSelected((cur) => cur.filter((x) => x !== confirm.id));
      toast.info('Senaryo silindi');
      onChanged(confirm.id);
      setConfirm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Silinemedi');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card className="h-fit min-w-0 overflow-hidden">
      <CardHeader
        title="Kayıtlı senaryolar"
        description={locked ? 'Premium bittiğinde de listelenir; açmak için Premium gerekir' : `${items.length} / ${limit ?? 20}`}
        icon={<RectangleStackIcon />}
      />
      {loading ? (
        <div className="space-y-2 px-5 pb-5 sm:px-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState className="py-8" icon={<BeakerIcon />} title="Henüz kayıtlı senaryo yok" description="Bir dağılım kurup ad vererek kaydet; sonra 3 taneye kadar karşılaştır." />
      ) : (
        <>
          <ul className="divide-y divide-line border-t border-line">
            {items.map((s) => (
              <li key={s.id} className={cn('flex items-center gap-3 px-5 py-3 sm:px-6', activeId === s.id && 'bg-brand-soft/40')}>
                {!locked && (
                  <input
                    type="checkbox"
                    checked={selected.includes(s.id)}
                    onChange={() => toggle(s.id)}
                    disabled={!selected.includes(s.id) && selected.length >= 3}
                    aria-label={`${s.name}: karşılaştırmaya seç`}
                    className="h-4 w-4 shrink-0 accent-[var(--brand)]"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-fg">{s.name}</p>
                  <p className="num truncate text-xs text-muted">
                    {s.mode === 'cells' ? 'Sınıf × bölge' : 'Araçlar'} · {s.base_currency} · {s.horizon_years} yıl · {formatDate(s.updated_at)}
                  </p>
                </div>
                {!locked && onOpen && (
                  <button
                    type="button"
                    onClick={() => onOpen(s)}
                    aria-label={`${s.name}: aç`}
                    title="Aç"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-surface-3 hover:text-fg"
                  >
                    <FolderOpenIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirm(s)}
                  aria-label={`${s.name}: sil`}
                  title="Sil"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-down-soft hover:text-down"
                >
                  <TrashIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {!locked && onCompare && (
            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 sm:px-6">
              <p className="text-xs text-muted">2–3 senaryo seç</p>
              <Button
                size="sm"
                variant="secondary"
                disabled={selected.length < 2}
                onClick={() => onCompare(selected)}
                icon={<ArrowsRightLeftIcon className="h-4 w-4" aria-hidden="true" />}
              >
                Karşılaştır
              </Button>
            </div>
          )}
        </>
      )}
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        size="sm"
        title="Senaryoyu sil"
        description={confirm ? `"${confirm.name}" kalıcı olarak silinecek.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Vazgeç
            </Button>
            <Button variant="danger" onClick={() => void remove()} loading={removing}>
              Sil
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">Bu işlem geri alınamaz.</p>
      </Modal>
    </Card>
  );
}

function CompareTable({ items, onClose }: { items: ScenarioWithAnalysis[]; onClose: () => void }) {
  type Row = { label: string; get: (a: Analysis) => string; tone?: (a: Analysis) => string };
  const first = items.find((i) => i.analysis)?.analysis;
  const rows: Row[] = [
    { label: 'Baz · vade', get: (a) => `${a.base_currency} · ${a.horizon_years} yıl` },
    { label: 'Beklenen yıllık getiri', get: (a) => pct(a.metrics.expected_return, { sign: true }) },
    { label: 'Volatilite', get: (a) => pct(a.metrics.volatility) },
    { label: 'Sharpe', get: (a) => a.metrics.sharpe.toLocaleString('tr-TR', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) },
    { label: 'Zarar olasılığı (vade sonu)', get: (a) => pct(a.simulation.prob_loss) },
    { label: 'Kötü yıl (VaR %95)', get: (a) => (a.simulation.var95_1y > 0 ? `-${pct(a.simulation.var95_1y)}` : pct(0)), tone: () => 'text-down' },
    { label: 'Medyan vade sonu değer', get: (a) => money(a.simulation.p50[a.simulation.p50.length - 1] ?? a.amount, a.base_currency) },
    { label: 'Kötü senaryo düşüşü', get: (a) => `-${pct(a.simulation.max_drawdown_p95)}`, tone: () => 'text-down' },
    { label: 'Etkin bahis sayısı', get: (a) => `${a.diversification.effective_bets.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} / ${a.diversification.cells}` },
    { label: 'Türkiye payı', get: (a) => pct(a.diversification.home_bias.tr_share) },
    { label: 'Baz dışı para birimi', get: (a) => pct(a.diversification.foreign_currency_share) },
    ...(first?.stress ?? []).map<Row>((s) => ({
      label: `Stres: ${s.name}`,
      get: (a) => {
        const r = a.stress.find((x) => x.id === s.id);
        return r ? pct(r.portfolio_return, { sign: true }) : '—';
      },
      tone: (a) => ((a.stress.find((x) => x.id === s.id)?.portfolio_return ?? 0) < 0 ? 'text-down' : 'text-up'),
    })),
  ];
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader
        title="Senaryo karşılaştırması"
        description="Güncel varsayımlarla yeniden hesaplandı"
        icon={<ArrowsRightLeftIcon />}
        action={
          <Button size="sm" variant="ghost" onClick={onClose}>
            Kapat
          </Button>
        }
      />
      <div className="relative max-w-full overflow-x-auto border-t border-line">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">Kayıtlı senaryoların karşılaştırması</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 z-10 w-48 bg-surface px-5 py-3 text-left text-xs font-medium text-muted sm:px-6">
                Ölçü
              </th>
              {items.map((i) => (
                <th key={i.scenario.id} scope="col" className="px-3 py-3 text-left font-semibold text-fg">
                  {i.scenario.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="sticky left-0 z-10 bg-surface px-5 py-2.5 text-left text-xs font-medium text-muted sm:px-6">
                  {r.label}
                </th>
                {items.map((i) => (
                  <td key={i.scenario.id} className={cn('num px-3 py-2.5', i.analysis && r.tone ? r.tone(i.analysis) : 'text-fg')}>
                    {i.analysis ? r.get(i.analysis) : <span className="text-xs text-down">{i.error ?? 'Hesaplanamadı'}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
