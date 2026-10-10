'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { GlobeAltIcon, KeyIcon, PlusIcon, UserGroupIcon } from '@heroicons/react/20/solid';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useNow } from '@/hooks/useNow';
import { leaguesApi } from '@/lib/api';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import Breadcrumb from '@/components/common/Breadcrumb';
import Button from '@portfoygo/shared/ui/Button';
import { Card } from '@portfoygo/shared/ui/Card';
import { Alert, EmptyState } from '@portfoygo/shared/ui/Feedback';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { useToast } from '@portfoygo/shared/ui/Toast';
import LeagueCard, { LeagueCardSkeleton } from '@/components/leagues/LeagueCard';
import CreateLeagueModal from '@/components/leagues/CreateLeagueModal';
import { JoinLeagueModal } from '@/components/leagues/JoinLeague';
import DiscoverLeagues from '@/components/leagues/DiscoverLeagues';
import { LEAGUES_KEY, LIMITS, leagueKey } from '@/components/leagues/shared';
import type { League, User } from '@/types';

type Tab = 'mine' | 'kesfet';

export default function LeaguesPage() {
  // useSearchParams askıya alınabilir; sınır burada.
  return (
    <Suspense fallback={<PageLoader />}>
      <LeaguesGate />
    </Suspense>
  );
}

function LeaguesGate() {
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;
  return <Leagues user={user} />;
}

function Leagues({ user }: { user: User }) {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  const now = useNow();
  const { mutate: globalMutate } = useSWRConfig();
  const { data, error, isLoading, mutate } = useSWR(LEAGUES_KEY, () => leaguesApi.list());

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  // Komut paletindeki "Lige katıl" /leagues?join=1 adresine gider
  const joinRequested = search.get('join') === '1';
  const showJoin = joinOpen || joinRequested;
  // Sekme adreste tutulur: /leagues?tab=kesfet paylaşılabilir ve geri tuşuyla korunur
  const tab: Tab = search.get('tab') === 'kesfet' ? 'kesfet' : 'mine';
  const setTab = (next: Tab) => router.replace(next === 'kesfet' ? '/leagues?tab=kesfet' : '/leagues', { scroll: false });

  const verified = user.email_verified;
  const leagues = data ?? [];
  const owned = leagues.filter((l) => l.role === 'owner').length;
  const atJoinLimit = leagues.length >= LIMITS.joined;
  const atOwnLimit = owned >= LIMITS.owned;
  const canCreate = verified && !atJoinLimit && !atOwnLimit;
  const canJoin = verified && !atJoinLimit;

  const closeJoin = () => {
    setJoinOpen(false);
    if (joinRequested) router.replace(tab === 'kesfet' ? '/leagues?tab=kesfet' : '/leagues', { scroll: false });
  };

  const openLeague = (league: League, message: string) => {
    toast.success(message, { description: league.name });
    void mutate();
    void globalMutate(leagueKey(league.id));
    router.push(`/leagues/${league.id}`);
  };

  const actions = (
    <div className="flex flex-col-reverse gap-3 sm:flex-row">
      <Button variant="secondary" onClick={() => setJoinOpen(true)} disabled={!canJoin} icon={<KeyIcon className="h-4 w-4" aria-hidden="true" />}>
        Koda göre katıl
      </Button>
      <Button onClick={() => setCreateOpen(true)} disabled={!canCreate} icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}>
        Lig oluştur
      </Button>
    </div>
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Ligler"
        description="Kısa periyotlu ligler, canlı meydan okumalar: arkadaşlarınla özel lig kur ya da herkese açık bir lige katıl."
        actions={<Breadcrumb items="Ligler" />}
      />

      <Tabs
        variant="underline"
        label="Lig görünümü"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'mine', label: 'Liglerim', count: data ? leagues.length : undefined },
          {
            value: 'kesfet',
            label: (
              <>
                <GlobeAltIcon className="h-4 w-4" aria-hidden="true" />
                Keşfet
              </>
            ),
          },
        ]}
      />

      {!verified && (
        <Alert tone="info">
          Lig kurmak ya da bir lige katılmak için e-posta adresini doğrulaman gerekiyor.{' '}
          <Link href="/verify-email" className="font-semibold underline underline-offset-2">
            E-postamı doğrula
          </Link>
        </Alert>
      )}
      {verified && atJoinLimit && <Alert tone="info">En fazla {LIMITS.joined} lige üye olabilirsin. Yeni bir lige katılmak için önce birinden ayrıl.</Alert>}
      {verified && !atJoinLimit && atOwnLimit && (
        <Alert tone="info">En fazla {LIMITS.owned} lig kurabilirsin. Yeni lig kurmak için kurduğun liglerden birini sil.</Alert>
      )}

      {tab === 'kesfet' ? (
        <div role="tabpanel" aria-label="Keşfet">
          <DiscoverLeagues now={now} verified={verified} canJoin={!atJoinLimit} onJoined={(league) => openLeague(league, 'Lige katıldın')} />
        </div>
      ) : (
        <div role="tabpanel" aria-label="Liglerim" className="space-y-4 md:space-y-6">
          {!(data && leagues.length === 0) && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">
                {data ? (
                  <>
                    <span className="num font-medium text-fg">
                      {leagues.length}/{LIMITS.joined}
                    </span>{' '}
                    lig · kurduğun{' '}
                    <span className="num font-medium text-fg">
                      {owned}/{LIMITS.owned}
                    </span>{' '}
                    · lig başına en fazla {LIMITS.members} oyuncu
                  </>
                ) : null}
              </p>
              {actions}
        </div>
      )}

      {isLoading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <LeagueCardSkeleton key={i} />
          ))}
        </div>
      ) : error && !data ? (
        <Card>
          <EmptyState
            icon={<UserGroupIcon />}
            title="Ligler yüklenemedi"
            description={error instanceof Error ? error.message : 'Beklenmeyen bir hata oluştu.'}
            action={
              <Button variant="secondary" size="sm" onClick={() => void mutate()}>
                Tekrar dene
              </Button>
            }
          />
        </Card>
      ) : leagues.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UserGroupIcon />}
            title="Henüz bir ligde değilsin"
            description={
              <>
                1 günlük hızlı liglerden 3 aylık maratonlara kadar kendi ligini kur ya da Keşfet’ten herkese açık bir lige katıl. Başlamadan önce
                katılan herkes başlangıç anındaki varlığından ölçülür; yani herkes eşit şartlarda yarışır.
              </>
            }
            action={
              <div className="flex flex-col items-center gap-3">
                {actions}
                <button type="button" onClick={() => setTab('kesfet')} className="text-sm font-medium text-brand hover:underline">
                  Herkese açık ligleri keşfet
                </button>
              </div>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
          {leagues.map((l) => (
            <li key={l.id}>
              <LeagueCard league={l} now={now} />
            </li>
          ))}
        </ul>
      )}
        </div>
      )}

      <CreateLeagueModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(league) => {
          setCreateOpen(false);
          openLeague(league, 'Lig oluşturuldu');
        }}
      />
      <JoinLeagueModal
        open={showJoin}
        onClose={closeJoin}
        verified={verified}
        onJoined={(league) => {
          setJoinOpen(false);
          openLeague(league, 'Lige katıldın');
        }}
      />
    </div>
  );
}
