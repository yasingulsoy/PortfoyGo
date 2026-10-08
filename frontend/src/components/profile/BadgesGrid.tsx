'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { LockClosedIcon, SparklesIcon } from '@heroicons/react/20/solid';
import { Card, CardHeader } from '@/components/ui/Card';
import { Alert, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { badgesApi } from '@/lib/api';
import { cn, formatDate } from '@/lib/format';
import type { Badge } from '@/types';

const CATEGORY_LABELS: Record<string, string> = {
  transaction: 'İşlem',
  profit: 'Kâr',
  portfolio: 'Portföy',
  daily: 'Günlük',
  risk: 'Risk',
  patience: 'Sabır',
  diversity: 'Çeşitlilik',
};

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

function toBadge(raw: any): Badge | null {
  if (!raw) return null;
  const id = str(raw.id ?? raw.badge_id);
  if (!id) return null;
  return {
    id,
    name: str(raw.name) || 'Rozet',
    description: str(raw.description),
    icon: str(raw.icon),
    category: str(raw.category),
  };
}

/** Tüm rozetleri kazanılanlarla birleştirir; yalnızca biri gelirse onu kullanır. */
function mergeBadges(allRes: any, mineRes: any): Badge[] {
  const allRaw: any[] = Array.isArray(allRes?.badges) ? allRes.badges : Array.isArray(allRes?.data) ? allRes.data : [];
  const mineRaw: any[] = Array.isArray(mineRes?.badges) ? mineRes.badges : Array.isArray(mineRes?.data) ? mineRes.data : [];

  const earned = new Map<string, { earned_at?: string; badge: Badge | null }>();
  for (const ub of mineRaw) {
    const badge = toBadge(ub?.badge ?? ub);
    const id = str(ub?.badge_id ?? ub?.badge?.id ?? ub?.id);
    if (id) earned.set(id, { earned_at: ub?.earned_at ? str(ub.earned_at) : undefined, badge });
  }

  const list: Badge[] = [];
  const seen = new Set<string>();
  for (const raw of allRaw) {
    const b = toBadge(raw);
    if (!b || seen.has(b.id)) continue;
    seen.add(b.id);
    const e = earned.get(b.id);
    list.push({ ...b, earned: !!e, earned_at: e?.earned_at });
  }
  // Katalogda olmayan (ya da katalog alınamadığında) kazanılmış rozetler
  for (const [id, e] of earned) {
    if (seen.has(id) || !e.badge) continue;
    list.push({ ...e.badge, id, earned: true, earned_at: e.earned_at });
  }
  return list;
}

export default function BadgesGrid() {
  const all = useSWR('badges:all', () => badgesApi.all(), { revalidateOnFocus: false });
  const mine = useSWR('badges:mine', () => badgesApi.mine());

  const badges = useMemo(() => mergeBadges(all.data, mine.data), [all.data, mine.data]);
  const earnedCount = badges.filter((b) => b.earned).length;
  const loading = (all.isLoading || mine.isLoading) && badges.length === 0;
  const failed = !!all.error && !!mine.error;

  return (
    <Card>
      <CardHeader
        icon={<SparklesIcon />}
        title="Rozetler"
        description={loading ? 'Yükleniyor' : badges.length ? `${earnedCount} / ${badges.length} kazanıldı` : undefined}
      />
      <div className="p-5">
        {(all.error || mine.error) && !failed && (
          <Alert tone="error" className="mb-4">
            {mine.error ? 'Kazandığın rozetler alınamadı; tüm rozetler kilitli görünebilir.' : 'Rozet kataloğu alınamadı; yalnızca kazandıkların gösteriliyor.'}
          </Alert>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        ) : failed ? (
          <EmptyState title="Rozetler yüklenemedi" description="Birazdan tekrar dene." className="py-8" />
        ) : badges.length === 0 ? (
          <EmptyState icon={<SparklesIcon />} title="Henüz rozet yok" description="İşlem yaptıkça rozetler kazanacaksın." className="py-8" />
        ) : (
          <>
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Rozet ilerlemesi" aria-valuemin={0} aria-valuemax={badges.length} aria-valuenow={earnedCount}>
              <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${(earnedCount / badges.length) * 100}%` }} />
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {badges.map((b) => (
                <BadgeTile key={b.id} badge={b} />
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

function BadgeTile({ badge }: { badge: Badge }) {
  const earned = !!badge.earned;
  return (
    <li
      className={cn(
        'relative flex flex-col rounded-xl border p-3.5',
        earned ? 'border-brand/30 bg-brand-soft' : 'border-line bg-surface-2/60',
      )}
    >
      <span className="sr-only">{earned ? 'Kazanıldı: ' : 'Kilitli: '}</span>
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden="true"
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg text-xl',
            earned ? 'bg-surface shadow-card' : 'bg-surface-3 opacity-50 grayscale',
          )}
        >
          {badge.icon || '🏅'}
        </span>
        {!earned && <LockClosedIcon className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />}
      </div>
      <p className={cn('mt-2.5 text-sm font-semibold leading-tight', !earned && 'text-muted')}>{badge.name}</p>
      {badge.description && <p className="mt-1 text-xs leading-snug text-muted">{badge.description}</p>}
      <p className="mt-auto pt-2 text-[11px] text-subtle">
        {earned
          ? badge.earned_at
            ? `${formatDate(badge.earned_at)} tarihinde kazanıldı`
            : 'Kazanıldı'
          : CATEGORY_LABELS[badge.category] ?? badge.category}
      </p>
    </li>
  );
}
