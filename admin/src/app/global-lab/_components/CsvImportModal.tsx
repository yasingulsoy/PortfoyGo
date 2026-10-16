'use client';

import { useId, useState } from 'react';
import Modal from '@portfoygo/shared/ui/Modal';
import Button from '@portfoygo/shared/ui/Button';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { labAdminApi, type ImportResult } from './data';

const count = (v: string[] | number | undefined) => (Array.isArray(v) ? v.length : Number(v ?? 0));

/**
 * CSV içe aktarma: dosya seç ya da yapıştır → Önizle (dry run; hiçbir şey yazılmaz) → İçe aktar.
 * Katalogda sembole göre ekleme / güncelleme yapılır; dosyada olmayan sütunlar mevcut araçlarda korunur.
 */
export default function CsvImportModal({
  kind,
  open,
  onClose,
  onDone,
}: {
  kind: 'instruments' | 'notes';
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileId = useId();
  const textId = useId();

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setText('');
      setPreview(null);
      setResult(null);
      setError('');
    }
  }

  const run = async (dry: boolean) => {
    setBusy(true);
    setError('');
    try {
      const r = await labAdminApi.importCsv(kind, text, dry);
      if (dry) setPreview(r);
      else {
        setResult(r);
        onDone();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İçe aktarma başarısız.');
    } finally {
      setBusy(false);
    }
  };

  const columns =
    kind === 'instruments'
      ? 'symbol, name, vehicle, asset_class, region, currency, risk_level, data_source, license_note (zorunlu) · sub_class, country, expense_ratio_pct, description_tr, provider_symbol, active (isteğe bağlı)'
      : 'symbol, title, body';
  const shown = result ?? preview;

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={kind === 'instruments' ? 'Katalog CSV içe aktar' : 'Araştırma notları CSV içe aktar'}
      description={`Başlık satırı zorunlu; ayırıcı , veya ; olabilir. Sütunlar: ${columns}.`}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {result ? 'Kapat' : 'Vazgeç'}
          </Button>
          {!result && (
            <>
              <Button variant="secondary" onClick={() => void run(true)} loading={busy && !preview} disabled={!text.trim() || busy}>
                Önizle
              </Button>
              <Button onClick={() => void run(false)} loading={busy && !!preview} disabled={!preview || busy || preview.valid === 0}>
                İçe aktar
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <label htmlFor={fileId} className="mb-1.5 block text-sm font-medium text-fg/80">
            CSV dosyası
          </label>
          <input
            id={fileId}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 1_000_000) return setError('Dosya 1 MB sınırını aşıyor');
              setText(await f.text());
              setPreview(null);
              setResult(null);
            }}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-sm file:font-medium file:text-fg"
          />
        </div>
        <div>
          <label htmlFor={textId} className="mb-1.5 block text-sm font-medium text-fg/80">
            veya yapıştır
          </label>
          <textarea
            id={textId}
            rows={6}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
              setResult(null);
            }}
            spellCheck={false}
            className="num w-full resize-y rounded-lg border border-line bg-transparent px-3 py-2 font-mono text-xs text-fg shadow-card focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10"
          />
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {shown && (
          <div className="space-y-2 rounded-xl border border-line bg-surface-2 p-3">
            <p className="font-medium text-fg">{result ? 'İçe aktarıldı' : 'Önizleme (henüz yazılmadı)'}</p>
            <p className="num text-muted">
              {shown.total} satır · {shown.valid} geçerli · {count(shown.created)} yeni · {count(shown.updated)} güncellenecek
              {Array.isArray(shown.unchanged) ? ` · ${shown.unchanged.length} değişmeyen` : ''}
              {shown.duplicates ? ` · ${shown.duplicates} tekrar (son satır geçerli)` : ''}
            </p>
            {shown.unknown_symbols && shown.unknown_symbols.length > 0 && (
              <p className="text-gold">Katalogda olmayan semboller: {shown.unknown_symbols.join(', ')}</p>
            )}
            {shown.error_count > 0 && (
              <div>
                <p className="text-down">{shown.error_count} hatalı satır (atlanır):</p>
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted">
                  {shown.errors.map((e) => (
                    <li key={`${e.line}-${e.symbol}`}>
                      <span className="num font-medium text-fg">{e.line}. satır</span>
                      {e.symbol ? ` (${e.symbol})` : ''}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
