'use client';

import useSWR from 'swr';
import { EnvelopeIcon, UserIcon } from '@heroicons/react/20/solid';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Delta } from '@/components/ui/Delta';
import { LinkButton } from '@/components/ui/Button';
import { Alert, Skeleton } from '@/components/ui/Feedback';
import { useLivePortfolio } from '@/context/PortfolioContext';
import { leaderboardApi } from '@/lib/api';
import { STARTING_BALANCE } from '@/lib/constants';
import { formatPercent, formatTRY } from '@/lib/format';
import { normalizeMyRank, type Board, type Leader } from './model';

export const MY_RANK_KEY = 'leaderboard:my-rank';

interface Props {
  board: Board;
  verified: boolean;
  leaders: Leader[];
  username: string;
}

/** Oturumdaki kullanıcının sırası ve ilk 50'deki konumu. */
export default function MyRankCard({ board, verified, leaders, username }: Props) {
  const { data, error, isLoading } = useSWR(verified ? MY_RANK_KEY : null, () => leaderboardApi.myRank(), { refreshInterval: 60_000 });
  const { totals, loaded } = useLivePortfolio();

  const ranks = normalizeMyRank(data);
  const rank = board === 'week' ? ranks.rankWeek : ranks.rank;
  const myIndex = leaders.findIndex((l) => l.username === username);
  const me = myIndex >= 0 ? leaders[myIndex] : undefined;
  const above = myIndex > 0 ? leaders[myIndex - 1] : undefined;
  const growth = ((totals.netWorth - STARTING_BALANCE) / STARTING_BALANCE) * 100;

  return (
    <Card>
      <CardHeader icon={<UserIcon />} title="Senin sıran" description={board === 'week' ? 'Bu hafta' : 'Tüm zamanlar'} />
      <CardBody className="space-y-4">
        {!verified ? (
          <>
            <Alert tone="info">
              Liderlik tablosunda yer almak için e-posta adresini doğrulaman gerekiyor. Doğrulanmamış hesaplar sıralamaya dahil edilmez.
            </Alert>
            <LinkButton href="/verify-email" variant="primary" size="sm" className="w-full" icon={<EnvelopeIcon className="h-4 w-4" />}>
              E-postamı doğrula
            </LinkButton>
          </>
        ) : isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : error ? (
          <Alert tone="error">Sıran şu an alınamadı. Birazdan tekrar denenecek.</Alert>
        ) : (
          <div>
            <p className="num text-4xl font-semibold tracking-tight">{rank ? `#${rank}` : '—'}</p>
            <p className="mt-1 text-sm text-muted">
              {!rank
                ? 'Sıralaman henüz hesaplanmadı.'
                : me
                  ? 'İlk 50 içindesin.'
                  : rank > 50
                    ? 'İlk 50’ye girmek için getirini artırmaya devam et.'
                    : 'Tablo güncellendiğinde burada görünecek.'}
            </p>
            {(ranks.rank || ranks.rankWeek) && (
              <p className="num mt-1 text-xs text-subtle">
                Tüm zamanlar {ranks.rank ? `#${ranks.rank}` : '—'} · Bu hafta {ranks.rankWeek ? `#${ranks.rankWeek}` : '—'}
              </p>
            )}
          </div>
        )}

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line text-sm">
          <div className="bg-surface p-3">
            <dt className="text-xs text-muted">Toplam varlık</dt>
            <dd className="num mt-1 truncate font-semibold">{loaded ? formatTRY(me?.totalValue ?? totals.netWorth) : '—'}</dd>
          </div>
          <div className="bg-surface p-3">
            <dt className="text-xs text-muted">{board === 'week' ? 'Hafta getirisi' : 'Getiri'}</dt>
            <dd className="mt-1">
              {me ? (
                <Delta value={me.plPercent} variant="text" />
              ) : board === 'alltime' && loaded ? (
                <Delta value={growth} variant="text" />
              ) : (
                <span className="text-subtle">—</span>
              )}
            </dd>
          </div>
        </dl>

        {me && above && (
          <p className="text-xs text-muted">
            Bir üst sıradaki <span className="font-medium text-fg">{above.username}</span> ile arandaki fark{' '}
            <span className="num font-medium text-fg">{formatPercent(above.plPercent - me.plPercent, { sign: false })}</span>.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
