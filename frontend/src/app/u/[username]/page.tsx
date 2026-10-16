import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicProfileView from '@/components/publicProfile/PublicProfileView';
import ProfileUnavailable from '@/components/publicProfile/ProfileUnavailable';
import { decodeUsernameParam, profileDescription, profileHref } from '@/lib/publicProfile';
import { getPublicProfile } from '@/lib/publicProfileServer';

type Props = { params: Promise<{ username: string }> };

/**
 * Herkese açık oyuncu profili: /u/<kullanıcı-adı>. Oturum gerekmez (proxy.ts korumalı rotalar listesinde değil),
 * sunucuda render edilir. Paylaşım önizlemesi: ./opengraph-image.tsx.
 * Gizli profil → "Bu profil gizli"; olmayan oyuncu → 404 (./not-found.tsx).
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const result = await getPublicProfile(decodeUsernameParam(username));
  if (result.status !== 'ok') {
    return {
      title: result.status === 'private' ? 'Gizli profil' : result.status === 'not_found' ? 'Oyuncu bulunamadı' : 'Oyuncu profili',
      robots: { index: false, follow: false },
    };
  }
  const p = result.profile;
  const title = `${p.username} · Oyuncu profili`;
  const description = profileDescription(p);
  return {
    title,
    description,
    alternates: { canonical: profileHref(p.username) },
    openGraph: {
      title: `${p.username} · PortfoyGo`,
      description,
      type: 'profile',
      url: profileHref(p.username),
      locale: 'tr_TR',
      siteName: 'PortfoyGo',
    },
    twitter: { card: 'summary_large_image', title: `${p.username} · PortfoyGo`, description },
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  const result = await getPublicProfile(decodeUsernameParam(username));
  if (result.status === 'not_found') notFound();
  if (result.status === 'private') return <ProfileUnavailable kind="private" />;
  if (result.status === 'error') return <ProfileUnavailable kind="error" />;
  return <PublicProfileView profile={result.profile} />;
}
