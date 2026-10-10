'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRightIcon, CalendarDaysIcon, ClockIcon, GlobeAltIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import { Alert, Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { cn } from '@portfoygo/shared/format';
import { SearchInput, toolbarButtonClass } from '@/components/common/controls';
import Pagination from '@/components/common/Pagination';
import { ApiError, leaguesApi } from '@/lib/api';
import { formatLeagueDate, leagueTiming } from '@/lib/competition';
import type { League, PublicLeague, PublicLeagueFilter } from '@/types';
import { MemberBar, StatusBadge, publicLeaguesKey } from './shared';

const PAGE_SIZE = 12;

const FILTERS: { value: PublicLeagueFilter; label: string }[] = [
  { value: 'open', label: 'Açık' },
  { value: 'upcoming', label: 'Yakında' },
  { value: 'active', label: 'Devam eden' },
  { value: 'finished', label: 'Biten' },
];

interface Props {
  now: number;
  verified: boolean;
  /** Kullanıcı lig sınırına ulaştıysa katılım kapalı */
  canJoin: boolean;
  onJoined: (league: League) => void;
}

/** Keşfet: herkese açık ligleri arama, durum filtresi ve sayfalama ile listeler. */
export default function DiscoverLeagues({ now, verified, canJoin, onJoined }: Props) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PublicLeagueFilter>('open');
  const [page, setPage] = useState(1);
  const [joining, setJoining] = useState<string | null>(null);
  const [joinError, setJoinError] = useState('');

  // Aramayı yazarken her tuşta istek atma
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data, error, isLoading, mutate } = useSWR(
    publicLeaguesKey(search, status, page),
    ([, s, st, p]) => leaguesApi.discover({ search: s || undefined, status: st, limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE }),
    { keepPreviousData: true },
  );
  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const unavailable = error instanceof ApiError && error.status === 404;

  const join = async (league: PublicLeague) => {
    setJoining(league.id);
    setJoinError('');
    try {
      const joined = await leaguesApi.joinPublic(league.id);
      void mutate();
      onJoined(joined.id ? joined : { ...joined, id: league.id, name: league.name });
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Lige katılınamadı. Lütfen tekrar dene.');
    } finally {
      setJoining(null);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(1);
          }}
          placeholder="Lig adı ya da kurucu ara"
          label="Herkese açık liglerde ara"
          className="lg:max-w-sm lg:flex-1"
        />
        <Tabs
          label="Lig durumu"
          items={FILTERS}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          className="self-start"
        />
      </div>

      {joinError && <Alert tone="error">{joinError}</Alert>}

      {isLoading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <PublicLeagueSkeleton key={i} />
          ))}
        </div>
      ) : error && !data ? (
        <Card>
          <EmptyState
            icon={<GlobeAltIcon />}
            title={unavailable ? 'Keşfet yakında' : 'Ligler yüklenemedi'}
            description={
              unavailable ? 'Herkese açık ligler henüz kullanıma açılmadı. Biraz sonra tekrar dene.' : error instanceof Error ? error.message : 'Beklenmeyen bir hata oluştu.'
            }
            action={
              <Button variant="secondary" size="sm" onClick={() => void mutate()}>
                Tekrar dene
              </Button>
            }
          />
        </Card>
      ) : !data || data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<GlobeAltIcon />}
            title={search ? 'Aramana uyan lig yok' : 'Bu filtrede lig yok'}
            description={
              search
                ? 'Farklı bir ad dene ya da filtreyi değiştir.'
                : status === 'finished'
                  ? 'Henüz sona eren herkese açık lig yok.'
                  : 'Herkese açık bir lig kur; Keşfet’te listelenir ve herkes katılabilir.'
            }
          />
        </Card>
      ) : (
        <>
          <ul className={cn('grid gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3', error && 'opacity-60')} aria-busy={isLoading}>
            {data.items.map((l) => (
              <li key={l.id}>
                <PublicLeagueCard
                  league={l}
                  now={now}
                  canJoin={verified && canJoin}
                  pending={joining === l.id}
                  disabled={joining !== null}
                  onJoin={() => void join(l)}
                />
              </li>
            ))}
          </ul>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} label="Keşfet sayfaları" />
        </>
      )}
    </div>
  );
}

function PublicLeagueCard({
  league,
  now,
  canJoin,
  pending,
  disabled,
  onJoin,
}: {
  league: PublicLeague;
  now: number;
  canJoin: boolean;
  pending: boolean;
  disabled: boolean;
  onJoin: () => void;
}) {
  const timing = leagueTiming(league, now);
  const full = league.member_count >= league.max_members;
  const finished = league.status === 'finished';
  const href = `/leagues/${league.id}`;

  let action;
  if (league.is_member) {
    action = (
      <Link href={href} className={cn(toolbarButtonClass, 'w-full')}>
        Üyesin · Lige git
        <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
      </Link>
    );
  } else if (finished) {
    // Sonuçlar yalnızca üyelere açık
    action = (
      <p className="flex h-10 items-center justify-center rounded-lg bg-surface-2 text-sm text-muted">Lig sona erdi</p>
    );
  } else {
    action = (
      <Button className="w-full" onClick={onJoin} loading={pending} disabled={!canJoin || full || disabled} aria-label={`${league.name} ligine katıl`}>
        {full ? 'Lig dolu' : 'Lige katıl'}
      </Button>
    );
  }

  return (
    <Card className="flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <StatusBadge status={league.status} />
        {league.is_member && <Badge tone="brand">Üyesin</Badge>}
      </div>
      <h3 className="mt-4 truncate text-lg font-semibold text-fg">
        {league.is_member ? (
          <Link href={href} className="hover:text-brand focus-visible:outline-offset-2">
            {league.name}
          </Link>
        ) : (
          league.name
        )}
      </h3>
      <p className="mt-0.5 truncate text-sm text-muted">Kurucu: {league.owner_username}</p>
      {league.description && <p className="mt-3 line-clamp-2 break-words text-sm text-muted">{league.description}</p>}

      <div className="mt-auto space-y-4 pt-5">
        <MemberBar count={league.member_count} max={league.max_members} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
          <span className="inline-flex min-w-0 items-center gap-1">
            <ClockIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{finished && league.ends_at ? `Bitiş: ${formatLeagueDate(league.ends_at)}` : timing.label}</span>
          </span>
          {league.status === 'upcoming' && league.starts_at && (
            <span className="inline-flex items-center gap-1">
              <CalendarDaysIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {formatLeagueDate(league.starts_at)}
            </span>
          )}
        </div>
        {action}
      </div>
    </Card>
  );
}

function PublicLeagueSkeleton() {
  return (
    <Card className="space-y-4 p-5 sm:p-6" aria-hidden="true">
      <Skeleton className="h-5 w-24 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
      <Skeleton className="h-11 w-full rounded-lg" />
    </Card>
  );
}
