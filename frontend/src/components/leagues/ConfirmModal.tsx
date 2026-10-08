'use client';

import { useState, type ReactNode } from 'react';
import Button from '@portfoygo/shared/ui/Button';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import Modal from '@portfoygo/shared/ui/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  /** Hata fırlatırsa mesajı modalda gösterilir ve modal açık kalır. */
  onConfirm: () => Promise<void>;
}

/** Geri alınamaz işlemler için onay penceresi. İlk odak "Vazgeç" düğmesindedir. */
export default function ConfirmModal({ open, onClose, title, children, confirmLabel, tone = 'danger', onConfirm }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    if (pending) return;
    setError('');
    onClose();
  };

  const confirm = async () => {
    setPending(true);
    setError('');
    try {
      await onConfirm();
      setPending(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem başarısız. Lütfen tekrar dene.');
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      title={title}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={pending} data-autofocus>
            Vazgeç
          </Button>
          <Button variant={tone} loading={pending} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-muted">
        {children}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
