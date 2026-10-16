'use client';

import { useEffect, useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { ArrowPathIcon, KeyIcon, LockClosedIcon, LockOpenIcon, ShieldCheckIcon } from '@heroicons/react/20/solid';
import { useAuth } from '@/context/AuthContext';
import { ApiError, twoFactorApi } from '@/lib/api';
import type { TwoFactorSetup, TwoFactorStatus } from '@/types';
import { formatDate } from '@portfoygo/shared/format';
import Button from '@portfoygo/shared/ui/Button';
import { Alert, Badge, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { Field } from '@portfoygo/shared/ui/Field';
import Modal from '@portfoygo/shared/ui/Modal';
import Spinner from '@portfoygo/shared/ui/Spinner';
import { useToast } from '@portfoygo/shared/ui/Toast';
import RecoveryCodes from './RecoveryCodes';

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/**
 * Profil → Güvenlik kartındaki "İki adımlı doğrulama" satırı: durum, etkinleştirme (QR + kod → kurtarma
 * kodları), kapatma (şifre + kod) ve kurtarma kodlarını yenileme.
 */
export default function TwoFactorSection() {
  const { user } = useAuth();
  const { data: status, error, mutate } = useSWR<TwoFactorStatus>(twoFactorApi.statusKey, () => twoFactorApi.status());
  const [modal, setModal] = useState<'enable' | 'disable' | 'regen' | null>(null);
  const close = () => setModal(null);
  const loaded = !!status;

  // /profile#guvenlik (yönetim paneli ve 2FA bildirimlerinin bağlantısı): sayfa istemcide yüklendiği için
  // tarayıcının kendi kaydırması kaçar; durum yüklenince karta kaydır.
  useEffect(() => {
    if (loaded && window.location.hash === '#guvenlik') {
      document.getElementById('guvenlik')?.scrollIntoView({ block: 'start' });
    }
  }, [loaded]);

  if (error) {
    return <Alert tone="error">İki adımlı doğrulama durumu alınamadı. Sayfayı yenileyip tekrar dene.</Alert>;
  }
  if (!status) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
            İki adımlı doğrulama
            {status.enabled ? (
              <Badge tone="up">
                <ShieldCheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> Açık
              </Badge>
            ) : (
              <Badge>Kapalı</Badge>
            )}
          </p>
          <p className="mt-1 text-muted">
            {status.enabled ? (
              <>
                {status.enabled_at ? `${formatDate(status.enabled_at)} tarihinden beri açık. ` : ''}
                Girişte şifrene ek olarak doğrulama uygulamandaki 6 haneli kod istenir.{' '}
                <span className={status.recovery_codes_remaining <= 3 ? 'font-medium text-gold' : undefined}>
                  {status.recovery_codes_remaining} kurtarma kodu kaldı.
                </span>
              </>
            ) : (
              'Şifren ele geçse bile hesabını korur: girişte telefonundaki doğrulama uygulamasının ürettiği 6 haneli kod da istenir.'
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {status.enabled ? (
            <>
              <Button variant="secondary" icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => setModal('regen')}>
                Kurtarma kodlarını yenile
              </Button>
              <Button variant="down" icon={<LockOpenIcon className="h-4 w-4" aria-hidden="true" />} onClick={() => setModal('disable')}>
                Kapat
              </Button>
            </>
          ) : (
            <Button
              icon={<LockClosedIcon className="h-4 w-4" aria-hidden="true" />}
              onClick={() => setModal('enable')}
              disabled={!status.available}
            >
              Etkinleştir
            </Button>
          )}
        </div>
      </div>

      {!status.enabled && status.admin_required && (
        <Alert tone="info">Yönetim paneline erişmek için yönetici hesaplarında iki adımlı doğrulama zorunludur.</Alert>
      )}
      {!status.enabled && !status.available && (
        <Alert tone="error">İki adımlı doğrulama şu anda kullanılamıyor (sunucu yapılandırması eksik). Lütfen daha sonra tekrar dene.</Alert>
      )}
      {status.enabled && status.recovery_codes_remaining === 0 && (
        <Alert tone="error">Hiç kurtarma kodun kalmadı. Telefonunu kaybedersen hesabına giremeyebilirsin; kodlarını yenile.</Alert>
      )}

      {modal === 'enable' && (
        <EnableModal username={user?.username ?? ''} onClose={close} onDone={() => void mutate()} />
      )}
      {modal === 'disable' && <DisableModal onClose={close} onDone={() => void mutate()} />}
      {modal === 'regen' && <RegenerateModal username={user?.username ?? ''} onClose={close} onDone={() => void mutate()} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EnableModal({ username, onClose, onDone }: { username: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [loadError, setLoadError] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    let cancelled = false;
    twoFactorApi
      .setup()
      .then((s) => !cancelled && setSetup(s))
      .catch((err) => !cancelled && setLoadError(errorText(err, 'Kurulum başlatılamadı.')));
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const compact = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(compact)) {
      setError('Uygulamadaki 6 haneli kodu gir.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const list = await twoFactorApi.enable(compact);
      setCodes(list);
      onDone();
      toast.success('İki adımlı doğrulama açıldı', { description: 'Diğer cihazlardaki oturumların kapatıldı.' });
    } catch (err) {
      setError(errorText(err, 'Doğrulama başarısız.'));
      setCode('');
    } finally {
      setPending(false);
    }
  };

  // Adım 2: kurtarma kodları (yalnızca bir kez gösterilir)
  if (codes) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Kurtarma kodlarını kaydet"
        description="Telefonuna erişemezsen girişte bu kodlardan birini kullanabilirsin. Kodlar bir daha gösterilmeyecek."
        footer={
          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-2.5 text-sm text-muted">
              <input
                type="checkbox"
                checked={saved}
                onChange={(e) => setSaved(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-brand"
              />
              Kodları güvenli bir yere (ör. parola yöneticisi) kaydettim.
            </label>
            <Button onClick={onClose} disabled={!saved} className="w-full">
              Tamam
            </Button>
          </div>
        }
      >
        <RecoveryCodes codes={codes} username={username} />
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="İki adımlı doğrulamayı aç"
      description="Doğrulama uygulamasıyla (Google Authenticator, Microsoft Authenticator, 1Password …) QR kodunu tara, ardından uygulamanın gösterdiği 6 haneli kodu gir."
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Vazgeç
          </Button>
          <Button type="submit" form="totp-enable-form" loading={pending} disabled={!setup || (!!username && setup.account !== username)}>
            Doğrula ve etkinleştir
          </Button>
        </div>
      }
    >
      {loadError ? (
        <Alert tone="error">{loadError}</Alert>
      ) : !setup ? (
        <div className="flex h-56 items-center justify-center">
          <Spinner className="h-6 w-6 text-brand" />
        </div>
      ) : (
        <form id="totp-enable-form" onSubmit={submit} noValidate className="space-y-4">
          {/* Hesap adı sunucudan gelir: aynı tarayıcıda başka sekmede farklı hesaba geçildiyse burada görünür */}
          {setup.account && username && setup.account !== username ? (
            <Alert tone="error">
              Bu tarayıcıdaki oturum artık <strong>{setup.account}</strong> hesabına ait. Yanlış hesapta işlem yapmamak için sayfayı yenile.
            </Alert>
          ) : (
            <p className="text-center text-xs text-muted">
              Hesap: <span className="font-medium text-fg">{setup.account}</span>
            </p>
          )}
          <div className="flex flex-col items-center gap-3">
            {/* QR her temada okunabilsin diye beyaz zemin (tarayıcılar koyu zeminde açık QR'ı okuyamayabilir) */}
            <div className="rounded-2xl border border-line bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, optimizasyon gerekmez */}
              <img src={setup.qr_svg} alt="İki adımlı doğrulama QR kodu" width={184} height={184} className="h-46 w-46" />
            </div>
            <button type="button" onClick={() => setShowKey((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-hover">
              <KeyIcon className="h-4 w-4" aria-hidden="true" />
              {showKey ? 'Anahtarı gizle' : 'QR kodu tarayamıyor musun? Anahtarı göster'}
            </button>
            {showKey && (
              <div className="w-full rounded-xl border border-line bg-surface-2 p-3 text-center">
                <p className="text-xs text-muted">Uygulamaya elle gir (zamana dayalı, 6 hane, 30 sn):</p>
                <p className="num mt-1 select-all break-all text-sm font-semibold tracking-wider text-fg">{setup.manual_key}</p>
              </div>
            )}
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <Field
            label="Doğrulama kodu"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={7}
            placeholder="123456"
            className="[&_input]:text-center [&_input]:text-lg [&_input]:tabular-nums [&_input]:tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
            hint="Etkinleştirince diğer cihazlardaki oturumların kapatılır; bu cihazda oturumun açık kalır."
            data-autofocus
          />
        </form>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function DisableModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || code.trim().length < 6) {
      setError('Şifreni ve doğrulama kodunu (ya da bir kurtarma kodunu) gir.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await twoFactorApi.disable(password, code.trim());
      onDone();
      toast.success('İki adımlı doğrulama kapatıldı');
      onClose();
    } catch (err) {
      setError(errorText(err, 'İşlem başarısız.'));
      if (err instanceof ApiError && err.code === 'INVALID_2FA_CODE') setCode('');
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      size="sm"
      title="İki adımlı doğrulama kapatılsın mı?"
      description="Kapatırsan girişte yalnızca şifren istenir ve kurtarma kodların geçersiz olur."
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Vazgeç
          </Button>
          <Button variant="danger" type="submit" form="totp-disable-form" loading={pending}>
            Kapat
          </Button>
        </div>
      }
    >
      <form id="totp-disable-form" onSubmit={submit} noValidate className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Şifre" type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />
        <Field
          label="Doğrulama kodu veya kurtarma kodu"
          name="code"
          autoComplete="one-time-code"
          placeholder="123456 / XXXXX-XXXXX"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function RegenerateModal({ username, onClose, onDone }: { username: string; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 6) {
      setError('Doğrulama kodunu gir.');
      return;
    }
    setPending(true);
    setError('');
    try {
      setCodes(await twoFactorApi.regenerateRecoveryCodes(code.trim()));
      onDone();
    } catch (err) {
      setError(errorText(err, 'İşlem başarısız.'));
      setCode('');
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title={codes ? 'Yeni kurtarma kodların' : 'Kurtarma kodlarını yenile'}
      description={
        codes
          ? 'Eski kodların artık geçersiz. Yeni kodları güvenli bir yere kaydet; bir daha gösterilmeyecek.'
          : 'Yeni 10 kod oluşturulur ve eskilerin tamamı geçersiz olur.'
      }
      footer={
        codes ? (
          <Button onClick={onClose} className="w-full">
            Tamam
          </Button>
        ) : (
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Vazgeç
            </Button>
            <Button type="submit" form="totp-regen-form" loading={pending}>
              Yeni kodlar oluştur
            </Button>
          </div>
        )
      }
    >
      {codes ? (
        <RecoveryCodes codes={codes} username={username} />
      ) : (
        <form id="totp-regen-form" onSubmit={submit} noValidate className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field
            label="Doğrulama kodu veya kurtarma kodu"
            name="code"
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            data-autofocus
          />
        </form>
      )}
    </Modal>
  );
}
