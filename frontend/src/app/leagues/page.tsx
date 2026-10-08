'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { KeyIcon, PlusIcon, UserGroupIcon } from '@heroicons/react/20/solid';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useNow } from '@/hooks/useNow';
import { leaguesApi } from '@/lib/api';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import Button from '@portfoygo/shared/ui/Button';
import { Card } from '@portfoygo/shared/ui/Card';
import { Alert, EmptyState } from '@portfoygo/shared/ui/Feedback';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import { useToast } from '@portfoygo/shared/ui/Toast';
import LeagueCard, { LeagueCardSkeleton } from '@/components/leagues/LeagueCard';
import CreateLeagueModal from '@/components/leagues/CreateLeagueModal';
import { JoinLeagueModal } from '@/components/leagues/JoinLeague';
import { LEAGUES_KEY, LIMITS, leagueKey } from '@/components/leagues/shared';
import type { League, User } from '@/types';

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

  const verified = user.email_verified;
  const leagues = data ?? [];
  const owned = leagues.filter((l) => l.role === 'owner').length;
  const atJoinLimit = leagues.length >= LIMITS.joined;
  const atOwnLimit = owned >= LIMITS.owned;
  const canCreate = verified && !atJoinLimit && !atOwnLimit;
  const canJoin = verified && !atJoinLimit;

  const closeJoin = () => {
    setJoinOpen(false);
    if (joinRequested) router.replace('/leagues', { scroll: false });
  };

  const openLeague = (league: League, message: string) => {
    toast.success(message, { description: league.name });
    void mutate();
    void globalMutate(leagueKey(league.id));
    router.push(`/leagues/${league.id}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Rekabet"
        title="Özel ligler"
        description="Arkadaşlarınla kendi ligini kur, davet koduyla katıl ve kendi aranızda getiri yarışı yapın."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setJoinOpen(true)}
              disabled={!canJoin}
              icon={<KeyIcon className="h-4 w-4" aria-hidden="true" />}
            >
              Koda göre katıl
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!canCreate} icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}>
              Lig oluştur
            </Button>
          </>
        }
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

      {isLoading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                Özel liglerde yalnızca davet ettiğin arkadaşlarınla yarışırsın. Herkesin getirisi lige katıldığı andaki varlığına göre ölçülür; yani
                geç katılan da eşit şartlarda başlar. Bir lig kur ve davet kodunu paylaş ya da arkadaşının kodunu gir.
              </>
            }
            action={
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={() => setCreateOpen(true)} disabled={!canCreate} icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}>
                  Lig oluştur
                </Button>
                <Button variant="secondary" onClick={() => setJoinOpen(true)} disabled={!canJoin} icon={<KeyIcon className="h-4 w-4" aria-hidden="true" />}>
                  Koda göre katıl
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {leagues.map((l) => (
              <li key={l.id}>
                <LeagueCard league={l} now={now} />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            <span className="num">
              {leagues.length}/{LIMITS.joined}
            </span>{' '}
            lig · kurduğun{' '}
            <span className="num">
              {owned}/{LIMITS.owned}
            </span>{' '}
            · lig başına en fazla {LIMITS.members} oyuncu
          </p>
        </>
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
