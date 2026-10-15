'use client';

import { useId, useState, type FormEvent } from 'react';
import { CheckIcon, PlusIcon, TrashIcon } from '@heroicons/react/20/solid';
import { FilmIcon } from '@heroicons/react/24/outline';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, Badge } from '@portfoygo/shared/ui/Feedback';
import { Field } from '@portfoygo/shared/ui/Field';
import Button from '@portfoygo/shared/ui/Button';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn, formatNumber } from '@portfoygo/shared/format';
import { scenarioApi } from '@/lib/api';
import { useDebouncedValue } from '@/lib/hooks';
import type { AdminScenario, HistoricalSeries, ScenarioDifficulty, ScenarioInput, ScenarioInstrumentInput } from '@/lib/types';
import { SelectField } from '@/components/controls';
import { chipClass } from '@/components/arena/parts';
import { useArenaInstruments } from '@/components/arena/data';
import { DIFFICULTY_OPTIONS, formatUtc, fromUtcInput, toUtcInput, useSeriesPreview } from './data';
import LineChart from './LineChart';
import { textareaClass } from './SeriesImport';

const MAX_INSTRUMENTS = 4;
/** Sunucunun pencere kapsaması için istediği en az nokta */
const MIN_WINDOW_POINTS = 20;
const LIMITS = { titleMin: 3, titleMax: 80, descriptionMax: 300, briefingMax: 4000, debriefMax: 4000 };

type Row = ScenarioInstrumentInput & { key: number };

let rowSeq = 0;
const newRow = (r?: Partial<ScenarioInstrumentInput>): Row => ({ key: ++rowSeq, code: r?.code ?? '', label: r?.label ?? '', series_code: r?.series_code ?? '' });

/**
 * Senaryo düzenleyici: başlık, zorluk, enstrüman → seri eşlemesi, UTC pencere, brifing ve "ne oldu" metni.
 * `scenario` verilirse düzenleme (PATCH), yoksa oluşturma (POST).
 */
export default function ScenarioEditor({
  series,
  scenario,
  onSaved,
  onCancel,
}: {
  series: HistoricalSeries[];
  scenario: AdminScenario | null;
  onSaved: (s: { id: string | null; title: string }) => void;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const instruments = useArenaInstruments();
  const ids = { desc: useId(), brief: useId(), debrief: useId(), from: useId(), to: useId() };

  const [title, setTitle] = useState(scenario?.title ?? '');
  const [description, setDescription] = useState(scenario?.description ?? '');
  const [difficulty, setDifficulty] = useState<ScenarioDifficulty>(scenario?.difficulty ?? 'orta');
  const [rows, setRows] = useState<Row[]>(() => (scenario?.instruments.length ? scenario.instruments.map((i) => newRow(i)) : [newRow()]));
  const [from, setFrom] = useState(toUtcInput(scenario?.window_from));
  const [to, setTo] = useState(toUtcInput(scenario?.window_to));
  const [briefing, setBriefing] = useState(scenario?.briefing ?? '');
  const [debrief, setDebrief] = useState(scenario?.debrief ?? '');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const fromIso = fromUtcInput(from);
  const toIso = fromUtcInput(to);
  const windowOk = !!fromIso && !!toIso && Date.parse(toIso) > Date.parse(fromIso);
  // Dize olarak geciktir (nesne her çizimde yeni olur)
  const windowKey = useDebouncedValue(windowOk ? `${fromIso}|${toIso}` : '', 500);
  const debouncedWindow = windowKey ? { from: windowKey.split('|')[0], to: windowKey.split('|')[1] } : null;

  const seriesByCode = new Map(series.map((s) => [s.series_code, s]));
  const codes = rows.map((r) => r.code).filter(Boolean);
  const dupCodes = new Set(codes.filter((c, i) => codes.indexOf(c) !== i));

  const rowError = (r: Row): string | undefined => {
    if (!r.code) return 'Enstrüman seç';
    if (dupCodes.has(r.code)) return 'Aynı enstrüman iki kez seçilmiş';
    if (!r.series_code) return 'Seri seç';
    const s = seriesByCode.get(r.series_code);
    if (s && s.currency !== 'USD') return `${s.series_code} ${s.currency}; arena enstrümanları USD ister`;
    return undefined;
  };

  const t = title.trim();
  const errors = {
    title: t.length < LIMITS.titleMin ? `Başlık en az ${LIMITS.titleMin} karakter olmalı` : undefined,
    rows: rows.length === 0 ? 'En az bir enstrüman ekle' : rows.some((r) => rowError(r)) ? 'Enstrüman satırlarını tamamla' : undefined,
    from: !fromIso ? 'Başlangıç seç' : undefined,
    to: !toIso ? 'Bitiş seç' : fromIso && Date.parse(toIso) <= Date.parse(fromIso) ? 'Bitiş başlangıçtan sonra olmalı' : undefined,
    briefing: briefing.trim().length < 10 ? 'Oyuncuya turdan önce gösterilecek brifingi yaz (en az 10 karakter)' : undefined,
  };
  const valid = Object.values(errors).every((e) => !e);
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined);

  const updateRow = (key: number, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Seçili ilk serinin tüm aralığını pencereye yaz */
  const fillFromSeries = () => {
    const s = rows.map((r) => seriesByCode.get(r.series_code)).find((x) => x?.from && x?.to);
    if (!s) return;
    setFrom(toUtcInput(s.from));
    setTo(toUtcInput(s.to));
  };

  const body = (): ScenarioInput => ({
    title: t,
    description: description.trim(),
    briefing: briefing.trim(),
    debrief: debrief.trim(),
    difficulty,
    instruments: rows.map((r) => ({
      code: r.code,
      label: r.label.trim() || instruments.labels.get(r.code) || r.code,
      series_code: r.series_code,
    })),
    window_from: fromIso!,
    window_to: toIso!,
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    if (!valid || busy) return;
    setBusy(true);
    try {
      const input = body();
      const res = scenario ? await scenarioApi.updateScenario(scenario.id, input) : await scenarioApi.createScenario(input);
      const d = (res?.data ?? res) as { id?: string } | null;
      toast.success(scenario ? 'Senaryo güncellendi' : 'Senaryo taslak olarak kaydedildi', {
        description: scenario?.published ? `${t} · yayında` : `${t} · yayınlamak için listedeki anahtarı kullan`,
      });
      onSaved({ id: d?.id ? String(d.id) : (scenario?.id ?? null), title: t });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const instrumentOptions = [
    { value: '', label: 'Enstrüman seç' },
    ...(instruments.all.length
      ? instruments.all.map((i) => ({ value: i.code, label: `${i.label} (${i.code})` }))
      : ['EURUSD', 'XAUUSD', 'BRENT', 'BTCUSD', 'XAGUSD'].map((c) => ({ value: c, label: c }))),
  ];
  const seriesOptions = [
    { value: '', label: series.length ? 'Seri seç' : 'Önce bir seri yükle' },
    ...series.map((s) => ({ value: s.series_code, label: `${s.series_code} · ${s.label} (${s.currency})` })),
  ];

  return (
    <Card className="min-w-0">
      <CardHeader
        icon={<FilmIcon />}
        title={scenario ? 'Senaryoyu düzenle' : 'Yeni senaryo'}
        description={scenario ? scenario.title : 'Tarihsel bir olayı arena turu olarak yeniden oynat'}
        action={scenario?.published ? <Badge tone="up">Yayında</Badge> : scenario ? <Badge>Taslak</Badge> : undefined}
      />
      <form onSubmit={submit} noValidate className="space-y-5 border-t border-line px-5 py-5 sm:px-6">
        {scenario?.published && (
          <Alert tone="info">Bu senaryo yayında. Kaydettiğin değişiklikler bir sonraki turdan itibaren oyunculara yansır.</Alert>
        )}

        <Field
          label="Başlık"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={LIMITS.titleMax}
          placeholder="ör. Mart 2020: Pandemi şoku"
          error={show('title')}
        />
        <div>
          <label htmlFor={ids.desc} className="mb-1.5 block text-sm font-medium text-fg/80">
            Kısa açıklama <span className="font-normal text-subtle">(kart üzerinde görünür)</span>
          </label>
          <textarea
            id={ids.desc}
            rows={2}
            maxLength={LIMITS.descriptionMax}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={cn(textareaClass, 'border-line')}
          />
          <p className="mt-1 text-right text-[11px] text-subtle">
            {description.length}/{LIMITS.descriptionMax}
          </p>
        </div>

        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-fg/80">Zorluk</legend>
          <div className="flex flex-wrap gap-2">
            {DIFFICULTY_OPTIONS.map((o) => (
              <label key={o.value} className={chipClass}>
                <input type="radio" name={`difficulty-${scenario?.id ?? 'new'}`} value={o.value} checked={difficulty === o.value} onChange={() => setDifficulty(o.value)} className="sr-only" />
                {'★'.repeat(o.value === 'kolay' ? 1 : o.value === 'orta' ? 2 : 3)} {o.label}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Enstrüman satırları */}
        <fieldset className="space-y-3">
          <legend className="mb-1.5 block text-sm font-medium text-fg/80">Enstrümanlar ve seriler</legend>
          {rows.map((r, idx) => {
            const err = touched ? rowError(r) : undefined;
            return (
              <div key={r.key} className={cn('rounded-xl border p-3', err ? 'border-down/40' : 'border-line')}>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
                  <SelectField
                    label={`Enstrüman ${idx + 1}`}
                    options={instrumentOptions}
                    value={r.code}
                    onChange={(e) => updateRow(r.key, { code: e.target.value, label: r.label || instruments.labels.get(e.target.value) || '' })}
                  />
                  <Field
                    label="Oyuncuya görünen ad"
                    value={r.label}
                    onChange={(e) => updateRow(r.key, { label: e.target.value })}
                    placeholder={instruments.labels.get(r.code) ?? 'ör. Bitcoin'}
                    maxLength={40}
                  />
                  <SelectField label="Seri" options={seriesOptions} value={r.series_code} onChange={(e) => updateRow(r.key, { series_code: e.target.value })} />
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                    disabled={rows.length <= 1}
                    aria-label={`${idx + 1}. enstrümanı kaldır`}
                    icon={<TrashIcon className="h-4 w-4" aria-hidden="true" />}
                  />
                </div>
                {err && <p className="mt-2 text-xs text-down">{err}</p>}
                {r.series_code && <WindowPreview code={r.series_code} window={debouncedWindow} />}
              </div>
            );
          })}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRows((list) => [...list, newRow()])}
            disabled={rows.length >= MAX_INSTRUMENTS}
            icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}
          >
            Enstrüman ekle {rows.length >= MAX_INSTRUMENTS ? `(en fazla ${MAX_INSTRUMENTS})` : ''}
          </Button>
          {show('rows') && <p className="text-xs text-down">{errors.rows}</p>}
        </fieldset>

        {/* Pencere (UTC) */}
        <fieldset>
          <legend className="mb-1.5 flex w-full flex-wrap items-center justify-between gap-2 text-sm font-medium text-fg/80">
            <span>Veri penceresi (UTC)</span>
            <Button variant="ghost" size="sm" onClick={fillFromSeries} disabled={!rows.some((r) => seriesByCode.get(r.series_code)?.from)}>
              Serinin tamamını kullan
            </Button>
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <DateTimeInput id={ids.from} label="Başlangıç" value={from} onChange={setFrom} error={show('from')} />
            <DateTimeInput id={ids.to} label="Bitiş" value={to} onChange={setTo} error={show('to')} />
          </div>
          <p className="mt-1.5 text-xs text-subtle">
            Tur süresi ne olursa olsun bu pencere sıkıştırılarak oynatılır. Her seride pencere içinde en az {MIN_WINDOW_POINTS} nokta olmalı.
          </p>
        </fieldset>

        <div>
          <label htmlFor={ids.brief} className="mb-1.5 block text-sm font-medium text-fg/80">
            Brifing <span className="font-normal text-subtle">(turdan önce; sonucu ele vermeden bağlamı anlat)</span>
          </label>
          <textarea
            id={ids.brief}
            rows={4}
            maxLength={LIMITS.briefingMax}
            value={briefing}
            onChange={(e) => setBriefing(e.target.value)}
            aria-invalid={!!show('briefing')}
            aria-describedby={show('briefing') ? `${ids.brief}-err` : undefined}
            placeholder="ör. Mart 2020'nin ilk haftası. Salgın haberleri yayılıyor, piyasalar gergin…"
            className={cn(textareaClass, show('briefing') ? 'border-down' : 'border-line')}
          />
          {show('briefing') && (
            <p id={`${ids.brief}-err`} className="mt-1.5 text-xs text-down">
              {errors.briefing}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={ids.debrief} className="mb-1.5 block text-sm font-medium text-fg/80">
            Ne oldu? <span className="font-normal text-subtle">(tur bittikten sonra gösterilir)</span>
          </label>
          <textarea
            id={ids.debrief}
            rows={4}
            maxLength={LIMITS.debriefMax}
            value={debrief}
            onChange={(e) => setDebrief(e.target.value)}
            placeholder="ör. 12 Mart'ta Bitcoin bir günde %40 düştü; ardından merkez bankalarının adımlarıyla hızla toparlandı…"
            className={cn(textareaClass, 'border-line')}
          />
          {touched && !debrief.trim() && <p className="mt-1.5 text-xs text-gold">Öneri: oyuncunun öğrenmesi için kısa bir açıklama ekle.</p>}
        </div>

        {serverError && <Alert tone="error">{serverError}</Alert>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {onCancel && (
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Vazgeç
            </Button>
          )}
          <Button type="submit" loading={busy} icon={<CheckIcon className="h-4 w-4" aria-hidden="true" />}>
            {scenario ? 'Değişiklikleri kaydet' : 'Taslak olarak kaydet'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

const dateInputClass =
  'h-11 w-full rounded-lg border bg-transparent px-4 text-sm text-fg shadow-card transition-[border-color,box-shadow] [color-scheme:inherit] hover:border-line-strong focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10';

function DateTimeInput({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        className={cn(dateInputClass, error ? 'border-down' : 'border-line')}
      />
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-xs text-down">
          {error}
        </p>
      )}
    </div>
  );
}

/** Seçili serinin pencere içindeki önizlemesi ve kapsama uyarısı */
function WindowPreview({ code, window }: { code: string; window: { from: string; to: string } | null }) {
  const { preview, loading, error } = useSeriesPreview(code, window ?? undefined, 300);
  if (loading) return <div className="mt-3 h-[96px] animate-pulse rounded-lg bg-surface-3" aria-hidden="true" />;
  if (error || !preview) return <p className="mt-3 text-xs text-down">Seri önizlemesi yüklenemedi.</p>;
  const inWindow = window ? preview.points.filter((p) => p.t >= Date.parse(window.from) && p.t <= Date.parse(window.to)) : preview.points;
  // Sunucu aralığı uyguladıysa toplam = pencere içi nokta; uygulamadıysa (yedek) süzülen nokta sayısı
  const ranged = inWindow.length === preview.points.length;
  const count = !window || ranged ? preview.total : inWindow.length;
  const thin = window && count < MIN_WINDOW_POINTS;
  return (
    <div className="mt-3">
      <p className={cn('mb-1 text-xs', thin ? 'text-down' : 'text-muted')}>
        {window
          ? thin
            ? `Pencerede yalnızca ${formatNumber(count, 0)} nokta var (en az ${MIN_WINDOW_POINTS} gerekli).`
            : `Pencerede ${formatNumber(count, 0)} nokta · ${formatUtc(window.from)} – ${formatUtc(window.to)}`
          : `Serinin tamamı · ${formatNumber(preview.total, 0)} nokta (pencere seçince daraltılır)`}
      </p>
      <LineChart
        points={window ? inWindow : preview.points}
        label={`${code} serisinin ${window ? 'pencere içi' : ''} önizlemesi`}
        height={90}
      />
    </div>
  );
}
