'use client';

import { useId, useState } from 'react';
import useSWR from 'swr';
import { ArrowTopRightOnSquareIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { LinkButton } from '@portfoygo/shared/ui/Button';
import ShareButton from '@/components/common/ShareButton';
import { Switch } from '@/components/notifications/NotificationPrefsCard';
import { useAuth } from '@/context/AuthContext';
import { profileVisibilityApi, type ProfileVisibility } from '@/lib/api';
import { profileHref, profileUrl } from '@/lib/publicProfile';
import { SITE_URL } from '@/lib/site';

/**
 * Profil sayfasındaki "Profil görünürlüğü" kartı: /u/<kullanıcı-adı> herkese açık mı?
 * Kapalıyken profil adresi "Bu profil gizli" gösterir; sıralamalarda kullanıcı adı yine görünür.
 */
export default function ProfileVisibilityCard() {
  const { user } = useAuth();
  const toast = useToast();
  const id = useId();
  const { data, error, isLoading, mutate } = useSWR(user ? ['me:profile-visibility', user.id] : null, () => profileVisibilityApi.get(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const [saving, setSaving] = useState(false);
  const username = data?.username || user?.username || '';
  const isPublic = data?.profile_public ?? true;

  const toggle = async (value: boolean) => {
    if (!data) return;
    const previous: ProfileVisibility = data;
    setSaving(true);
    void mutate({ ...data, profile_public: value }, { revalidate: false });
    try {
      await profileVisibilityApi.set(value);
      toast.success(value ? 'Profilin herkese açık' : 'Profilin gizlendi', {
        description: value ? 'Profil bağlantını paylaşabilirsin.' : 'Profil adresin artık “Bu profil gizli” gösterir.',
      });
    } catch (err) {
      void mutate(previous, { revalidate: false });
      toast.error('Görünürlük kaydedilemedi', { description: err instanceof Error ? err.message : 'Lütfen tekrar dene.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card id="profil-gorunurlugu" className="scroll-mt-24">
      <CardHeader icon={<GlobeAltIcon />} title="Profil görünürlüğü" description="Herkese açık oyuncu profilin" />
      <div className="border-t border-line">
        {error && !data ? (
          <div className="p-5 sm:p-6">
            <Alert tone="error">Görünürlük ayarı yüklenemedi. {error instanceof Error ? error.message : ''}</Alert>
          </div>
        ) : (
          <div className="flex items-center gap-4 px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1">
              <p id={`${id}-label`} className="text-sm font-medium text-fg">
                Profilim herkese açık
              </p>
              <p id={`${id}-desc`} className="mt-0.5 text-sm text-muted">
                Açıkken herkes (giriş yapmadan da) getirini yüzde olarak, sıralamanı, Arena kademeni, sezon unvanlarını ve rozetlerini
                görebilir. Bakiye ve tutarlar hiçbir zaman gösterilmez.
              </p>
            </div>
            {isLoading && !data ? (
              <Skeleton className="h-6 w-11 rounded-full" />
            ) : (
              <Switch checked={isPublic} disabled={saving || !data} onChange={(v) => void toggle(v)} labelledBy={`${id}-label`} describedBy={`${id}-desc`} />
            )}
          </div>
        )}
        {username && (
          <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="min-w-0 truncate text-sm text-muted">
              <span className="sr-only">Profil adresin: </span>
              <span className="num">{profileUrl(username, SITE_URL).replace(/^https?:\/\//, '')}</span>
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <LinkButton href={profileHref(username)} variant="secondary" size="sm" icon={<ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />}>
                Profilimi gör
              </LinkButton>
              {isPublic && (
                <ShareButton
                  size="sm"
                  label="Bağlantıyı paylaş"
                  payload={() => ({
                    title: `${username} · PortfoyGo`,
                    text: 'PortfoyGo oyuncu profilim (sanal para ile oynanan bir simülasyon).',
                    url: profileUrl(username, typeof window !== 'undefined' ? window.location.origin : SITE_URL),
                  })}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
