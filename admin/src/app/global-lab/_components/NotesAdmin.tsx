'use client';

import { useState } from 'react';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/react/20/solid';
import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { Card } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import Modal from '@portfoygo/shared/ui/Modal';
import { Alert, EmptyState } from '@portfoygo/shared/ui/Feedback';
import { cn, formatDate, formatNumber } from '@portfoygo/shared/format';
import { TableCardHeader, TableSkeleton, table } from '@/components/ui';
import { ConfirmModal, LoadError, Pagination, SelectField } from '@/components/controls';
import { downloadCsv } from '@/lib/csv';
import CsvImportModal from './CsvImportModal';
import { labAdminApi, useLabInstruments, useLabNotes, type Note } from './data';

const LIMIT = 25;
const control =
  'w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-fg shadow-card focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10';

/** Araştırma notları: araç filtresi, ekle / düzenle / sil, CSV içe / dışa aktarma. Ücretsiz kullanıcılar yalnızca başlığı görür. */
export default function NotesAdmin() {
  const instruments = useLabInstruments();
  const [instrumentId, setInstrumentId] = useState('');
  const [offset, setOffset] = useState(0);
  const notes = useLabNotes({ instrument_id: instrumentId || undefined, limit: LIMIT, offset });
  const [editing, setEditing] = useState<Note | 'new' | null>(null);
  const [removing, setRemoving] = useState<Note | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const items = notes.data?.items ?? [];
  const options = [{ value: '', label: 'Tüm araçlar' }, ...(instruments.data?.items ?? []).map((i) => ({ value: i.id, label: `${i.symbol} — ${i.name}` }))];

  const exportCsv = async () => {
    setError('');
    try {
      const r = await labAdminApi.exportNotes();
      downloadCsv(r.filename, r.csv);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dışa aktarılamadı');
    }
  };

  return (
    <Card className="min-w-0 overflow-hidden">
      <TableCardHeader
        title="Araştırma notları"
        description={notes.data ? `${formatNumber(notes.data.total, 0)} not · ücretsiz planda yalnızca başlık görünür` : 'Yükleniyor'}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void exportCsv()} icon={<ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />}>
              CSV indir
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setImporting(true)} icon={<ArrowUpTrayIcon className="h-4 w-4" aria-hidden="true" />}>
              CSV yükle
            </Button>
            <Button size="sm" onClick={() => setEditing('new')} icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}>
              Yeni not
            </Button>
          </>
        }
      />
      {error && (
        <div className="px-5 pb-3 sm:px-6">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="px-5 pb-4 sm:px-6">
        <SelectField
          label="Araç"
          hideLabel
          value={instrumentId}
          onChange={(e) => {
            setInstrumentId(e.target.value);
            setOffset(0);
          }}
          options={options}
          className="w-full sm:w-80"
        />
      </div>
      {notes.isLoading && !notes.data ? (
        <TableSkeleton rows={4} />
      ) : notes.error && !notes.data ? (
        <LoadError error={notes.error} onRetry={() => void notes.mutate()} />
      ) : items.length === 0 ? (
        <EmptyState className="border-t border-line" icon={<DocumentTextIcon />} title="Not yok" />
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <caption className="sr-only">Araştırma notları</caption>
            <thead>
              <tr className={table.headRow}>
                <th scope="col" className={table.th}>
                  Not
                </th>
                <th scope="col" className={cn(table.th, 'hidden md:table-cell')}>
                  Yazar · tarih
                </th>
                <th scope="col" className={cn(table.th, 'text-right')}>
                  <span className="sr-only">Eylemler</span>
                </th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {items.map((n) => (
                <tr key={n.id} className="align-top transition-colors hover:bg-surface-2">
                  <td className={table.td}>
                    <p className="font-medium text-fg">
                      <span className="num mr-2 text-brand">{n.symbol}</span>
                      {n.title}
                    </p>
                    <p className="line-clamp-2 max-w-2xl text-xs text-subtle">{n.body}</p>
                  </td>
                  <td className={cn(table.td, 'hidden whitespace-nowrap md:table-cell')}>
                    <p className="text-fg">{n.author ?? '—'}</p>
                    <p className="text-xs text-subtle">{formatDate(n.created_at)}</p>
                  </td>
                  <td className={cn(table.td, 'whitespace-nowrap text-right')}>
                    <span className="inline-flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(n)} icon={<PencilSquareIcon className="h-4 w-4" aria-hidden="true" />} aria-label="Notu düzenle" />
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(n)} icon={<TrashIcon className="h-4 w-4" aria-hidden="true" />} aria-label="Notu sil" />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination offset={offset} limit={LIMIT} total={notes.data?.total ?? 0} onChange={setOffset} label="Not sayfaları" />

      <NoteForm
        target={editing}
        instruments={options.slice(1)}
        defaultInstrument={instrumentId}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void notes.mutate();
        }}
      />
      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Notu sil"
        description={removing ? `“${removing.title}” silinecek.` : undefined}
        confirmLabel="Sil"
        tone="danger"
        onConfirm={async () => {
          if (!removing) return;
          await labAdminApi.deleteNote(removing.id);
          setRemoving(null);
          void notes.mutate();
        }}
      />
      <CsvImportModal kind="notes" open={importing} onClose={() => setImporting(false)} onDone={() => void notes.mutate()} />
    </Card>
  );
}

function NoteForm({
  target,
  instruments,
  defaultInstrument,
  onClose,
  onSaved,
}: {
  target: Note | 'new' | null;
  instruments: { value: string; label: string }[];
  defaultInstrument: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [instrumentId, setInstrumentId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prev, setPrev] = useState<typeof target>(null);
  if (target !== prev) {
    setPrev(target);
    if (target) {
      setInstrumentId(target === 'new' ? defaultInstrument : target.instrument_id);
      setTitle(target === 'new' ? '' : target.title);
      setBody(target === 'new' ? '' : target.body ?? '');
      setError('');
    }
  }

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (target === 'new') await labAdminApi.createNote({ instrument_id: instrumentId, title: title.trim(), body: body.trim() });
      else if (target) await labAdminApi.updateNote(target.id, { title: title.trim(), body: body.trim() });
      onSaved();
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
      title={target === 'new' ? 'Yeni araştırma notu' : 'Notu düzenle'}
      description="Kısa, olgusal ve kendi cümlelerinizle; al-sat önerisi içermemeli."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!instrumentId || title.trim().length < 3 || !body.trim()}>
            Kaydet
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Araç</span>
          <select value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)} disabled={target !== 'new'} className={cn(control, 'h-11')}>
            <option value="">Seç…</option>
            {instruments.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Başlık (3–140)</span>
          <input value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} className={cn(control, 'h-11')} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Metin (en fazla 4000)</span>
          <textarea rows={6} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} className={cn(control, 'resize-y py-2.5')} />
        </label>
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
