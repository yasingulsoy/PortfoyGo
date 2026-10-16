'use client';

import { useMemo, useState } from 'react';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/react/20/solid';
import { GlobeAltIcon } from '@heroicons/react/24/outline';
import { Card } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import Modal from '@portfoygo/shared/ui/Modal';
import { Alert, Badge, EmptyState } from '@portfoygo/shared/ui/Feedback';
import { cn, formatNumber } from '@portfoygo/shared/format';
import { TableCardHeader, TableSkeleton, table } from '@/components/ui';
import { ConfirmModal, LoadError, SearchInput, SelectField } from '@/components/controls';
import { downloadCsv } from '@/lib/csv';
import CsvImportModal from './CsvImportModal';
import { ASSET_CLASSES, CLASS_LABELS, REGIONS, VEHICLES, VEHICLE_LABELS, fmtNum, labAdminApi, parseNum, useLabInstruments, type Instrument, type InstrumentInput } from './data';

const control =
  'h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-fg shadow-card focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10';

/** Katalog: arama / sınıf filtresi, ekle / düzenle / sil, CSV içe / dışa aktarma. */
export default function CatalogAdmin({ onChanged }: { onChanged?: () => void }) {
  const list = useLabInstruments();
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const [editing, setEditing] = useState<Instrument | 'new' | null>(null);
  const [removing, setRemoving] = useState<Instrument | null>(null);
  const [importing, setImporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const items = useMemo(() => {
    const all = list.data?.items ?? [];
    const t = q.trim().toLocaleLowerCase('tr-TR');
    return all.filter(
      (i) => (!cls || i.asset_class === cls) && (!t || i.symbol.toLocaleLowerCase('tr-TR').includes(t) || i.name.toLocaleLowerCase('tr-TR').includes(t)),
    );
  }, [list.data, q, cls]);

  const refresh = () => {
    void list.mutate();
    onChanged?.();
  };

  const exportCsv = async () => {
    setExportError('');
    try {
      const r = await labAdminApi.exportInstruments();
      downloadCsv(r.filename, r.csv);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Dışa aktarılamadı');
    }
  };

  return (
    <Card className="min-w-0 overflow-hidden">
      <TableCardHeader
        title="Araştırma kataloğu"
        description={list.data ? `${formatNumber(list.data.total, 0)} araç · ${list.data.items.filter((i) => !i.active).length} pasif` : 'Yükleniyor'}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void exportCsv()} icon={<ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />}>
              CSV indir
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setImporting(true)} icon={<ArrowUpTrayIcon className="h-4 w-4" aria-hidden="true" />}>
              CSV yükle
            </Button>
            <Button size="sm" onClick={() => setEditing('new')} icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}>
              Yeni araç
            </Button>
          </>
        }
      />
      {exportError && (
        <div className="px-5 pb-3 sm:px-6">
          <Alert tone="error">{exportError}</Alert>
        </div>
      )}
      <div className="flex flex-col gap-3 px-5 pb-4 sm:flex-row sm:items-end sm:px-6">
        <SearchInput value={q} onChange={setQ} placeholder="Sembol veya ad" label="Katalogda ara" />
        <SelectField
          label="Varlık sınıfı"
          hideLabel
          value={cls}
          onChange={(e) => setCls(e.target.value)}
          options={[{ value: '', label: 'Tüm sınıflar' }, ...ASSET_CLASSES.map((c) => ({ value: c, label: CLASS_LABELS[c] }))]}
          className="w-full sm:w-56"
        />
      </div>
      {list.isLoading && !list.data ? (
        <TableSkeleton rows={6} />
      ) : list.error && !list.data ? (
        <LoadError error={list.error} onRetry={() => void list.mutate()} />
      ) : items.length === 0 ? (
        <EmptyState className="border-t border-line" icon={<GlobeAltIcon />} title="Araç yok" description="Filtreyi değiştir ya da yeni araç ekle." />
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <caption className="sr-only">Global Portföy Lab kataloğu</caption>
            <thead>
              <tr className={table.headRow}>
                <th scope="col" className={table.th}>
                  Araç
                </th>
                <th scope="col" className={cn(table.th, 'hidden md:table-cell')}>
                  Sınıf · bölge
                </th>
                <th scope="col" className={cn(table.th, 'hidden text-right lg:table-cell')}>
                  Risk · gider
                </th>
                <th scope="col" className={cn(table.th, 'hidden xl:table-cell')}>
                  Fiyat bağlantısı
                </th>
                <th scope="col" className={cn(table.th, 'text-right')}>
                  <span className="sr-only">Eylemler</span>
                </th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {items.map((i) => (
                <tr key={i.id} className="align-top transition-colors hover:bg-surface-2">
                  <td className={table.td}>
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="num font-semibold text-fg">{i.symbol}</span>
                      <Badge>{VEHICLE_LABELS[i.vehicle] ?? i.vehicle}</Badge>
                      {!i.active && <Badge tone="gold">Pasif</Badge>}
                    </p>
                    <p className="max-w-xs truncate text-xs text-subtle">{i.name}</p>
                    <p className="mt-1 text-xs text-subtle md:hidden">
                      {CLASS_LABELS[i.asset_class]} · {i.region} · {i.currency}
                    </p>
                  </td>
                  <td className={cn(table.td, 'hidden md:table-cell')}>
                    <p className="text-fg">
                      {CLASS_LABELS[i.asset_class]} · {i.region}
                    </p>
                    <p className="text-xs text-subtle">
                      {i.currency}
                      {i.country ? ` · ${i.country}` : ''}
                      {i.sub_class ? ` · ${i.sub_class}` : ''}
                    </p>
                  </td>
                  <td className={cn(table.td, 'num hidden whitespace-nowrap text-right lg:table-cell')}>
                    <p className="text-fg">{i.risk_level}/7</p>
                    <p className="text-xs text-subtle">{i.expense_ratio_pct === null ? '—' : `%${fmtNum(i.expense_ratio_pct, 3)}`}</p>
                  </td>
                  <td className={cn(table.td, 'hidden xl:table-cell')}>
                    <code className="text-xs">{i.provider_symbol ?? '—'}</code>
                    <p className="text-xs text-subtle">{i.notes_count} not</p>
                  </td>
                  <td className={cn(table.td, 'whitespace-nowrap text-right')}>
                    <span className="inline-flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(i)} icon={<PencilSquareIcon className="h-4 w-4" aria-hidden="true" />} aria-label={`${i.symbol} düzenle`}>
                        <span className="hidden sm:inline">Düzenle</span>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(i)} icon={<TrashIcon className="h-4 w-4" aria-hidden="true" />} aria-label={`${i.symbol} sil`} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InstrumentForm
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Aracı sil"
        description={removing ? `${removing.symbol} ve ona bağlı araştırma notları silinir; kullanıcıların araştırma listelerinden de çıkar. Geçici gizlemek için “Pasif” yapmanız önerilir.` : undefined}
        confirmLabel="Sil"
        tone="danger"
        onConfirm={async () => {
          if (!removing) return;
          await labAdminApi.deleteInstrument(removing.id);
          setRemoving(null);
          refresh();
        }}
      />
      <CsvImportModal kind="instruments" open={importing} onClose={() => setImporting(false)} onDone={refresh} />
    </Card>
  );
}

type FormState = Record<keyof InstrumentInput, string>;

const EMPTY: FormState = {
  symbol: '',
  name: '',
  vehicle: 'ETF',
  asset_class: 'hisse',
  sub_class: '',
  region: 'Küresel',
  country: '',
  currency: 'USD',
  risk_level: '4',
  expense_ratio_pct: '',
  description_tr: '',
  data_source: '',
  license_note: '',
  provider_symbol: '',
  active: 'true',
};

function toForm(i: Instrument): FormState {
  return {
    symbol: i.symbol,
    name: i.name,
    vehicle: i.vehicle,
    asset_class: i.asset_class,
    sub_class: i.sub_class ?? '',
    region: i.region,
    country: i.country ?? '',
    currency: i.currency,
    risk_level: String(i.risk_level),
    expense_ratio_pct: i.expense_ratio_pct === null ? '' : fmtNum(i.expense_ratio_pct, 3),
    description_tr: i.description_tr ?? '',
    data_source: i.data_source,
    license_note: i.license_note,
    provider_symbol: i.provider_symbol ?? '',
    active: i.active ? 'true' : 'false',
  };
}

function InstrumentForm({ target, onClose, onSaved }: { target: Instrument | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prev, setPrev] = useState<typeof target>(null);
  if (target !== prev) {
    setPrev(target);
    if (target) {
      setForm(target === 'new' ? EMPTY : toForm(target));
      setError('');
    }
  }
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setError('');
    const er = form.expense_ratio_pct.trim() ? parseNum(form.expense_ratio_pct) : null;
    if (er !== null && Number.isNaN(er)) {
      setBusy(false);
      return setError('Gider oranı sayı olmalı');
    }
    const body: Partial<InstrumentInput> = {
      symbol: form.symbol.trim(),
      name: form.name.trim(),
      vehicle: form.vehicle,
      asset_class: form.asset_class,
      sub_class: form.sub_class.trim() || null,
      region: form.region,
      country: form.country.trim() || null,
      currency: form.currency.trim(),
      risk_level: Number(form.risk_level),
      expense_ratio_pct: er,
      description_tr: form.description_tr.trim() || null,
      data_source: form.data_source.trim(),
      license_note: form.license_note.trim(),
      provider_symbol: form.provider_symbol.trim() || null,
      active: form.active === 'true',
    };
    try {
      if (target === 'new') await labAdminApi.createInstrument(body);
      else if (target) await labAdminApi.updateInstrument(target.id, body);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const field = (k: keyof FormState, label: string, opts: { placeholder?: string; className?: string; hint?: string } = {}) => (
    <label className={cn('block', opts.className)}>
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <input value={form[k]} onChange={set(k)} placeholder={opts.placeholder} className={control} />
      {opts.hint && <span className="mt-1 block text-[11px] text-subtle">{opts.hint}</span>}
    </label>
  );
  const select = (k: keyof FormState, label: string, options: { value: string; label: string }[]) => (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <select value={form[k]} onChange={set(k)} className={control}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Modal
      open={!!target}
      onClose={() => !busy && onClose()}
      title={target === 'new' ? 'Yeni araç' : `Düzenle: ${target ? target.symbol : ''}`}
      description="Yalnızca tanımlayıcı bilgi; üçüncü taraf metni kopyalamayın. Kaynak ve lisans notu zorunlu."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button onClick={() => void submit()} loading={busy}>
            Kaydet
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field('symbol', 'Sembol', { placeholder: 'VT' })}
        {field('name', 'Ad', { placeholder: 'Vanguard Total World Stock ETF' })}
        {select('vehicle', 'Araç türü', VEHICLES.map((v) => ({ value: v, label: VEHICLE_LABELS[v] })))}
        {select('asset_class', 'Varlık sınıfı', ASSET_CLASSES.map((c) => ({ value: c, label: CLASS_LABELS[c] })))}
        {select('region', 'Bölge', REGIONS.map((r) => ({ value: r, label: r })))}
        {field('sub_class', 'Alt sınıf', { placeholder: 'Büyük ölçekli' })}
        {field('country', 'Ülke (ISO, isteğe bağlı)', { placeholder: 'US' })}
        {field('currency', 'Para birimi', { placeholder: 'USD' })}
        {select('risk_level', 'Risk seviyesi (1–7)', [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) })))}
        {field('expense_ratio_pct', 'Yıllık gider oranı (%)', { placeholder: '0,07' })}
        {field('provider_symbol', 'Fiyat bağlantısı', { placeholder: 'crypto:BTC', hint: 'stock: / crypto: / currency: / commodity: + uygulamadaki sembol' })}
        {select('active', 'Durum', [
          { value: 'true', label: 'Aktif (kullanıcılar görür)' },
          { value: 'false', label: 'Pasif (gizli)' },
        ])}
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-medium text-muted">Açıklama (kendi cümlelerinizle, en fazla 600)</span>
          <textarea
            rows={3}
            maxLength={600}
            value={form.description_tr}
            onChange={set('description_tr')}
            className="w-full resize-y rounded-lg border border-line bg-transparent px-3.5 py-2.5 text-sm text-fg shadow-card focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10"
          />
        </label>
        {field('data_source', 'Veri kaynağı', { placeholder: 'İhraççı ürün sayfası (2026-10)' })}
        {field('license_note', 'Lisans notu', { placeholder: 'Yalnızca tanımlayıcı bilgi' })}
      </div>
      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}
    </Modal>
  );
}
