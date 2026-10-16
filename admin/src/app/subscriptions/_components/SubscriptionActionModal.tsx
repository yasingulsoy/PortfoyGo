'use client';

import { useId, useState } from 'react';
import Modal from '@portfoygo/shared/ui/Modal';
import Button from '@portfoygo/shared/ui/Button';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { cn } from '@portfoygo/shared/format';
import { subscriptionAdminApi } from './data';

export type SubAction = { kind: 'grant' | 'extend' | 'revoke'; userId: string; username: string };

const DURATIONS = [
  { value: '7', label: '7 gün' },
  { value: '30', label: '30 gün' },
  { value: '90', label: '90 gün' },
  { value: '365', label: '1 yıl' },
  { value: 'custom', label: 'Özel' },
  { value: 'unlimited', label: 'Süresiz' },
];

const control =
  'h-11 w-full rounded-lg border border-line bg-surface px-4 text-sm text-fg shadow-card focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10';

/** Premium tanımla / uzat / iptal penceresi: not zorunlu (denetim kaydına yazılır). */
export default function SubscriptionActionModal({ action, onClose, onDone }: { action: SubAction | null; onClose: () => void; onDone: () => void }) {
  const [duration, setDuration] = useState('30');
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const noteId = useId();
  const durId = useId();
  const customId = useId();

  // Pencere her açıldığında alanları sıfırla (render sırasında)
  const [prev, setPrev] = useState<SubAction | null>(null);
  if (action !== prev) {
    setPrev(action);
    if (action) {
      setDuration('30');
      setCustom('');
      setNote('');
      setError('');
    }
  }

  const kind = action?.kind ?? 'grant';
  const days = duration === 'unlimited' ? null : duration === 'custom' ? parseInt(custom, 10) : parseInt(duration, 10);
  const noteOk = note.trim().length >= 3;
  const daysOk = kind === 'revoke' ? true : days === null ? kind === 'grant' : Number.isInteger(days) && days >= 1 && days <= 3650;

  const submit = async () => {
    if (!action) return;
    setBusy(true);
    setError('');
    try {
      if (kind === 'revoke') await subscriptionAdminApi.revoke(action.userId, note.trim());
      else await subscriptionAdminApi.grant(action.userId, { days, note: note.trim(), mode: kind });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };

  const title = kind === 'grant' ? 'Premium tanımla' : kind === 'extend' ? 'Premium süresini uzat' : 'Premium erişimi sonlandır';
  const description =
    kind === 'grant'
      ? `${action?.username ?? ''} için Premium açılır. Süren bir deneme / Premium varsa iptal edilip yerine bu tanım geçer.`
      : kind === 'extend'
        ? `${action?.username ?? ''} kullanıcısının geçerli aboneliğine gün eklenir (bitiş tarihinden ya da bugünden itibaren).`
        : `${action?.username ?? ''} kullanıcısının geçerli aboneliği (deneme dahil) hemen sona erer. Kayıtlı senaryoları silinmez.`;

  return (
    <Modal
      open={!!action}
      onClose={() => !busy && onClose()}
      size="sm"
      title={title}
      description={description}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </Button>
          <Button variant={kind === 'revoke' ? 'danger' : 'primary'} loading={busy} disabled={!noteOk || !daysOk} onClick={() => void submit()}>
            {kind === 'grant' ? 'Tanımla' : kind === 'extend' ? 'Uzat' : 'Sonlandır'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        {kind !== 'revoke' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={durId} className="mb-1.5 block text-sm font-medium text-fg/80">
                {kind === 'extend' ? 'Eklenecek süre' : 'Süre'}
              </label>
              <select id={durId} value={duration} onChange={(e) => setDuration(e.target.value)} className={control}>
                {DURATIONS.filter((d) => kind === 'grant' || d.value !== 'unlimited').map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            {duration === 'custom' && (
              <div>
                <label htmlFor={customId} className="mb-1.5 block text-sm font-medium text-fg/80">
                  Gün (1–3650)
                </label>
                <input id={customId} inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} className={cn(control, 'num')} />
              </div>
            )}
          </div>
        )}
        <div>
          <label htmlFor={noteId} className="mb-1.5 block text-sm font-medium text-fg/80">
            Not <span className="font-normal text-subtle">(zorunlu; denetim kaydına yazılır)</span>
          </label>
          <textarea
            id={noteId}
            data-autofocus
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={kind === 'revoke' ? 'Ör. Pilot programı bitti' : 'Ör. Okul pilotu, yarışma ödülü, ekip üyesi'}
            className="w-full resize-y rounded-lg border border-line bg-transparent px-4 py-2.5 text-sm text-fg shadow-card placeholder:text-subtle focus:border-brand/50 focus:outline-none focus:ring-[3px] focus:ring-brand/10"
          />
        </div>
        <p className="text-xs text-subtle">Kullanıcıya uygulama içi bildirim gönderilir. Ödeme alınmaz (ödeme altyapısı yok).</p>
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
