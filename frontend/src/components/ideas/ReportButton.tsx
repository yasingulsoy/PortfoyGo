'use client';

import { useState } from 'react';
import { FlagIcon } from '@heroicons/react/20/solid';
import Button from '@portfoygo/shared/ui/Button';
import Modal from '@portfoygo/shared/ui/Modal';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn } from '@portfoygo/shared/format';
import { IDEA_TEXT, REPORT_REASONS, ideasApi } from '@/lib/ideas';
import type { IdeaReportReason, IdeaReportTarget } from '@/types/ideas';
import { TextAreaField } from './fields';

/** "Şikâyet et": neden + isteğe bağlı açıklama → yönetici kuyruğu */
export default function ReportButton({
  target,
  targetId,
  label = 'Şikâyet et',
  compact = false,
  className,
}: {
  target: IdeaReportTarget;
  targetId: string;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<IdeaReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setError(null);
  };

  const submit = async () => {
    if (!reason) {
      setError('Bir neden seç');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await ideasApi.report({ target_type: target, target_id: targetId, reason, note: note.trim() || null });
      toast.success(r.already_reported ? 'Bu içeriği daha önce bildirmiştin' : 'Şikâyetin iletildi', { description: 'Yönetici ekibi inceleyecek.' });
      setReason(null);
      setNote('');
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Şikâyet gönderilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {compact ? (
        <button type="button" onClick={() => setOpen(true)} className={cn('inline-flex items-center gap-1 text-xs text-subtle hover:text-down', className)}>
          <FlagIcon className="h-3 w-3" aria-hidden="true" />
          {label}
        </button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} icon={<FlagIcon className="h-4 w-4" aria-hidden="true" />} className={className}>
          {label}
        </Button>
      )}
      <Modal
        open={open}
        onClose={close}
        title="Şikâyet et"
        description="Topluluk kurallarına aykırı içerikleri yönetici ekibine bildir. Şikâyetin kimseyle paylaşılmaz."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Vazgeç
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void submit()}>
              Gönder
            </Button>
          </div>
        }
      >
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-sm font-medium text-fg/80">Neden</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="radio" name={`report-${targetId}`} checked={reason === r.value} onChange={() => setReason(r.value)} className="accent-brand" />
              {r.label}
            </label>
          ))}
        </fieldset>
        <TextAreaField label="Açıklama" optional value={note} onChange={setNote} max={IDEA_TEXT.reportNote.max} rows={3} className="mt-4" />
        {error && (
          <Alert tone="error" className="mt-3">
            {error}
          </Alert>
        )}
      </Modal>
    </>
  );
}
