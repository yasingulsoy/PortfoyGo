import { ExclamationTriangleIcon, HomeIcon, LockClosedIcon, TrophyIcon, UserIcon } from '@heroicons/react/20/solid';
import { LinkButton } from '@portfoygo/shared/ui/Button';

type Kind = 'private' | 'not_found' | 'error';

const COPY: Record<Kind, { eyebrow: string; title: string; body: string }> = {
  private: {
    eyebrow: 'Gizli profil',
    title: 'Bu profil gizli',
    body: 'Bu oyuncu profilini herkese açık paylaşmamayı seçti. Sıralamalarda yine kullanıcı adıyla görünebilir.',
  },
  not_found: {
    eyebrow: 'Hata 404',
    title: 'Oyuncu bulunamadı',
    body: 'Bu kullanıcı adına sahip bir oyuncu yok ya da hesap artık kullanılmıyor. Adresi kontrol et.',
  },
  error: {
    eyebrow: 'Geçici sorun',
    title: 'Profil şu an yüklenemedi',
    body: 'Sunucuya ulaşılamadı. Birkaç saniye sonra sayfayı yenilemeyi dene.',
  },
};

/** Gizli / bulunamayan / yüklenemeyen profil: 404 sayfasıyla aynı görsel dil. */
export default function ProfileUnavailable({ kind }: { kind: Kind }) {
  const c = COPY[kind];
  const Icon = kind === 'private' ? LockClosedIcon : kind === 'error' ? ExclamationTriangleIcon : UserIcon;
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center py-12 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-surface-3 text-muted ring-1 ring-line" aria-hidden="true">
        <Icon className="h-10 w-10" />
      </span>
      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-brand">{c.eyebrow}</p>
      <h1 className="mt-3 text-xl font-semibold text-fg sm:text-2xl">{c.title}</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{c.body}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <LinkButton href="/" icon={<HomeIcon className="h-4 w-4" aria-hidden="true" />}>
          Ana sayfaya dön
        </LinkButton>
        <LinkButton href="/leaderboard" variant="secondary" icon={<TrophyIcon className="h-4 w-4" aria-hidden="true" />}>
          Liderlik tablosu
        </LinkButton>
      </div>
    </div>
  );
}
