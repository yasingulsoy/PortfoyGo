'use client';

import { useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowUpTrayIcon, DocumentArrowUpIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { CircleStackIcon } from '@heroicons/react/24/outline';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, Badge } from '@portfoygo/shared/ui/Feedback';
import { Field } from '@portfoygo/shared/ui/Field';
import Button from '@portfoygo/shared/ui/Button';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn, formatNumber } from '@portfoygo/shared/format';
import { ApiError, scenarioApi } from '@/lib/api';
import { SERIES_CODE_RE, previewSeriesCsv, toSeriesCode, type CsvPreview } from '@/lib/seriesCsv';
import type { SeriesCurrency, SeriesImportResult } from '@/lib/types';
import { chipClass } from '@/components/arena/parts';
import { formatPrice, formatUtc, toImportResult, useSeriesPreview } from './data';
import LineChart from './LineChart';

/** Tarayıcıda okunacak en büyük dosya (sunucu sınırı ayrıca uygulanır) */
const MAX_FILE_BYTES = 9.5 * 1024 * 1024;

export const textareaClass =
  'w-full resize-y rounded-lg border bg-transparent px-4 py-2.5 text-sm text-fg shadow-card transition-[border-color,box-shadow] placeholder:text-subtle hover:border-line-strong focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10';

const SEP_LABEL: Record<string, string> = { ',': 'virgül', ';': 'noktalı virgül', '\t': 'sekme' };

const SAMPLE = 'date,close\n2020-03-09T00:00:00Z,7950.5\n2020-03-09T01:00:00Z,7890.1\n…';

/** "Tarihsel veri yükle" kartı: künye + CSV (dosya veya yapıştır) + tarayıcı önizlemesi → içe aktarma. */
export default function SeriesImport({ onImported }: { onImported: (code: string) => void }) {
  const toast = useToast();
  const ids = { csv: useId(), license: useId(), rights: useId(), file: useId() };
  const fileRef = useRef<HTMLInputElement>(null);

  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [currency, setCurrency] = useState<SeriesCurrency>('USD');
  const [source, setSource] = useState('');
  const [license, setLicense] = useState('');
  const [rights, setRights] = useState(false);
  const [replace, setReplace] = useState(false);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<SeriesImportResult | null>(null);

  const preview: CsvPreview | null = useMemo(() => (csv.trim() ? previewSeriesCsv(csv) : null), [csv]);
  const imported = useSeriesPreview(result?.series_code || null, undefined, 500);

  const c = code.trim();
  const errors = {
    code: !c ? 'Seri kodu gerekli' : !SERIES_CODE_RE.test(c) ? 'Yalnızca A–Z, 0–9 ve _ (3–40 karakter)' : undefined,
    label: label.trim().length < 2 ? 'Okunur bir ad gir' : label.trim().length > 80 ? 'En fazla 80 karakter' : undefined,
    source: source.trim().length < 3 ? 'Verinin kaynağını yaz (zorunlu)' : source.trim().length > 160 ? 'En fazla 160 karakter' : undefined,
    license: license.trim().length < 5 ? 'Lisans / kullanım hakkı notu zorunlu' : license.trim().length > 300 ? 'En fazla 300 karakter' : undefined,
    rights: rights ? undefined : 'Kullanım hakkını onayla',
    csv: !csv.trim() ? 'CSV dosyası seç veya içeriği yapıştır' : preview && !preview.ok ? (preview.error ?? 'CSV okunamadı') : undefined,
  };
  const valid = Object.values(errors).every((e) => !e);
  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFileError(null);
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setFileError(`Dosya çok büyük (${formatNumber(f.size / 1024 / 1024, 1)} MB). Sunucu en fazla ~10 MB kabul eder; daha küçük parçalara böl.`);
      e.target.value = '';
      return;
    }
    try {
      const text = await f.text();
      setCsv(text);
      setFileName(f.name);
      setResult(null);
      if (!code.trim()) setCode(toSeriesCode(f.name.replace(/\.[^.]+$/, '')));
      if (!label.trim()) setLabel(f.name.replace(/\.[^.]+$/, '').slice(0, 80));
    } catch {
      setFileError('Dosya okunamadı.');
    }
  };

  const clearFile = () => {
    setCsv('');
    setFileName(null);
    setFileError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    if (!valid || busy) return;
    setBusy(true);
    try {
      const res = await scenarioApi.importSeries({
        series_code: c,
        label: label.trim(),
        currency,
        source: source.trim(),
        license_note: license.trim(),
        csv,
        ...(replace ? { replace: true } : {}),
      });
      const r = toImportResult(res);
      const done = { ...r, series_code: r.series_code || c };
      setResult(done);
      toast.success('Seri içe aktarıldı', { description: `${c} · ${formatNumber(done.points, 0)} nokta` });
      onImported(done.series_code);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setServerError(
        status === 413
          ? 'Dosya sunucunun kabul ettiği boyutu aşıyor. Veriyi daha küçük parçalara bölüp aynı seri koduyla sırayla yükle (noktalar birleştirilir).'
          : err instanceof Error
            ? err.message
            : 'İçe aktarma başarısız.',
      );
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setCode('');
    setLabel('');
    setSource('');
    setLicense('');
    setRights(false);
    setReplace(false);
    clearFile();
    setTouched(false);
    setServerError(null);
    setResult(null);
  };

  return (
    <Card className="min-w-0">
      <CardHeader icon={<CircleStackIcon />} title="Tarihsel veri yükle" description="Lisanslı fiyat serisini CSV olarak içe aktar" />
      <form onSubmit={submit} noValidate className="space-y-5 border-t border-line px-5 py-5 sm:px-6">
        <Alert tone="info">
          <strong className="font-semibold">Yalnızca kullanım hakkına sahip olduğunuz lisanslı verileri yükleyin.</strong> Kaynak ve lisans notu
          zorunludur ve seriyle birlikte saklanır; borsa / veri sağlayıcı sitelerinden kazınmış veri yüklemeyin.
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Seri kodu"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onBlur={() => setCode((v) => toSeriesCode(v))}
            placeholder="BTC_2020_COVID"
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            error={show('code')}
            hint="Aynı kodla yeniden yüklemek noktaları birleştirir."
          />
          <Field label="Ad" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Bitcoin · Mart 2020" maxLength={80} error={show('label')} />
        </div>

        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-fg/80">Para birimi</legend>
          <div className="flex flex-wrap gap-2">
            {(['USD', 'TRY'] as const).map((cur) => (
              <label key={cur} className={chipClass}>
                <input type="radio" name="series-currency" value={cur} checked={currency === cur} onChange={() => setCurrency(cur)} className="sr-only" />
                {cur === 'USD' ? 'USD ($)' : 'TRY (₺)'}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-subtle">Arena enstrümanları (EURUSD, XAUUSD, BRENT, BTCUSD, XAGUSD) USD cinsindendir.</p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kaynak" value={source} onChange={(e) => setSource(e.target.value)} placeholder="ör. Kurum içi lisanslı veri paketi" maxLength={160} error={show('source')} />
          <div>
            <label htmlFor={ids.license} className="mb-1.5 block text-sm font-medium text-fg/80">
              Lisans notu
            </label>
            <textarea
              id={ids.license}
              rows={2}
              maxLength={300}
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              placeholder="ör. Sözleşme no / eğitim amaçlı yeniden kullanım izni"
              aria-invalid={!!show('license')}
              aria-describedby={show('license') ? `${ids.license}-err` : undefined}
              className={cn(textareaClass, show('license') ? 'border-down' : 'border-line')}
            />
            {show('license') && (
              <p id={`${ids.license}-err`} className="mt-1.5 text-xs text-down">
                {errors.license}
              </p>
            )}
          </div>
        </div>

        {/* CSV: dosya veya yapıştır */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={ids.csv} className="text-sm font-medium text-fg/80">
              CSV verisi
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {fileName && (
                <Badge tone="brand">
                  <DocumentArrowUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="max-w-[12rem] truncate">{fileName}</span>
                  <button type="button" onClick={clearFile} className="-mr-1 rounded-full p-0.5 hover:bg-brand/10" aria-label="Dosyayı kaldır">
                    <XMarkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </Badge>
              )}
              <input ref={fileRef} id={ids.file} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" onChange={(e) => void onFile(e)} className="sr-only" />
              <label htmlFor={ids.file} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-2 has-[:focus-visible]:ring-brand">
                <ArrowUpTrayIcon className="h-4 w-4" aria-hidden="true" />
                Dosya seç
              </label>
            </div>
          </div>
          <textarea
            id={ids.csv}
            rows={5}
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setFileName(null);
              setResult(null);
            }}
            placeholder={SAMPLE}
            spellCheck={false}
            aria-invalid={!!show('csv')}
            aria-describedby={`${ids.csv}-hint`}
            className={cn(textareaClass, 'num font-mono text-xs', show('csv') ? 'border-down' : 'border-line')}
          />
          <p id={`${ids.csv}-hint`} className={cn('text-xs', show('csv') ? 'text-down' : 'text-subtle')}>
            {show('csv') ??
              'Sütunlar: tarih/zaman + fiyat (veya OHLC; kapanış kullanılır). Ayırıcı , ; ya da sekme. Saat dilimi yoksa UTC kabul edilir.'}
          </p>
          {fileError && <Alert tone="error">{fileError}</Alert>}
        </div>

        {preview && <CsvPreviewPanel preview={preview} />}

        <label className="flex items-start gap-2.5 text-sm text-fg/80">
          <input
            type="checkbox"
            checked={replace}
            onChange={(e) => setReplace(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-[var(--brand)]"
          />
          <span>
            Bu kodla mevcut bir seri varsa noktalarını sil ve bu dosyayla değiştir
            <span className="block text-xs text-subtle">İşaretlemezsen yeni noktalar mevcut seriyle birleştirilir (aynı zaman damgasında yeni değer geçerli).</span>
          </span>
        </label>

        <label htmlFor={ids.rights} className="flex items-start gap-2.5 text-sm text-fg/80">
          <input
            id={ids.rights}
            type="checkbox"
            checked={rights}
            onChange={(e) => setRights(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-[var(--brand)]"
            aria-invalid={!!show('rights')}
          />
          <span>
            Bu verinin eğitim amaçlı yeniden oynatma için kullanım hakkına sahibim.
            {show('rights') && <span className="block text-xs text-down">{errors.rights}</span>}
          </span>
        </label>

        {serverError && <Alert tone="error">{serverError}</Alert>}

        {result && (
          <div className="space-y-3 rounded-xl border border-up/30 bg-up-soft/40 p-4" role="status">
            <p className="text-sm font-medium text-fg">
              <span className="font-semibold">{result.series_code}</span> serisinde artık {formatNumber(result.points, 0)} nokta var
              {result.from && result.to ? ` · ${formatUtc(result.from)} – ${formatUtc(result.to)}` : ''}.
            </p>
            {(result.rejected_rows > 0 || result.duplicates > 0) && (
              <p className="text-xs text-muted">
                Sunucu {formatNumber(result.rejected_rows, 0)} satırı reddetti
                {result.duplicates > 0 ? `, ${formatNumber(result.duplicates, 0)} yinelenen zaman damgasında son değer kullanıldı` : ''}.
                {result.rejected_samples.length > 0 &&
                  ` Örnek: ${result.rejected_samples
                    .slice(0, 3)
                    .map((r) => `satır ${r.line} (${r.reason})`)
                    .join(', ')}.`}
              </p>
            )}
            {imported.preview && imported.preview.points.length > 1 ? (
              <LineChart points={imported.preview.points} label={`${result.series_code} serisinin içe aktarılan fiyat grafiği`} height={120} />
            ) : imported.loading ? (
              <div className="h-[140px] animate-pulse rounded-xl bg-surface-3" aria-hidden="true" />
            ) : null}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={reset} disabled={busy}>
            Temizle
          </Button>
          <Button type="submit" loading={busy} icon={<ArrowUpTrayIcon className="h-4 w-4" aria-hidden="true" />}>
            İçe aktar
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Tarayıcıda ayrıştırılan ilk satırlar ve özet */
function CsvPreviewPanel({ preview }: { preview: CsvPreview }) {
  const cols = preview.columns;
  const headerCells = preview.header ?? (preview.rows[0]?.cells.map((_, i) => `Sütun ${i + 1}`) ?? []);
  return (
    <section aria-label="CSV önizlemesi" className="space-y-3 rounded-xl border border-line bg-surface-2 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={preview.ok ? 'up' : 'down'}>{preview.ok ? `${formatNumber(preview.points.length, 0)} geçerli nokta` : 'Okunamadı'}</Badge>
        {preview.separator && <Badge>Ayırıcı: {SEP_LABEL[preview.separator]}</Badge>}
        <Badge>{preview.header ? 'Başlıklı' : 'Başlıksız'}</Badge>
        {preview.rejected > 0 && <Badge tone="gold">{formatNumber(preview.rejected, 0)} hatalı satır</Badge>}
        {preview.duplicates > 0 && <Badge tone="gold">{formatNumber(preview.duplicates, 0)} yinelenen zaman</Badge>}
      </div>
      {preview.error && !preview.ok && <p className="text-sm text-down">{preview.error}</p>}

      {preview.rows.length > 0 && (
        <div className="relative max-w-full overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="min-w-full text-xs">
            <caption className="sr-only">İlk {preview.rows.length} veri satırı</caption>
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th scope="col" className="px-3 py-2 font-medium">
                  #
                </th>
                {headerCells.map((h, i) => (
                  <th
                    key={i}
                    scope="col"
                    className={cn('whitespace-nowrap px-3 py-2 font-medium', cols && (i === cols.date || i === cols.time || i === cols.price) && 'text-brand')}
                  >
                    {h}
                    {cols && i === cols.price && <span className="ml-1 text-[10px] text-subtle">(fiyat)</span>}
                  </th>
                ))}
                <th scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                  Okunan
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {preview.rows.map((r) => (
                <tr key={r.line} className={r.error ? 'bg-down-soft/50' : undefined}>
                  <td className="num px-3 py-1.5 text-subtle">{r.line}</td>
                  {headerCells.map((_, i) => (
                    <td key={i} className="num whitespace-nowrap px-3 py-1.5 font-mono text-fg/80">
                      {r.cells[i] ?? ''}
                    </td>
                  ))}
                  <td className="num whitespace-nowrap px-3 py-1.5">
                    {r.error ? <span className="text-down">{r.error}</span> : <span className="text-fg">{`${formatUtc(r.ts)} → ${formatPrice(r.price)}`}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview.ok && (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-subtle">Başlangıç</dt>
              <dd className="num text-fg">{formatUtc(preview.from)}</dd>
            </div>
            <div>
              <dt className="text-subtle">Bitiş</dt>
              <dd className="num text-fg">{formatUtc(preview.to)}</dd>
            </div>
            <div>
              <dt className="text-subtle">En düşük</dt>
              <dd className="num text-fg">{formatPrice(preview.min)}</dd>
            </div>
            <div>
              <dt className="text-subtle">En yüksek</dt>
              <dd className="num text-fg">{formatPrice(preview.max)}</dd>
            </div>
          </dl>
          <LineChart points={preview.points.map((p) => ({ t: p.ts, p: p.price }))} label="CSV önizleme grafiği (tarayıcıda okunan)" height={110} />
        </>
      )}
    </section>
  );
}
