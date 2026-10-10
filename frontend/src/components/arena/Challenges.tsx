'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { CheckIcon, GiftIcon, SparklesIcon, UsersIcon } from '@heroicons/react/20/solid';
import { MegaphoneIcon } from '@heroicons/react/24/outline';
import { cn, formatDateTime } from '@portfoygo/shared/format';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { useArenaChallenges, useArenaInstruments, useChallengeLeaderboard } from '@/hooks/useArena';
import { useNow } from '@/hooks/useNow';
import { ApiError, arenaApi } from '@/lib/api';
import type { ArenaChallenge, ArenaChallengeStatus } from '@/types';
import { RankBadge } from './bits';
import { durationLabel, formatCountdown } from './model';

export const challengeHref = (c: Pick<ArenaChallenge, 'id'>) => `/arena/challenge/${encodeURIComponent(c.id)}`;

/** Meydan okumaya katılır; başarıda listeleri tazeler ve tur kimliğini döndürür. */
export function useJoinChallenge() {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [joining, setJoining] = useState<string | null>(null);
  const join = async (c: ArenaChallenge): Promise<string | null> => {
    setJoining(c.id);
    try {
      const { round_id } = await arenaApi.joinChallenge(c.id);
      toast.success('Meydan okumaya katıldın', { description: c.title });
      void mutate((key) => typeof key === 'string' && key.startsWith('/arena/challenges'));
      return round_id || null;
    } catch (err) {
      toast.error('Katılınamadı', { description: err instanceof Error ? err.message : 'Lütfen tekrar dene.' });
      return null;
    } finally {
      setJoining(null);
    }
  };
  return { join, joining };
}

const STATUS_META: Record<ArenaChallengeStatus, { label: string; tone: 'up' | 'brand' | 'neutral' }> = {
  live: { label: 'Canlı', tone: 'up' },
  upcoming: { label: 'Yaklaşan', tone: 'brand' },
  finished: { label: 'Bitti', tone: 'neutral' },
};

export function ChallengeStatusBadge({ status }: { status: ArenaChallengeStatus }) {
  const m = STATUS_META[status];
  return (
    <Badge tone={m.tone}>
      {status === 'live' && <span className="h-1.5 w-1.5 rounded-full bg-up motion-safe:animate-pulse" aria-hidden="true" />}
      {m.label}
    </Badge>
  );
}

export function SponsorPrize({ c, className }: { c: Pick<ArenaChallenge, 'sponsor' | 'prize_text'>; className?: string }) {
  if (!c.sponsor && !c.prize_text) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {c.sponsor && (
        <Badge tone="brand">
          <SparklesIcon className="h-3 w-3" aria-hidden="true" />
          {c.sponsor}
        </Badge>
      )}
      {c.prize_text && (
        <Badge tone="gold">
          <GiftIcon className="h-3 w-3" aria-hidden="true" />
          {c.prize_text}
        </Badge>
      )}
    </div>
  );
}

/** "Canlı meydan okumalar": canlı, yaklaşan ve biten meydan okumalar. */
export default function Challenges({ className }: { className?: string }) {
  const live = useArenaChallenges('live');
  const upcoming = useArenaChallenges('upcoming');
  const finished = useArenaChallenges('finished');
  const now = useNow(1000);
  const router = useRouter();
  const { join, joining } = useJoinChallenge();

  const loading = (live.isLoading && !live.data) || (upcoming.isLoading && !upcoming.data);
  const missing = [live.error, upcoming.error, finished.error].some((e) => e instanceof ApiError && e.status === 404);
  const failed = !loading && live.error && upcoming.error;
  const active = [...(live.data ?? []), ...(upcoming.data ?? [])];
  const done = (finished.data ?? []).slice(0, 3);

  const onJoin = async (c: ArenaChallenge) => {
    const roundId = await join(c);
    if (roundId && c.status === 'live') router.push(challengeHref(c));
  };

  return (
    <Card className={className}>
      <CardHeader title="Canlı meydan okumalar" description="Sunulan, ödüllü ve herkesin aynı anda oynadığı turlar." icon={<MegaphoneIcon />} />
      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : failed ? (
          <EmptyState
            title={missing ? 'Meydan okumalar yakında' : 'Meydan okumalar yüklenemedi'}
            description={missing ? 'Canlı yayınlanan ödüllü turlar burada listelenecek.' : 'Birazdan tekrar dene.'}
            className="py-8"
          />
        ) : active.length === 0 && done.length === 0 ? (
          <EmptyState title="Şu an planlı bir meydan okuma yok" description="Yeni meydan okumalar duyurulduğunda bildirim alırsın. O zamana kadar hızlı turla ısın." className="py-8" />
        ) : (
          <div className="space-y-6">
            {active.length > 0 && (
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {active.map((c) => (
                  <li key={c.id}>
                    <ChallengeCard c={c} now={now} joining={joining === c.id} onJoin={() => void onJoin(c)} />
                  </li>
                ))}
              </ul>
            )}
            {done.length > 0 && (
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-subtle">Biten meydan okumalar</h3>
                <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {done.map((c) => (
                    <li key={c.id}>
                      <FinishedChallengeCard c={c} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/** Enstrüman kodlarını etiketlere çevirir (ör. XAUUSD → Altın). */
export function useInstrumentLabels() {
  const { data } = useArenaInstruments();
  return (codes: string[]) => codes.map((c) => data?.find((i) => i.code === c)?.label ?? c);
}

function ChallengeCard({ c, now, joining, onJoin }: { c: ArenaChallenge; now: number; joining: boolean; onJoin: () => void }) {
  const labels = useInstrumentLabels();
  const startsIn = Date.parse(c.starts_at) - now;
  const live = c.status === 'live';
  return (
    <div className={cn('flex h-full flex-col rounded-2xl border p-4', live ? 'border-up/40 bg-up-soft/40' : 'border-line bg-surface-2')}>
      <div className="flex items-start justify-between gap-3">
        <Link href={challengeHref(c)} className="min-w-0 text-base font-semibold text-fg hover:text-brand">
          <span className="line-clamp-2">{c.title}</span>
        </Link>
        <ChallengeStatusBadge status={c.status} />
      </div>
      <SponsorPrize c={c} className="mt-2" />
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
        <div>
          <dt>{live ? 'Başladı' : 'Başlamasına'}</dt>
          <dd className="num mt-0.5 text-sm font-semibold text-fg">{live ? formatDateTime(c.starts_at) : formatCountdown(startsIn)}</dd>
        </div>
        <div>
          <dt>Süre · oyuncu</dt>
          <dd className="num mt-0.5 flex items-center gap-1 text-sm font-semibold text-fg">
            {durationLabel(c.duration_s)} ·
            <UsersIcon className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />
            {c.participants}
          </dd>
        </div>
      </dl>
      {c.instruments.length > 0 && <p className="mt-2 truncate text-xs text-subtle">{labels(c.instruments).join(' · ')}</p>}
      <div className="mt-auto flex gap-2 pt-4">
        {c.joined ? (
          <LinkButton href={challengeHref(c)} variant={live ? 'primary' : 'secondary'} size="md" className="flex-1" icon={live ? undefined : <CheckIcon className="h-4 w-4" aria-hidden="true" />}>
            {live ? 'Tura git' : 'Katıldın'}
          </LinkButton>
        ) : live ? (
          <>
            <LinkButton href={challengeHref(c)} variant="secondary" className="flex-1">
              İzle
            </LinkButton>
            <Button className="flex-1" loading={joining} onClick={onJoin}>
              Katıl
            </Button>
          </>
        ) : (
          <Button className="flex-1" loading={joining} onClick={onJoin}>
            Katıl
          </Button>
        )}
      </div>
    </div>
  );
}

function FinishedChallengeCard({ c }: { c: ArenaChallenge }) {
  const lb = useChallengeLeaderboard(c.id);
  const winners = (lb.data?.items ?? []).slice(0, 3);
  return (
    <Link href={challengeHref(c)} className="flex h-full flex-col rounded-2xl border border-line p-4 transition-colors hover:border-line-strong hover:bg-surface-2">
      <div className="flex items-start justify-between gap-3">
        <span className="line-clamp-2 min-w-0 text-sm font-semibold text-fg">{c.title}</span>
        <ChallengeStatusBadge status="finished" />
      </div>
      <p className="mt-1 text-xs text-subtle">
        {formatDateTime(c.starts_at)} · {c.participants} oyuncu
      </p>
      <ol className="mt-3 space-y-1.5">
        {lb.isLoading
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-7 w-full" />)
          : winners.length === 0
            ? <li className="text-xs text-muted">Sonuçlar hazırlanıyor.</li>
            : winners.map((w) => (
                <li key={`${w.rank}-${w.username}`} className="flex items-center gap-2">
                  <RankBadge rank={w.rank} />
                  <span className={cn('min-w-0 flex-1 truncate text-sm', w.is_me ? 'font-semibold text-brand' : 'text-fg')}>{w.username}</span>
                  <Delta value={w.return_pct} variant="text" className="text-xs" />
                </li>
              ))}
      </ol>
    </Link>
  );
}
