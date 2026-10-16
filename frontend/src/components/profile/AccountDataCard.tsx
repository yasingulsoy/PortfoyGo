'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowDownTrayIcon, TrashIcon } from '@heroicons/react/20/solid';
import { useAuth } from '@/context/AuthContext';
import { accountApi, session, twoFactorApi } from '@/lib/api';
import type { TwoFactorStatus } from '@/types';
import { Card, CardBody, CardHeader } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { Field } from '@portfoygo/shared/ui/Field';
import Modal from '@portfoygo/shared/ui/Modal';
import { useToast } from '@portfoygo/shared/ui/Toast';

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/**
 * Profil → "Hesap ve veriler" (KVKK md. 11): kişisel verilerin JSON kopyasını indirme ve hesabı silme.
 */
export default function AccountDataCard() {
  const { user } = useAuth();
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const blob = await accountApi.exportData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portfoygo-verilerim-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Verilerin indirildi', { description: 'JSON dosyası cihazına kaydedildi.' });
    } catch (err) {
      toast.error(errorText(err, 'Veriler indirilemedi.'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card id="hesap-ve-veriler" className="scroll-mt-24">
      <CardHeader title="Hesap ve veriler" description="Kişisel verilerin üzerindeki hakların (KVKK)" />
      <CardBody className="divide-y divide-line border-t border-line py-0 sm:py-0">
        <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:py-6">
          <div className="min-w-0 text-sm">
            <p className="font-medium text-fg">Verilerimi indir</p>
            <p className="mt-1 text-muted">
              Profilin, ayarların, pozisyonların, işlem ve emir geçmişin, portföy geçmişin, takip listen, lig, Arena, oyun ve Haftalık
              Seçim kayıtların, bildirimlerin ve etkinlik kayıtların tek bir JSON dosyası olarak. Saatte en fazla 3 kez.
            </p>
          </div>
          <Button
            variant="secondary"
            className="shrink-0"
            loading={downloading}
            icon={<ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />}
            onClick={() => void download()}
          >
            Verilerimi indir
          </Button>
        </div>

        <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:py-6">
          <div className="min-w-0 text-sm">
            <p className="font-medium text-fg">Hesabımı sil</p>
            <p className="mt-1 text-muted">
              Hesabın kalıcı olarak silinir ve geri alınamaz. Kişisel verilerin kaldırılır; sıralamaların tutarlı kalması için işlem ve yarışma
              sonuçların kimliksiz (anonim) olarak saklanır.
            </p>
          </div>
          <Button
            variant="down"
            className="shrink-0"
            icon={<TrashIcon className="h-4 w-4" aria-hidden="true" />}
            onClick={() => setDeleteOpen(true)}
          >
            Hesabımı sil
          </Button>
        </div>

        <p className="py-4 text-xs text-muted">
          Ayrıntılar:{' '}
          <Link href="/privacy" className="font-medium text-brand hover:underline">
            Gizlilik politikası
          </Link>{' '}
          ·{' '}
          <Link href="/cerez-politikasi" className="font-medium text-brand hover:underline">
            Çerez politikası
          </Link>
        </p>
      </CardBody>

      {deleteOpen && user && <DeleteAccountModal username={user.username} onClose={() => setDeleteOpen(false)} />}
    </Card>
  );
}

function DeleteAccountModal({ username, onClose }: { username: string; onClose: () => void }) {
  const { afterAccountDeleted } = useAuth();
  const { data: tfa } = useSWR<TwoFactorStatus>(twoFactorApi.statusKey, () => twoFactorApi.status());
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const needsCode = !!tfa?.enabled;
  const ready = confirm === username && password.length > 0 && (!needsCode || totp.trim().length >= 6);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setPending(true);
    setError('');
    // Silme anında arka plandaki istekler (bildirim akışı, portföy yenileme) 401 alır; istemci oturumu önceden
    // pasifleştirilir ki genel "oturum düştü" yönlendirmesi (/login?redirect=…) silme bildirimini ezmesin.
    session.setActive(false);
    try {
      await accountApi.deleteAccount({ password, confirm_username: confirm, ...(needsCode ? { totp: totp.trim() } : {}) });
      afterAccountDeleted();
    } catch (err) {
      session.setActive(true);
      setError(errorText(err, 'Hesap silinemedi.'));
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title="Hesabını kalıcı olarak sil"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={pending} data-autofocus>
            Vazgeç
          </Button>
          <Button variant="danger" type="submit" form="delete-account-form" loading={pending} disabled={!ready}>
            Hesabımı kalıcı olarak sil
          </Button>
        </div>
      }
    >
      <form id="delete-account-form" onSubmit={submit} noValidate className="space-y-4 text-sm">
        <div className="space-y-2 text-muted">
          <p>
            <span className="font-medium text-fg">Silinecekler:</span> kullanıcı adın ve e-posta adresin, bildirimlerin, takip listen, etkinlik
            kayıtların (IP / tarayıcı), Portföy Sihirbazı cevapların, oyun ayarların, Haftalık Seçim notların ve yorumların. Aktif emirlerin iptal
            edilir ve tüm oturumların kapatılır.
          </p>
          <p>
            <span className="font-medium text-fg">Anonim kalacaklar:</span> işlem ve yarışma sonuçların (ligler, sezonlar, Arena) diğer oyuncuların
            sıralamaları bozulmasın diye kimliksiz olarak saklanır; liderlik tablolarında görünmezsin.
          </p>
          <p className="font-medium text-down">Bu işlem geri alınamaz. İstersen önce verilerini indir.</p>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <Field
          label={`Onaylamak için kullanıcı adını yaz: ${username}`}
          name="confirm_username"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={confirm && confirm !== username && confirm.length >= username.length ? 'Kullanıcı adı eşleşmiyor' : undefined}
        />
        <Field label="Şifre" type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {needsCode && (
          <Field
            label="Doğrulama kodu veya kurtarma kodu"
            name="totp"
            autoComplete="one-time-code"
            placeholder="123456 / XXXXX-XXXXX"
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
          />
        )}
      </form>
    </Modal>
  );
}
