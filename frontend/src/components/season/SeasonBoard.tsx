'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { CalendarDaysIcon, ListBulletIcon, TrophyIcon } from '@heroicons/react/20/solid';
import Button from '@portfoygo/shared/ui/Button';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, EmptyState } from '@portfoygo/shared/ui/Feedback';
import Podium, { PodiumSkeleton } from '@/components/leaderboard/Podium';
import RankList, { RankListSkeleton } from '@/components/leaderboard/RankList';
import { toLeaders } from '@/components/leaderboard/model';
import { seasonsApi } from '@/lib/api';
import type { User } from '@/types';
import SeasonHeaderCard, { SeasonHeaderSkeleton } from './SeasonHeaderCard';
import MySeasonCard from './MySeasonCard';
import PastSeasons from './PastSeasons';
import LeaguesPromo from './LeaguesPromo';

export const CURRENT_SEASON_KEY = 'seasons:current';
const PAGE = 50;

const leaderboardKey = (slug: string, offset: number) => ['seasons:leaderboard', slug, PAGE, offset] as const;

/** Liderlik sayfasının "Sezon" sekmesi: aktif sezon, kürsü, sıralama, geçmiş sezonlar ve lig tanıtımı. */
export default function SeasonBoard({ user }: { user: User }) {
  const current = useSWR(CURRENT_SEASON_KEY, () => seasonsApi.current(), { refreshInterval: 60_000 });
  const season = current.data?.season ?? null;
  const slug = season?.slug;

  const first = useSWR(slug ? leaderboardKey(slug, 0) : null, ([, s, limit, offset]) => seasonsApi.leaderboard(s, limit, offset), {
    refreshInterval: 60_000,
  });
  const [pages, setPages] = useState(1);

  const leaders = useMemo(() => toLeaders(first.data?.entries ?? []), [first.data]);
  const rest = leaders.slice(3);
  const total = first.data?.total ?? 0;
  const participants = current.data?.participants || total;

  const loadingSeason = current.isLoading && !current.data;
  const loadingBoard = loadingSeason || (first.isLoading && !first.data);

  const board = (() => {
    if (current.error && !current.data) {
      return (
        <Card>
          <EmptyState
            icon={<CalendarDaysIcon />}
            title="Sezon bilgisi yüklenemedi"
            description={current.error instanceof Error ? current.error.message : 'Beklenmeyen bir hata oluştu.'}
            action={
              <Button variant="secondary" size="sm" onClick={() => void current.mutate()}>
                Tekrar dene
              </Button>
            }
          />
        </Card>
      );
    }
    if (!loadingSeason && !season) {
      return (
        <Card>
          <EmptyState icon={<CalendarDaysIcon />} title="Şu an aktif sezon yok" description="Yeni sezon ayın ilk günü başlar. O zamana kadar genel sıralamaya göz atabilirsin." />
        </Card>
      );
    }
    if (loadingBoard) return <PodiumSkeleton />;
    if (first.error && leaders.length === 0) {
      return (
        <Card>
          <EmptyState
            icon={<TrophyIcon />}
            title="Sezon sıralaması yüklenemedi"
            description={first.error instanceof Error ? first.error.message : 'Beklenmeyen bir hata oluştu.'}
            action={
              <Button variant="secondary" size="sm" onClick={() => void first.mutate()}>
                Tekrar dene
              </Button>
            }
          />
        </Card>
      );
    }
    if (leaders.length === 0) {
      return (
        <Card>
          <EmptyState icon={<TrophyIcon />} title="Henüz sıralama yok" description="Sezona kaydolan doğrulanmış oyuncular burada görünecek." />
        </Card>
      );
    }
    return <Podium leaders={leaders} currentUsername={user.username} />;
  })();

  return (
    <div className="space-y-6">
      {loadingSeason ? <SeasonHeaderSkeleton /> : season ? <SeasonHeaderCard season={season} participants={participants} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {first.error && leaders.length > 0 && <Alert tone="error">Sezon tablosu güncellenemedi; son alınan sıralama gösteriliyor.</Alert>}

          {board}

          {(loadingBoard || rest.length > 0) && season && (
            <Card className="overflow-hidden">
              <CardHeader
                icon={<ListBulletIcon />}
                title="Sezon getirisi"
                description={loadingBoard ? 'Yükleniyor' : `${total > 0 ? `${total} oyuncu · ` : ''}sezona girişten bu yana`}
              />
              {loadingBoard ? (
                <RankListSkeleton />
              ) : (
                <>
                  <RankList leaders={rest} currentUsername={user.username} plLabel="Sezon K/Z" />
                  {slug &&
                    Array.from({ length: pages - 1 }, (_, i) => (
                      <SeasonPage key={i} slug={slug} offset={(i + 1) * PAGE} username={user.username} />
                    ))}
                  {pages * PAGE < total && (
                    <div className="border-t border-line p-3 text-center">
                      <Button variant="ghost" size="sm" onClick={() => setPages((p) => p + 1)}>
                        Daha fazla göster
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          )}

          <LeaguesPromo className="lg:hidden" />
          <PastSeasons />
        </div>

        <aside className="order-first lg:order-none">
          <div className="space-y-6 lg:sticky lg:top-24">
            <MySeasonCard me={current.data?.me ?? null} verified={user.email_verified} loading={loadingSeason} participants={participants} />
            <LeaguesPromo className="hidden lg:block" />
          </div>
        </aside>
      </div>
    </div>
  );
}

/** 51. sıradan itibaren her 50'lik parça ayrı bir SWR anahtarıyla yüklenir. */
function SeasonPage({ slug, offset, username }: { slug: string; offset: number; username: string }) {
  const { data, error, isLoading, mutate } = useSWR(leaderboardKey(slug, offset), ([, s, limit, off]) => seasonsApi.leaderboard(s, limit, off), {
    revalidateOnFocus: false,
  });
  const leaders = useMemo(() => toLeaders(data?.entries ?? []), [data]);

  return (
    <div className="border-t border-line">
      {isLoading && !data ? (
        <RankListSkeleton rows={4} />
      ) : error && !data ? (
        <div className="p-4">
          <Alert tone="error">
            Sonraki sıralar yüklenemedi.{' '}
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => void mutate()}>
              Tekrar dene
            </button>
          </Alert>
        </div>
      ) : (
        <RankList leaders={leaders} currentUsername={username} plLabel="Sezon K/Z" showHeader={false} />
      )}
    </div>
  );
}
