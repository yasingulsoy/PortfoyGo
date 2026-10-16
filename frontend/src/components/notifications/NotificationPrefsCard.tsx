'use client';

import { useId, useState } from 'react';
import useSWR from 'swr';
import { BellAlertIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { cn } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { notificationsApi, type NotificationCategory, type NotificationPrefs } from '@/lib/api';
import { CATEGORY_META } from './model';

const ROWS: { key: NotificationCategory; description: string; locked?: boolean }[] = [
  { key: 'orders', description: 'Bekleyen emirlerin gerçekleştiğinde, süresi dolduğunda veya başarısız olduğunda.' },
  { key: 'competition', description: 'Kazandığın rozetler, sezon ödülleri ve liglerindeki gelişmeler.' },
  { key: 'account', description: 'Hesap güvenliği ve doğrulama gibi önemli bildirimler.', locked: true },
  { key: 'system', description: 'PortfoyGo ekibinin duyuruları.', locked: true },
];

/** Profil sayfasındaki "Bildirim tercihleri" kartı: Emirler ve Rekabet kapatılabilir; Hesap ve Sistem her zaman açıktır. */
export default function NotificationPrefsCard() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, isLoading, mutate } = useSWR(user ? ['notifications:prefs', user.id] : null, () => notificationsApi.prefs(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const [saving, setSaving] = useState<NotificationCategory | 'email_digest' | null>(null);

  const update = async (key: 'orders' | 'competition' | 'email_digest', value: boolean) => {
    if (!data) return;
    const previous = data;
    setSaving(key);
    // İyimser güncelleme; hata olursa geri al
    void mutate({ ...data, [key]: value }, { revalidate: false });
    try {
      await notificationsApi.updatePrefs({ [key]: value });
      toast.success('Bildirim tercihlerin kaydedildi', {
        description:
          key === 'email_digest'
            ? `Haftalık e-posta özeti ${value ? 'açıldı' : 'kapatıldı'}.`
            : `${CATEGORY_META[key].label} bildirimleri ${value ? 'açıldı' : 'kapatıldı'}.`,
      });
    } catch (err) {
      void mutate(previous, { revalidate: false });
      toast.error('Tercih kaydedilemedi', { description: err instanceof Error ? err.message : 'Lütfen tekrar dene.' });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <CardHeader icon={<BellAlertIcon />} title="Bildirim tercihleri" description="Hangi gelişmelerden haberdar olmak istediğini seç" />
      <div className="border-t border-line">
        {error && !data ? (
          <div className="p-5 sm:p-6">
            <Alert tone="error">Tercihler yüklenemedi. {error instanceof Error ? error.message : ''}</Alert>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {ROWS.map((row) => (
              <PrefRow
                key={row.key}
                category={row.key}
                description={row.description}
                locked={row.locked}
                loading={isLoading && !data}
                checked={row.locked ? true : (data?.[row.key as keyof NotificationPrefs] ?? true)}
                busy={saving === row.key}
                onChange={(v) => void update(row.key as 'orders' | 'competition', v)}
              />
            ))}
          </ul>
        )}
        {!(error && !data) && (
          <EmailDigestRow
            loading={isLoading && !data}
            checked={data?.email_digest ?? true}
            busy={saving === 'email_digest'}
            verified={!!user?.email_verified}
            onChange={(v) => void update('email_digest', v)}
          />
        )}
        <p className="border-t border-line px-5 py-4 text-xs text-subtle sm:px-6">
          Kapattığın kategorilerde yeni bildirim oluşturulmaz. Hesap ve sistem bildirimleri güvenliğin için her zaman açıktır.
        </p>
      </div>
    </Card>
  );
}

function PrefRow({
  category,
  description,
  locked,
  loading,
  checked,
  busy,
  onChange,
}: {
  category: NotificationCategory;
  description: string;
  locked?: boolean;
  loading: boolean;
  checked: boolean;
  busy: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <li className="flex items-center gap-4 px-5 py-4 sm:px-6">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', meta.tone)} aria-hidden="true">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p id={`${id}-label`} className="text-sm font-medium text-fg">
          {meta.label}
          {locked && <span className="ml-2 text-xs font-normal text-subtle">Her zaman açık</span>}
        </p>
        <p id={`${id}-desc`} className="mt-0.5 text-sm text-muted">
          {description}
        </p>
      </div>
      {loading && !locked ? (
        <Skeleton className="h-6 w-11 rounded-full" />
      ) : (
        <Switch
          checked={checked}
          disabled={locked || busy}
          onChange={onChange}
          labelledBy={`${id}-label`}
          describedBy={`${id}-desc`}
        />
      )}
    </li>
  );
}

/** Erişilebilir anahtar (role="switch"). */
export function Switch({
  checked,
  disabled,
  onChange,
  labelledBy,
  describedBy,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  labelledBy: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'bg-brand' : 'bg-line-strong',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('inline-block h-5 w-5 rounded-full bg-brand-fg shadow-card transition-transform duration-200', checked ? 'translate-x-[22px]' : 'translate-x-0.5')}
      />
    </button>
  );
}

/** Haftalık e-posta özeti (bildirim kategorisi değil; users.notification_prefs.email_digest). */
function EmailDigestRow({
  loading,
  checked,
  busy,
  verified,
  onChange,
}: {
  loading: boolean;
  checked: boolean;
  busy: boolean;
  verified: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="border-t border-line">
      <p className="px-5 pt-4 text-xs font-medium uppercase tracking-wide text-subtle sm:px-6">E-posta</p>
      <div className="flex items-center gap-4 px-5 py-4 sm:px-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand" aria-hidden="true">
          <EnvelopeIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p id={`${id}-label`} className="text-sm font-medium text-fg">
            Haftalık e-posta özeti
          </p>
          <p id={`${id}-desc`} className="mt-0.5 text-sm text-muted">
            Her Pazartesi sabahı geçen haftanın kısa özeti: portföy değişimi, sıralaman, en iyi ve en zorlu işlemin.
            E-postadaki bağlantıyla da tek tıkla kapatabilirsin.
            {!verified && ' E-posta adresini doğrulayana kadar özet gönderilmez.'}
          </p>
        </div>
        {loading ? (
          <Skeleton className="h-6 w-11 rounded-full" />
        ) : (
          <Switch checked={checked} disabled={busy} onChange={onChange} labelledBy={`${id}-label`} describedBy={`${id}-desc`} />
        )}
      </div>
    </div>
  );
}
