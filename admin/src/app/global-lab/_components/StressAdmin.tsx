'use client';

import { useState } from 'react';
import { PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/react/20/solid';
import { BoltIcon } from '@heroicons/react/24/outline';
import { Card } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import Modal from '@portfoygo/shared/ui/Modal';
import { Alert, Badge, EmptyState } from '@portfoygo/shared/ui/Feedback';
import { cn } from '@portfoygo/shared/format';
import { TableCardHeader, TableSkeleton } from '@/components/ui';
import { ConfirmModal, LoadError } from '@/components/controls';
import { fmtNum, labAdminApi, parseNum, useAssumptions, type Assumption, type Stress } from './data';

const control =
  'w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg shadow-card focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10';

/** Stres senaryoları: yaklaşık, USD bazlı şoklar (%); TL bazında kur şokuyla birleştirilir. */
export default function StressAdmin() {
  const view = useAssumptions();
  const [editing, setEditing] = useState<Stress | 'new' | null>(null);
  const [removing, setRemoving] = useState<Stress | null>(null);

  if (view.isLoading && !view.data) {
    return (
      <Card className="overflow-hidden">
        <TableSkeleton rows={4} />
      </Card>
    );
  }
  if (!view.data) return <LoadError error={view.error} onRetry={() => void view.mutate()} />;
  const v = view.data;
  const labelOf = new Map(v.assumptions.map((a) => [a.key, a.label]));

  return (
    <Card className="min-w-0 overflow-hidden">
      <TableCardHeader
        title="Stres senaryoları"
        description={v.stress_note}
        actions={
          <Button size="sm" onClick={() => setEditing('new')} icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}>
            Yeni senaryo
          </Button>
        }
      />
      {v.stress.length === 0 ? (
        <EmptyState className="border-t border-line" icon={<BoltIcon />} title="Stres senaryosu yok" />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {v.stress.map((s) => {
            const entries = Object.entries(s.shocks).sort((a, b) => a[1] - b[1]);
            return (
              <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                    {s.name}
                    {!s.active && <Badge tone="gold">Pasif</Badge>}
                    <code className="text-xs font-normal text-subtle">{s.id}</code>
                  </p>
                  <p className="text-xs text-muted">
                    {s.period_label ?? '—'} · {s.source}
                  </p>
                  <p className="mt-2 flex flex-wrap gap-1">
                    {entries.slice(0, 8).map(([k, val]) => (
                      <span key={k} className={cn('num rounded-md border border-line px-1.5 py-0.5 text-[11px]', val < 0 ? 'text-down' : 'text-up')}>
                        {labelOf.get(k) ?? k} {val > 0 ? '+' : ''}
                        {fmtNum(val, 1)}%
                      </span>
                    ))}
                    {entries.length > 8 && <span className="text-[11px] text-subtle">+{entries.length - 8}</span>}
                  </p>
                </div>
                <span className="inline-flex shrink-0 gap-1">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(s)} icon={<PencilSquareIcon className="h-4 w-4" aria-hidden="true" />}>
                    Düzenle
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(s)} icon={<TrashIcon className="h-4 w-4" aria-hidden="true" />} aria-label={`${s.name} sil`} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <StressForm target={editing} assumptions={v.assumptions} onClose={() => setEditing(null)} onSaved={() => void view.mutate()} />
      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Stres senaryosunu sil"
        description={removing ? `“${removing.name}” silinecek; kullanıcı analizlerinde artık görünmez.` : undefined}
        confirmLabel="Sil"
        tone="danger"
        onConfirm={async () => {
          if (!removing) return;
          await labAdminApi.deleteStress(removing.id);
          setRemoving(null);
          void view.mutate();
        }}
      />
    </Card>
  );
}

function StressForm({ target, assumptions, onClose, onSaved }: { target: Stress | 'new' | null; assumptions: Assumption[]; onClose: () => void; onSaved: () => void }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [period, setPeriod] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('');
  const [note, setNote] = useState('');
  const [active, setActive] = useState(true);
  const [shocks, setShocks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prev, setPrev] = useState<typeof target>(null);
  if (target !== prev) {
    setPrev(target);
    if (target) {
      const t = target === 'new' ? null : target;
      setId(t?.id ?? '');
      setName(t?.name ?? '');
      setPeriod(t?.period_label ?? '');
      setDescription(t?.description ?? '');
      setSource(t?.source ?? '');
      setNote(t?.note ?? '');
      setActive(t?.active ?? true);
      setShocks(Object.fromEntries(Object.entries(t?.shocks ?? {}).map(([k, v]) => [k, fmtNum(v, 2)])));
      setError('');
    }
  }

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(shocks)) {
        if (!v.trim()) continue;
        const n = parseNum(v);
        if (Number.isNaN(n)) throw new Error(`${k}: şok sayı olmalı`);
        out[k] = n;
      }
      await labAdminApi.upsertStress(id.trim().toLowerCase(), {
        name: name.trim(),
        period_label: period.trim() || null,
        description: description.trim() || null,
        shocks: out,
        source: source.trim(),
        note: note.trim() || null,
        active,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!target}
      onClose={() => !busy && onClose()}
      title={target === 'new' ? 'Yeni stres senaryosu' : 'Stres senaryosunu düzenle'}
      description="Şoklar USD bazında yüzde; boş bırakılan hücrelerde aynı sınıfın Küresel şoku, o da yoksa 0 kullanılır."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!id.trim() || name.trim().length < 3 || source.trim().length < 3}>
            Kaydet
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Kimlik (a-z, 0-9, -)</span>
            <input value={id} onChange={(e) => setId(e.target.value)} disabled={target !== 'new'} placeholder="ornek-sok" className={cn(control, 'h-10')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Ad</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={cn(control, 'h-10')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Dönem</span>
            <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Şub – Mar 2020" className={cn(control, 'h-10')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Kaynak</span>
            <input value={source} onChange={(e) => setSource(e.target.value)} className={cn(control, 'h-10')} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Açıklama</span>
          <textarea rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} className={cn(control, 'resize-y py-2')} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Not</span>
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className={cn(control, 'h-10')} />
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Kullanıcı analizlerinde göster
        </label>
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-muted">Şoklar (%)</legend>
          <div className="grid max-h-72 grid-cols-1 gap-x-4 gap-y-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {assumptions.map((a) => (
              <label key={a.key} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-fg">{a.label}</span>
                <input
                  inputMode="decimal"
                  value={shocks[a.key] ?? ''}
                  onChange={(e) => setShocks((s) => ({ ...s, [a.key]: e.target.value }))}
                  placeholder="—"
                  className="num h-8 w-20 shrink-0 rounded-lg border border-line bg-surface px-2 text-right text-sm text-fg shadow-card focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10"
                />
              </label>
            ))}
          </div>
        </fieldset>
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
