'use client';

import { Suspense, use, useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR, { useSWRConfig } from 'swr';
import { ArrowLeftIcon, ArrowRightStartOnRectangleIcon, TrashIcon, UserGroupIcon, UsersIcon } from '@heroicons/react/20/solid';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { ApiError, leaguesApi } from '@/lib/api';
import { cn } from '@portfoygo/shared/format';
import PageHeader from '@portfoygo/shared/ui/PageHeader';
import Breadcrumb from '@/components/common/Breadcrumb';
import { toolbarButtonClass } from '@/components/common/controls';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { PageLoader } from '@portfoygo/shared/ui/Spinner';
import { useToast } from '@portfoygo/shared/ui/Toast';
import InviteCard from '@/components/leagues/InviteCard';
import LeagueHero from '@/components/leagues/LeagueHero';
import LeagueFeed from '@/components/leagues/LeagueFeed';
import WinnerPodium from '@/components/leagues/WinnerPodium';
import Standings, { StandingsSkeleton } from '@/components/leagues/Standings';
import ConfirmModal from '@/components/leagues/ConfirmModal';
import { EditLeagueModal } from '@/components/leagues/CreateLeagueModal';
import { LEAGUES_KEY, LIMITS, isPublicLeaguesKey, leagueKey } from '@/components/leagues/shared';
import PortfolioLeagueSection from '@/components/leagues/portfolio/PortfolioLeagueSection';
import type { League, LeagueDetail, LeagueMember, User } from '@/types';

export default function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  // use(params) askıya alınabilir; sınır burada.
  return (
    <Suspense fallback={<PageLoader />}>
      <LeagueGate params={params} />
    </Suspense>
  );
}

function LeagueGate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useRequireAuth();
  if (!ready || !user) return <PageLoader />;
  return <LeagueView id={id} user={user} />;
}

type Pending = { kind: 'leave' } | { kind: 'delete' } | { kind: 'remove'; member: LeagueMember } | null;

const MISSING = [400, 403, 404];

function LeagueView({ id, user }: { id: string; user: User }) {
  const router = useRouter();
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const { data, error, isLoading, mutate } = useSWR(leagueKey(id), ([, leagueId]) => leaguesApi.get(leagueId), {
    // Bitmiş ligin sonuçları dondurulmuştur; canlı yenileme yalnızca başlamamış / devam eden ligde
    refreshInterval: (latest?: LeagueDetail) => (latest?.league.status === 'finished' ? 0 : 30_000),
    shouldRetryOnError: (err: unknown) => !(err instanceof ApiError && MISSING.includes(err.status)),
  });
  const [pending, setPending] = useState<Pending>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const refresh = useCallback(() => void mutate(), [mutate]);
  // Kullanıcının lig sayısı sınırı (katıl düğmesi için)
  const mine = useSWR(data && !data.league.is_member ? LEAGUES_KEY : null, () => leaguesApi.list());

  if (isLoading && !data) return <LeagueSkeleton />;

  if (error && !data) {
    const missing = error instanceof ApiError && MISSING.includes(error.status);
    // Üye olmayan detayı göremez (404); herkese açık bir ligse buradan katılabilir
    if (missing) {
      return (
        <NotMember
          id={id}
          verified={user.email_verified}
          onJoined={(name) => {
            toast.success('Lige katıldın', { description: name || undefined });
            void mutate();
            void globalMutate(LEAGUES_KEY);
            void globalMutate(isPublicLeaguesKey);
          }}
        />
      );
    }
    return (
      <Card>
        <EmptyState
          icon={<UserGroupIcon />}
          title={missing ? 'Lig bulunamadı' : 'Lig yüklenemedi'}
          description={
            missing ? 'Bu lig silinmiş olabilir ya da özel bir lig. Davet koduyla katılabilirsin.' : error instanceof Error ? error.message : 'Beklenmeyen bir hata oluştu.'
          }
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              {!missing && (
                <Button variant="secondary" size="sm" onClick={() => void mutate()}>
                  Tekrar dene
                </Button>
              )}
              <LinkButton href="/leagues" size="sm" icon={<ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />}>
                Liglere dön
              </LinkButton>
            </div>
          }
        />
      </Card>
    );
  }
  if (!data) return null;

  const { league, members } = data;
  const { status } = league;
  // Portföy ligi: TL sıralaması / akış yerine aynı sermayeli sanal portföy bölümü
  const portfolioMode = league.mode === 'portfolio' && league.is_member;
  const member = league.is_member;
  const isOwner = member && league.role === 'owner';
  const full = league.member_count >= league.max_members;
  const atJoinLimit = (mine.data?.length ?? 0) >= LIMITS.joined;

  const afterExit = (title: string) => {
    toast.success(title, { description: league.name });
    void globalMutate(LEAGUES_KEY);
    void globalMutate(isPublicLeaguesKey);
    router.push('/leagues');
  };

  const setCode = (code: string) => {
    void mutate((prev?: LeagueDetail) => (prev ? { ...prev, league: { ...prev.league, invite_code: code } } : prev), { revalidate: false });
    void globalMutate(LEAGUES_KEY);
  };

  const joinPublic = async () => {
    setJoining(true);
    setJoinError('');
    try {
      await leaguesApi.joinPublic(league.id);
      toast.success('Lige katıldın', { description: league.name });
      await mutate();
      void globalMutate(LEAGUES_KEY);
      void globalMutate(isPublicLeaguesKey);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Lige katılınamadı. Lütfen tekrar dene.');
    } finally {
      setJoining(false);
    }
  };

  const joinReason = !user.email_verified
    ? 'Katılmak için e-posta adresini doğrula.'
    : full
      ? 'Lig dolu.'
      : atJoinLimit
        ? `En fazla ${LIMITS.joined} lige üye olabilirsin.`
        : status === 'active'
          ? 'Lig devam ediyor; getirin katıldığın andan itibaren ölçülür.'
          : undefined;
  const canJoinHere = !member && league.visibility === 'public' && status !== 'finished';

  const onSaved = (saved: League) => {
    setEditOpen(false);
    toast.success('Lig güncellendi', { description: saved.name || league.name });
    void mutate();
    void globalMutate(LEAGUES_KEY);
    void globalMutate(isPublicLeaguesKey);
  };

  const standingsTitle = status === 'upcoming' ? 'Oyuncular' : status === 'finished' ? 'Final sıralaması' : 'Canlı sıralama';
  const standingsDescription =
    status === 'upcoming'
      ? 'Sıralama lig başladığında oluşur'
      : status === 'finished'
        ? 'Sonuçlar donduruldu'
        : 'Getiri · 30 sn’de bir yenilenir';

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title={<span className="break-words">{league.name}</span>}
        description={league.description ? <span className="break-words">{league.description}</span> : undefined}
        actions={
          <>
            <Link href="/leagues" className={cn(toolbarButtonClass, 'md:hidden')}>
              <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
              Ligler
            </Link>
            <Breadcrumb
              items={[
                { label: 'Panel', href: '/' },
                { label: 'Ligler', href: '/leagues' },
                { label: league.name },
              ]}
            />
          </>
        }
      />

      <LeagueHero
        league={league}
        onEdit={isOwner ? () => setEditOpen(true) : undefined}
        onElapsed={refresh}
        join={
          canJoinHere
            ? { onJoin: () => void joinPublic(), pending: joining, disabled: !user.email_verified || full || atJoinLimit, reason: joinReason }
            : undefined
        }
      />

      {joinError && <Alert tone="error">{joinError}</Alert>}
      {error && <Alert tone="error">Lig güncellenemedi; son alınan bilgiler gösteriliyor.</Alert>}

      {status === 'finished' && !portfolioMode && <WinnerPodium members={members} endsAt={league.finalized_at ?? league.ends_at} />}

      <div className={cn('grid grid-cols-1 gap-4 md:gap-6', !portfolioMode && 'xl:grid-cols-[minmax(0,1fr)_340px]')}>
        {portfolioMode ? (
          <div className="min-w-0">
            <PortfolioLeagueSection league={league} onLeagueChanged={refresh} />
          </div>
        ) : (
          <Card className="min-w-0 self-start overflow-hidden">
            <CardHeader
              title={
                status === 'active' ? (
                  <span className="inline-flex items-center gap-2">
                    {standingsTitle}
                    <span className="relative flex h-2 w-2" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-60 motion-reduce:animate-none" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-up" />
                    </span>
                  </span>
                ) : (
                  standingsTitle
                )
              }
              description={standingsDescription}
            />
            {members.length === 0 ? (
              <EmptyState className="border-t border-line" icon={<UsersIcon />} title="Henüz oyuncu yok" description="Davet kodunu paylaşarak arkadaşlarını çağır." />
            ) : (
              <Standings members={members} status={status} canRemove={isOwner} onRemove={(m) => setPending({ kind: 'remove', member: m })} />
            )}
          </Card>
        )}

        {member && (
          <aside
            className={cn(
              portfolioMode ? 'grid items-start gap-4 md:grid-cols-2 md:gap-6' : 'space-y-4 md:space-y-6',
              status === 'upcoming' && !portfolioMode && 'order-first xl:order-none',
            )}
          >
            {status !== 'finished' && (
              <InviteCard
                leagueId={league.id}
                code={league.invite_code}
                isOwner={isOwner}
                full={full}
                ended={false}
                prominent={status === 'upcoming'}
                onCodeChanged={setCode}
              />
            )}

            {status !== 'upcoming' && !portfolioMode && <LeagueFeed leagueId={league.id} live={status === 'active'} />}

            <Card>
              <CardHeader title={isOwner ? 'Lig yönetimi' : 'Üyelik'} description={isOwner ? 'Yalnızca kurucu görebilir' : undefined} />
              <CardBody className="space-y-4 border-t border-line">
                {isOwner ? (
                  <>
                    <p className="text-sm text-muted">Ligi silmek tüm üyeleri çıkarır ve sıralamayı kalıcı olarak kaldırır.</p>
                    <Button variant="down" className="w-full" onClick={() => setPending({ kind: 'delete' })} icon={<TrashIcon className="h-4 w-4" aria-hidden="true" />}>
                      Ligi sil
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted">
                      {status === 'finished'
                        ? 'Ligden ayrılırsan bu ligin sonuçları listende görünmez.'
                        : portfolioMode
                          ? 'Ligden ayrılırsan sıralamadan çıkarsın. Geç katılım süresi içinde geri dönersen aynı portföyle devam edersin.'
                          : 'Ligden ayrılırsan sıralamadan çıkarsın. Yeniden katılırsan getirin o andan itibaren ölçülür.'}
                    </p>
                    <Button
                      variant="down"
                      className="w-full"
                      onClick={() => setPending({ kind: 'leave' })}
                      icon={<ArrowRightStartOnRectangleIcon className="h-4 w-4" aria-hidden="true" />}
                    >
                      Ligden ayrıl
                    </Button>
                  </>
                )}
              </CardBody>
            </Card>
          </aside>
        )}
      </div>

      {isOwner && <EditLeagueModal open={editOpen} league={league} onClose={() => setEditOpen(false)} onSaved={onSaved} />}

      <ConfirmModal
        open={pending?.kind === 'leave'}
        onClose={() => setPending(null)}
        title="Ligden ayrılmak istiyor musun?"
        confirmLabel="Ligden ayrıl"
        onConfirm={async () => {
          await leaguesApi.leave(league.id);
          afterExit('Ligden ayrıldın');
        }}
      >
        <p>
          <span className="font-medium text-fg">{league.name}</span> sıralamasından çıkacaksın.
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={pending?.kind === 'delete'}
        onClose={() => setPending(null)}
        title="Lig silinsin mi?"
        confirmLabel="Ligi sil"
        onConfirm={async () => {
          await leaguesApi.remove(league.id);
          afterExit('Lig silindi');
        }}
      >
        <p>
          <span className="font-medium text-fg">{league.name}</span> ve {league.member_count} oyunculuk sıralaması kalıcı olarak silinecek. Bu işlem
          geri alınamaz.
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={pending?.kind === 'remove'}
        onClose={() => setPending(null)}
        title="Oyuncu ligden çıkarılsın mı?"
        confirmLabel="Ligden çıkar"
        onConfirm={async () => {
          if (pending?.kind !== 'remove') return;
          const { member: target } = pending;
          await leaguesApi.removeMember(league.id, target.user_id);
          setPending(null);
          toast.success('Oyuncu ligden çıkarıldı', { description: target.username });
          void mutate();
          void globalMutate(LEAGUES_KEY);
        }}
      >
        <p>
          <span className="font-medium text-fg">{pending?.kind === 'remove' ? pending.member.username : ''}</span> ligden çıkarılacak. Davet kodunu
          biliyorsa yeniden katılabilir; bunu önlemek için kodu yenileyebilirsin.
        </p>
      </ConfirmModal>
    </div>
  );
}

/** Lig detayı alınamadığında (üye değil ya da lig yok): herkese açık lige katılma ya da kodla katılma. */
function NotMember({ id, verified, onJoined }: { id: string; verified: boolean; onJoined: (name: string) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const join = async () => {
    setPending(true);
    setError('');
    try {
      const league = await leaguesApi.joinPublic(id);
      onJoined(league.name);
    } catch (err) {
      setError(
        err instanceof ApiError && MISSING.includes(err.status)
          ? 'Bu lig bulunamadı ya da herkese açık değil. Özel liglere davet koduyla katılabilirsin.'
          : err instanceof Error
            ? err.message
            : 'Lige katılınamadı. Lütfen tekrar dene.',
      );
      setPending(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <PageHeader
        title="Lig"
        actions={
          <Breadcrumb
            items={[
              { label: 'Panel', href: '/' },
              { label: 'Ligler', href: '/leagues' },
              { label: 'Lig' },
            ]}
          />
        }
      />
      <Card className="mx-auto max-w-xl">
        <EmptyState
          icon={<UserGroupIcon />}
          title="Bu ligin üyesi değilsin"
          description="Herkese açık bir ligse hemen katılabilirsin; sıralamayı ve lig akışını katıldıktan sonra görürsün. Özel liglere davet koduyla katılınır."
          action={
            <div className="flex w-full flex-col items-stretch gap-3">
              {!verified && (
                <Alert tone="info">
                  Lige katılmak için e-posta adresini doğrulaman gerekiyor.{' '}
                  <Link href="/verify-email" className="font-semibold underline underline-offset-2">
                    E-postamı doğrula
                  </Link>
                </Alert>
              )}
              {error && <Alert tone="error">{error}</Alert>}
              <div className="flex flex-col justify-center gap-2 sm:flex-row">
                <Button onClick={() => void join()} loading={pending} disabled={!verified}>
                  Lige katıl
                </Button>
                <LinkButton href="/leagues/join" variant="secondary">
                  Koda göre katıl
                </LinkButton>
              </div>
              <Link href="/leagues?tab=kesfet" className="text-sm font-medium text-brand hover:underline">
                Herkese açık ligleri keşfet
              </Link>
            </div>
          }
        />
      </Card>
    </div>
  );
}

function LeagueSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6" aria-busy="true">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-56 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <StandingsSkeleton />
        </Card>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}
