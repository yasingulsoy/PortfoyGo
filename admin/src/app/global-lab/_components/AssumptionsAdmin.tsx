'use client';

import { useMemo, useState } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import { Alert, Badge } from '@portfoygo/shared/ui/Feedback';
import { cn } from '@portfoygo/shared/format';
import { TableCardHeader, TableSkeleton, table } from '@/components/ui';
import { LoadError, SelectField } from '@/components/controls';
import { fmtNum, labAdminApi, parseNum, useAssumptions, type Assumption, type AssumptionsView } from './data';

const cellInput =
  'h-9 w-full rounded-md border border-line bg-surface px-2 text-sm text-fg focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10';

type Draft = Record<string, { er: string; vol: string; source: string; as_of: string; note: string }>;

const toDraft = (rows: Assumption[]): Draft =>
  Object.fromEntries(
    rows.map((r) => [r.key, { er: fmtNum(r.expected_return_pct), vol: fmtNum(r.volatility_pct), source: r.source, as_of: r.as_of ?? '', note: r.note ?? '' }]),
  );

/** Sermaye piyasası varsayımları (ÖRNEK; USD bazında, yıllık) + korelasyon matrisi. */
export default function AssumptionsAdmin() {
  const view = useAssumptions();
  if (view.isLoading && !view.data) {
    return (
      <Card className="overflow-hidden">
        <TableSkeleton rows={8} />
      </Card>
    );
  }
  if (!view.data) return <LoadError error={view.error} onRetry={() => void view.mutate()} />;
  return (
    <div className="space-y-6">
      <Alert tone="info">
        <strong>{view.data.note}</strong> Tüm değerler USD bazında ve yıllıktır; TL bazlı analizde “USD/TRY yıllık değişim” satırı eklenir. Beklenen getiri
        aritmetik ortalama, volatilite log getirinin standart sapmasıdır.
      </Alert>
      <CmaTable view={view.data} onSaved={(v) => void view.mutate(v, { revalidate: false })} />
      <CorrelationEditor view={view.data} onSaved={(v) => void view.mutate(v, { revalidate: false })} />
    </div>
  );
}

function CmaTable({ view, onSaved }: { view: AssumptionsView; onSaved: (v: AssumptionsView) => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(view.assumptions));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const original = useMemo(() => toDraft(view.assumptions), [view.assumptions]);
  const changed = Object.keys(draft).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(original[k]));

  const set = (key: string, field: keyof Draft[string], value: string) => setDraft((d) => ({ ...d, [key]: { ...d[key], [field]: value } }));

  const save = async () => {
    setBusy(true);
    setError('');
    setOk('');
    try {
      const rows = changed.map((k) => {
        const d = draft[k];
        const er = parseNum(d.er);
        const vol = parseNum(d.vol);
        if (Number.isNaN(er) || Number.isNaN(vol)) throw new Error(`${k}: getiri ve volatilite sayı olmalı`);
        return { key: k, expected_return_pct: er, volatility_pct: vol, source: d.source.trim(), as_of: d.as_of.trim() || null, note: d.note.trim() || null };
      });
      const res = await labAdminApi.updateAssumptions(rows);
      if (res.data) {
        onSaved(res.data);
        setDraft(toDraft(res.data.assumptions));
      }
      setOk(`${rows.length} varsayım güncellendi`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="min-w-0 overflow-hidden">
      <TableCardHeader
        title="Getiri ve volatilite varsayımları"
        description="Varlık sınıfı × bölge (+ USD/TRY). Kaynak ve tarih belirtin."
        actions={
          <>
            {changed.length > 0 && <Badge tone="gold">{changed.length} değişiklik</Badge>}
            <Button size="sm" variant="secondary" disabled={!changed.length || busy} onClick={() => setDraft(original)}>
              Geri al
            </Button>
            <Button size="sm" loading={busy} disabled={!changed.length} onClick={() => void save()}>
              Kaydet
            </Button>
          </>
        }
      />
      {(error || ok) && (
        <div className="px-5 pb-3 sm:px-6">
          <Alert tone={error ? 'error' : 'success'}>{error || ok}</Alert>
        </div>
      )}
      <div className={table.wrap}>
        <table className={cn(table.table, 'min-w-[56rem]')}>
          <caption className="sr-only">Sermaye piyasası varsayımları</caption>
          <thead>
            <tr className={table.headRow}>
              <th scope="col" className={table.th}>
                Hücre
              </th>
              <th scope="col" className={cn(table.th, 'w-24 text-right')}>
                Getiri %
              </th>
              <th scope="col" className={cn(table.th, 'w-24 text-right')}>
                Volatilite %
              </th>
              <th scope="col" className={table.th}>
                Kaynak
              </th>
              <th scope="col" className={cn(table.th, 'w-36')}>
                Tarih
              </th>
              <th scope="col" className={table.th}>
                Not
              </th>
            </tr>
          </thead>
          <tbody className={table.body}>
            {view.assumptions.map((a) => {
              const d = draft[a.key];
              const dirty = changed.includes(a.key);
              return (
                <tr key={a.key} className={cn('align-top', dirty && 'bg-gold-soft/40')}>
                  <td className={cn(table.td, 'whitespace-nowrap')}>
                    <p className="font-medium text-fg">{a.label}</p>
                    <p className="text-xs text-subtle">
                      <code>{a.key}</code>
                      {a.updated_by_username ? ` · ${a.updated_by_username}` : ''}
                    </p>
                  </td>
                  <td className={cn(table.td, 'px-2 sm:px-2')}>
                    <input aria-label={`${a.label} beklenen getiri`} inputMode="decimal" value={d.er} onChange={(e) => set(a.key, 'er', e.target.value)} className={cn(cellInput, 'num text-right')} />
                  </td>
                  <td className={cn(table.td, 'px-2 sm:px-2')}>
                    <input aria-label={`${a.label} volatilite`} inputMode="decimal" value={d.vol} onChange={(e) => set(a.key, 'vol', e.target.value)} className={cn(cellInput, 'num text-right')} />
                  </td>
                  <td className={cn(table.td, 'px-2 sm:px-2')}>
                    <input aria-label={`${a.label} kaynak`} value={d.source} onChange={(e) => set(a.key, 'source', e.target.value)} className={cellInput} />
                  </td>
                  <td className={cn(table.td, 'px-2 sm:px-2')}>
                    <input aria-label={`${a.label} tarih`} type="date" value={d.as_of} onChange={(e) => set(a.key, 'as_of', e.target.value)} className={cn(cellInput, '[color-scheme:inherit]')} />
                  </td>
                  <td className={cn(table.td, 'px-2 sm:px-2')}>
                    <input aria-label={`${a.label} not`} value={d.note} maxLength={300} onChange={(e) => set(a.key, 'note', e.target.value)} className={cellInput} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const pairKey = (a: string, b: string) => (a < b ? `${a}~${b}` : `${b}~${a}`);

function CorrelationEditor({ view, onSaved }: { view: AssumptionsView; onSaved: (v: AssumptionsView) => void }) {
  const labelOf = useMemo(() => new Map(view.assumptions.map((a) => [a.key, a.label])), [view.assumptions]);
  const rhoMap = useMemo(() => new Map(view.correlations.map((c) => [pairKey(c.key_a, c.key_b), c.rho])), [view.correlations]);
  const [row, setRow] = useState(view.keys[0] ?? '');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rho = (a: string, b: string) => (a === b ? 1 : rhoMap.get(pairKey(a, b)) ?? 0);

  const pick = (k: string) => {
    setRow(k);
    setDraft({});
    setError('');
  };
  const changed = Object.entries(draft).filter(([other, v]) => {
    const n = parseNum(v);
    return !Number.isNaN(n) && Math.abs(n - rho(row, other)) > 1e-9;
  });

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const pairs = changed.map(([other, v]) => ({ key_a: row, key_b: other, rho: parseNum(v) }));
      if (pairs.some((p) => p.rho < -1 || p.rho > 1)) throw new Error('Korelasyon -1 ile 1 arasında olmalı');
      const res = await labAdminApi.updateCorrelations(pairs);
      if (res.data) onSaved(res.data);
      setDraft({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const heat = (r: number) => (r >= 0 ? `color-mix(in srgb, var(--brand) ${Math.round(Math.abs(r) * 70)}%, var(--surface))` : `color-mix(in srgb, var(--down) ${Math.round(Math.abs(r) * 70)}%, var(--surface))`);
  const psdOk = view.min_eigenvalue >= -1e-10;

  return (
    <Card className="min-w-0 overflow-hidden">
      <TableCardHeader
        title="Korelasyon matrisi"
        description="Bir satır seçip diğer tüm varsayımlarla korelasyonunu düzenle (köşegen = 1)."
        actions={
          psdOk ? (
            <Badge tone="up">Pozitif tanımlı · en küçük özdeğer {view.min_eigenvalue.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}</Badge>
          ) : (
            <Badge tone="gold">
              <ExclamationTriangleIcon className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              Pozitif tanımlı değil — hesapta en yakın geçerli matrise düzeltilir
            </Badge>
          )
        }
      />
      <div className="grid grid-cols-1 gap-6 border-t border-line p-5 sm:p-6 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          <SelectField label="Satır" value={row} onChange={(e) => pick(e.target.value)} options={view.keys.map((k) => ({ value: k, label: labelOf.get(k) ?? k }))} />
          <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
            {view.keys
              .filter((k) => k !== row)
              .map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{labelOf.get(k) ?? k}</span>
                  <input
                    aria-label={`${labelOf.get(row)} – ${labelOf.get(k)} korelasyonu`}
                    inputMode="decimal"
                    value={draft[k] ?? fmtNum(rho(row, k), 3)}
                    onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                    className={cn(cellInput, 'num w-20 text-right', draft[k] !== undefined && 'border-gold')}
                  />
                </li>
              ))}
          </ul>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex gap-2">
            <Button size="sm" loading={busy} disabled={!changed.length} onClick={() => void save()}>
              Kaydet ({changed.length})
            </Button>
            <Button size="sm" variant="secondary" disabled={!Object.keys(draft).length || busy} onClick={() => setDraft({})}>
              Geri al
            </Button>
          </div>
        </div>
        <div className="min-w-0 lg:col-span-3">
          <p className="mb-2 text-xs font-medium text-muted">Matris (salt okunur ısı haritası; satıra tıklayıp düzenle)</p>
          <div className="relative max-w-full overflow-x-auto">
            <table className="border-separate border-spacing-0.5 text-[10px]">
              <caption className="sr-only">Korelasyon matrisi ısı haritası</caption>
              <tbody>
                {view.keys.map((a) => (
                  <tr key={a}>
                    <th scope="row" className="pr-2 text-left font-medium whitespace-nowrap">
                      <button type="button" onClick={() => pick(a)} className={cn('hover:text-brand', a === row ? 'text-brand' : 'text-muted')}>
                        {labelOf.get(a) ?? a}
                      </button>
                    </th>
                    {view.keys.map((b) => {
                      const r = rho(a, b);
                      return (
                        <td key={b} title={`${labelOf.get(a)} × ${labelOf.get(b)}: ${fmtNum(r, 2)}`} className="num h-6 w-6 min-w-6 rounded text-center text-fg" style={{ background: heat(r) }}>
                          <span className="sr-only">{fmtNum(r, 2)}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-subtle">Mavi: pozitif, kırmızı: negatif korelasyon; ton şiddeti büyüklüğü gösterir.</p>
        </div>
      </div>
    </Card>
  );
}
