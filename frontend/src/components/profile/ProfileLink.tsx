import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@portfoygo/shared/format';
import { profileHref } from '@/lib/publicProfile';

/**
 * Kullanıcı adını herkese açık profiline (/u/<kullanıcı-adı>) bağlar. Görünümü çevreleyen metinle aynı kalır;
 * fareyle üzerine gelince / klavye odağında altı çizilir. Sıralama listeleri uzun olabileceğinden ön yükleme kapalı.
 * Bot / sistem hesapları için kullanmayın (profilleri yoktur).
 */
export default function ProfileLink({
  username,
  className,
  children,
  label,
}: {
  username: string;
  className?: string;
  children?: ReactNode;
  /** Erişilebilir ad (görünen metin yeterli değilse, ör. "(sen)" eki) */
  label?: string;
}) {
  return (
    <Link
      href={profileHref(username)}
      prefetch={false}
      aria-label={label}
      className={cn(
        'rounded-sm underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current',
        className,
      )}
    >
      {children ?? username}
    </Link>
  );
}
