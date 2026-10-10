'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, CheckCircleIcon, ClockIcon, EyeIcon, UsersIcon } from '@heroicons/react/20/solid';
import { MegaphoneIcon } from '@heroicons/react/24/outline';
import { cn, formatDateTime, formatUSD } from '@portfoygo/shared/format';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import { Card } from '@portfoygo/shared/ui/Card';
import { EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useArenaChallenges, useChallengeLeaderboard } from '@/hooks/useArena';
import { useNow } from '@/hooks/useNow';
import type { ArenaChallenge } from '@/types';
import { ChallengeStatusBadge, SponsorPrize, useInstrumentLabels, useJoinChallenge } from './Challenges';
import LiveLeaderboard from './LiveLeaderboard';
import RoundScreen from './RoundScreen';
import { ReplayChip, ResponsibleNote } from './bits';
import { durationLabel, formatCountdown } from './model';

/** Katılan oyuncu için tur ekranı başlangıçtan bu kadar önce açılır (geri sayım tur ekranında akar). */
const OPEN_ROUND_BEFORE_MS = 2 * 60_000;

/**
 * Meydan okuma ayrıntısı: başlamadan önce geri sayım ve katılım; canlıyken tur ekranı
 * (katılmadıysa önce katıl ya da izle); bittiğinde sonuç tablosu.
 */
export default function ChallengeView({ id }: { id: string }) {
  const live = useArenaChallenges('live');
  const upcoming = useArenaChallenges('upcoming');
  const finished = useArenaChallenges('finished');
  const now = useNow(1000);
  const { join, joining } = useJoinChallenge();
  const labels = useInstrumentLabels();
  const [joinedRound, setJoinedRound] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [enteredRound, setEnteredRound] = useState<string | null>(null);

  const all = [...(live.data ?? []), ...(upcoming.data ?? []), ...(finished.data ?? [])];
  const c = all.find((x) => x.id === id) ?? null;
  const settled = [live, upcoming, finished].every((s) => s.data !== undefined || s.error);

  if (!c) {
    if (!settled) return <ChallengeSkeleton />;
    return (
      <Card>
        <EmptyState
          icon={<MegaphoneIcon />}
          title="Meydan okuma bulunamadı"
          description="Bu meydan okuma kaldırılmış ya da henüz yayınlanmamış olabilir."
          action={
            <LinkButton href="/arena" variant="secondary" size="sm">
              Arena&apos;ya dön
            </LinkButton>
          }
        />
      </Card>
    );
  }

  const roundId = joinedRound ?? c.round_id;
  const joined = c.joined || !!joinedRound;
  const startsIn = Date.parse(c.starts_at) - now;
  const isLive = c.status === 'live' || (c.status === 'upcoming' && startsIn <= 0);
  const showRound = !!roundId && c.status !== 'finished' && ((joined && (isLive || startsIn <= OPEN_ROUND_BEFORE_MS)) || (watching && isLive));

  // Tur ekranına girildiyse liste "bitti" olarak yenilense de ekran (ve sonuç penceresi) korunur
  if (showRound && enteredRound !== roundId) setEnteredRound(roundId);
  if ((showRound || enteredRound === roundId) && roundId) return <RoundScreen key={roundId} id={roundId} />;

  const onJoin = async () => {
    const rid = await join(c);
    if (rid) setJoinedRound(rid);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <Link href="/arena" className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-brand">
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
        Arena
      </Link>

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-12">
        <Card featured className="p-5 sm:p-6 xl:col-span-7">
          <div className="flex flex-wrap items-center gap-2">
            <ChallengeStatusBadge status={c.status} />
            <ReplayChip />
          </div>
          <h1 className="mt-3 text-xl font-semibold text-fg sm:text-2xl">{c.title}</h1>
          {c.description && <p className="mt-2 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-muted">{c.description}</p>}
          <SponsorPrize c={c} className="mt-4" />
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Fact label="Başlangıç" value={formatDateTime(c.starts_at)} />
            <Fact label="Süre" value={durationLabel(c.duration_s)} />
            <Fact label="Sanal bakiye" value={formatUSD(c.starting_cash)} />
            <Fact
              label="Oyuncu"
              value={
                <span className="inline-flex items-center gap-1">
                  <UsersIcon className="h-4 w-4 text-subtle" aria-hidden="true" />
                  {c.participants}
                </span>
              }
            />
            <Fact label="Enstrümanlar" wide value={c.instruments.length ? labels(c.instruments).join(', ') : 'Tümü'} />
          </dl>
          <ResponsibleNote className="mt-5" />
        </Card>

        <Card className="flex flex-col justify-center p-5 text-center sm:p-6 xl:col-span-5">
          {c.status === 'finished' ? (
            <>
              <CheckCircleIcon className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
              <p className="mt-2 text-lg font-semibold text-fg">Meydan okuma bitti</p>
              <p className="mt-1 text-sm text-muted">Sonuçlar aşağıda.</p>
              {c.round_id && joined && (
                <LinkButton href={`/arena/round/${encodeURIComponent(c.round_id)}`} variant="secondary" className="mx-auto mt-4">
                  Turumu görüntüle
                </LinkButton>
              )}
            </>
          ) : (
            <>
              <p className="flex items-center justify-center gap-1.5 text-xs font-medium uppercase tracking-wide text-subtle">
                <ClockIcon className="h-4 w-4" aria-hidden="true" />
                {isLive ? 'Canlı' : 'Başlamasına'}
              </p>
              <p className="num mt-2 text-4xl font-semibold text-fg sm:text-5xl" role="timer" aria-live="off">
                {isLive ? 'Şimdi' : formatCountdown(startsIn)}
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
                {joined ? (
                  <p className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-up-soft px-4 py-3 text-sm font-medium text-up">
                    <CheckCircleIcon className="h-5 w-5" aria-hidden="true" />
                    Katıldın — başlamadan önce tur ekranı açılır
                  </p>
                ) : (
                  <Button size="lg" className="sm:min-w-40" loading={joining === c.id} onClick={() => void onJoin()}>
                    Katıl
                  </Button>
                )}
                {isLive && !joined && c.round_id && (
                  <Button size="lg" variant="secondary" onClick={() => setWatching(true)} icon={<EyeIcon className="h-4 w-4" aria-hidden="true" />}>
                    İzle
                  </Button>
                )}
              </div>
              <p className="mt-4 text-xs text-subtle">Herkes aynı fiyat akışıyla, aynı anda oynar. Sanal para — gerçek yatırım değildir.</p>
            </>
          )}
        </Card>
      </div>

      <ChallengeResults c={c} />
    </div>
  );
}

function Fact({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={cn('min-w-0 rounded-xl border border-line bg-surface-2 p-3', wide && 'col-span-2')}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn('num mt-1 text-sm font-semibold text-fg', !wide && 'truncate')}>{value}</dd>
    </div>
  );
}

function ChallengeResults({ c }: { c: ArenaChallenge }) {
  const lb = useChallengeLeaderboard(c.id, c.status === 'live');
  if (c.status === 'upcoming' && !lb.data?.items.length) return null;
  return (
    <LiveLeaderboard
      rows={lb.data?.items ?? []}
      loading={lb.isLoading && !lb.data}
      limit={c.status === 'finished' ? 50 : 10}
      title={c.status === 'finished' ? 'Sonuçlar' : 'Canlı sıralama'}
      description={`${c.participants} oyuncu`}
      emptyText={c.status === 'finished' ? 'Sonuçlar hazırlanıyor.' : 'Sıralama tur başlayınca görünür.'}
    />
  );
}

function ChallengeSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Meydan okuma yükleniyor">
      <Skeleton className="h-4 w-20" />
      <div className="grid gap-4 xl:grid-cols-12">
        <Skeleton className="h-64 rounded-2xl xl:col-span-7" />
        <Skeleton className="h-64 rounded-2xl xl:col-span-5" />
      </div>
    </div>
  );
}
