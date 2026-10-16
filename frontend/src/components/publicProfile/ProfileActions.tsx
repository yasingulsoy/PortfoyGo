'use client';

import { Cog6ToothIcon, UserPlusIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { LinkButton } from '@portfoygo/shared/ui/Button';
import ShareButton from '@/components/common/ShareButton';
import { useAuth } from '@/context/AuthContext';
import { profileShareText, profileUrl } from '@/lib/publicProfile';
import { SITE_URL } from '@/lib/site';

/** Profil başlığındaki eylemler: paylaş (herkes) + kendi profilinse görünürlük ayarına kısayol. */
export function ProfileActions({ username, returnPct, rank, tierLabel }: { username: string; returnPct: number; rank: number | null; tierLabel: string }) {
  const { user } = useAuth();
  const own = !!user && user.username.toLowerCase() === username.toLowerCase();
  const payload = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : SITE_URL;
    return {
      title: `${username} · PortfoyGo`,
      text: profileShareText({ username, returnPct, rank, tierLabel }, own),
      url: profileUrl(username, origin),
    };
  };
  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto sm:justify-end sm:pb-1">
      <ShareButton payload={payload} label={own ? 'Profilimi paylaş' : 'Paylaş'} variant="primary" />
      {own && (
        <LinkButton href="/profile#profil-gorunurlugu" variant="secondary" icon={<Cog6ToothIcon className="h-4 w-4" aria-hidden="true" />}>
          Görünürlük
        </LinkButton>
      )}
    </div>
  );
}

/** Misafirlere kayıt çağrısı (oturum açıksa gösterilmez). */
export function GuestCta() {
  const { user, loading } = useAuth();
  if (loading || user) return null;
  return (
    <Card className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="min-w-0">
        <p className="text-base font-semibold text-fg">Sen de sanal parayla yarış</p>
        <p className="mt-1 text-sm text-muted">Gerçek piyasa verisiyle risksiz al-sat yap, Arena’da düello at, haftalık seçimlere katıl. Ücretsiz.</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <LinkButton href="/register" icon={<UserPlusIcon className="h-4 w-4" aria-hidden="true" />}>
          Ücretsiz kayıt ol
        </LinkButton>
        <LinkButton href="/login" variant="secondary">
          Giriş yap
        </LinkButton>
      </div>
    </Card>
  );
}
