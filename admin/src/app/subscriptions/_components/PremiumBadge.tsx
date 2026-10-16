'use client';

import Link from 'next/link';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import { useUserSubscription } from './data';

/** Kullanıcı detayındaki Premium rozeti (yalnızca geçerli deneme / Premium varsa görünür; abonelikler sayfasına bağlanır). */
export default function PremiumBadge({ userId, username }: { userId: string; username?: string }) {
  const { data } = useUserSubscription(userId);
  const cur = data?.state.current;
  if (!data || !cur) return null;
  const left = cur.days_left === null ? 'süresiz' : `${cur.days_left} gün`;
  const label = cur.status === 'trial' ? `Premium deneme · ${left}` : `Premium · ${left}`;
  return (
    <Link href={`/subscriptions?search=${encodeURIComponent(username ?? data.user.username)}`} className="rounded-full hover:opacity-80" title="Aboneliği yönet">
      <Badge tone="brand">{label}</Badge>
    </Link>
  );
}
