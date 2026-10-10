'use client';

import { useState } from 'react';
import { TrophyIcon } from '@heroicons/react/24/outline';
import { cn } from '@portfoygo/shared/format';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { useAuth } from '@/context/AuthContext';
import { useArenaLeaders } from '@/hooks/useArena';
import type { ArenaLeader, ArenaLeaderPeriod } from '@/types';
import { RankBadge } from './bits';

/** "Arena liderleri": günün / haftanın en iyi tur getirileri. */
export default function ArenaLeaders({ className }: { className?: string }) {
  const [period, setPeriod] = useState<ArenaLeaderPeriod>('day');
  const { data, error, isLoading } = useArenaLeaders(period);
  const { user } = useAuth();
  const items = (data?.items ?? []).slice(0, 10);
  // Backend "me" satırında kullanıcı adı olmayabilir: kendi satırımızı oturumdaki kullanıcı adıyla tanırız
  const isMe = (r: ArenaLeader) => !!r.is_me || (!!user && r.username === user.username);
  const me = data?.me ? { ...data.me, username: data.me.username !== '—' ? data.me.username : (user?.username ?? '—') } : null;
  const meListed = items.some(isMe) || (!!me && items.some((i) => i.rank === me.rank && i.username === me.username));

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Arena liderleri"
        description="En iyi tur getirisi"
        icon={<TrophyIcon />}
        action={
          <Tabs
            label="Dönem"
            value={period}
            onChange={setPeriod}
            items={[
              { value: 'day', label: 'Bugün' },
              { value: 'week', label: 'Bu hafta' },
            ]}
          />
        }
      />
      <div role="tabpanel" aria-label={period === 'day' ? 'Bugün' : 'Bu hafta'} className="flex-1 px-3 pb-4 sm:px-4">
        {isLoading && !data ? (
          <div className="space-y-2 px-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error && !data ? (
          <EmptyState title="Liderler yüklenemedi" description="Birazdan tekrar dene." className="py-8" />
        ) : items.length === 0 ? (
          <EmptyState title={period === 'day' ? 'Bugün henüz tur oynanmadı' : 'Bu hafta henüz tur oynanmadı'} description="İlk turu sen başlat, listenin tepesine yerleş." className="py-8" />
        ) : (
          <ol>
            {items.map((r) => (
              <LeaderRow key={`${r.rank}-${r.username}`} r={r} me={isMe(r)} />
            ))}
            {me && !meListed && (
              <>
                <li aria-hidden="true" className="py-1 text-center text-xs text-subtle">
                  ⋯
                </li>
                <LeaderRow r={me} me />
              </>
            )}
          </ol>
        )}
      </div>
    </Card>
  );
}

function LeaderRow({ r, me }: { r: ArenaLeader; me: boolean }) {
  return (
    <li className={cn('flex items-center gap-3 rounded-xl px-2 py-2', me && 'bg-brand-soft')}>
      <RankBadge rank={r.rank} />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm', me ? 'font-semibold text-brand' : 'font-medium text-fg')}>
          {r.username}
          {me && <span className="ml-1 text-xs font-normal">(sen)</span>}
        </span>
        {r.rounds > 0 && <span className="num block text-xs text-subtle">{r.rounds} tur</span>}
      </span>
      <Delta value={r.return_pct} />
    </li>
  );
}
