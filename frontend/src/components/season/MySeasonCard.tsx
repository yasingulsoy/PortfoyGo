import { EnvelopeIcon, UserIcon } from '@heroicons/react/20/solid';
import { Card, CardBody, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta, Money } from '@portfoygo/shared/ui/Delta';
import { LinkButton } from '@portfoygo/shared/ui/Button';
import { Alert, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { formatDate, formatTRY } from '@portfoygo/shared/format';
import type { SeasonMe } from '@/types';

interface Props {
  me: SeasonMe | null;
  verified: boolean;
  loading?: boolean;
  participants: number;
}

/** "Senin sezonun": oturumdaki kullanıcının bu sezondaki sırası ve getirisi. */
export default function MySeasonCard({ me, verified, loading, participants }: Props) {
  return (
    <Card>
      <CardHeader icon={<UserIcon />} title="Senin sezonun" description={me?.joined_at ? `${formatDate(me.joined_at)} itibarıyla` : 'Bu sezon'} />
      <CardBody className="space-y-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : !me ? (
          !verified ? (
            <>
              <Alert tone="info">
                Sezona katılmak için e-posta adresini doğrulaman gerekiyor. Doğruladıktan sonra birkaç dakika içinde sezona otomatik olarak
                kaydolursun.
              </Alert>
              <LinkButton href="/verify-email" variant="primary" size="sm" className="w-full" icon={<EnvelopeIcon className="h-4 w-4" />}>
                E-postamı doğrula
              </LinkButton>
            </>
          ) : (
            <Alert tone="info">
              Sezon kaydın hazırlanıyor. Doğrulanmış hesaplar birkaç dakika içinde sezona otomatik olarak eklenir; bu sırada yaptığın işlemler de
              sayılır.
            </Alert>
          )
        ) : (
          <>
            <div>
              <p className="num text-4xl font-semibold tracking-tight">{me.rank ? `#${me.rank}` : '—'}</p>
              <p className="mt-1 text-sm text-muted">
                {me.rank ? `${participants > 0 ? `${participants} oyuncu arasında` : 'Sezon sıralamasında'}` : 'Sıralaman henüz hesaplanmadı.'}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line text-sm">
              <div className="bg-surface p-3">
                <dt className="text-xs text-muted">Sezon getirisi</dt>
                <dd className="mt-1">
                  <Delta value={me.return_pct} variant="text" />
                </dd>
              </div>
              <div className="bg-surface p-3">
                <dt className="text-xs text-muted">Sezon K/Z</dt>
                <dd className="mt-1 truncate font-medium">
                  <Money value={me.profit_tl} signed />
                </dd>
              </div>
              <div className="bg-surface p-3">
                <dt className="text-xs text-muted">Başlangıç</dt>
                <dd className="num mt-1 truncate font-medium">{formatTRY(me.baseline_equity)}</dd>
              </div>
              <div className="bg-surface p-3">
                <dt className="text-xs text-muted">Güncel varlık</dt>
                <dd className="num mt-1 truncate font-semibold">{formatTRY(me.equity)}</dd>
              </div>
            </dl>
          </>
        )}
      </CardBody>
    </Card>
  );
}
