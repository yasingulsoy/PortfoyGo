'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { CalendarDaysIcon, FlagIcon, PencilSquareIcon, StarIcon, UsersIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import { cn } from '@portfoygo/shared/format';
import { ToolbarButton } from '@/components/common/controls';
import { useNow } from '@/hooks/useNow';
import { countdownParts, formatLeagueDate, leagueProgress, type CountdownParts } from '@/lib/competition';
import type { League } from '@/types';
import { RoleBadge, StatusBadge, VisibilityBadge } from './shared';

interface Props {
  league: League;
  /** Kurucu için "Düzenle" */
  onEdit?: () => void;
  /** Üye olmayan için "Lige katıl" (herkese açık lig) */
  join?: { onJoin: () => void; pending: boolean; disabled: boolean; reason?: string };
  /** Geri sayım sıfırlandığında (durum değişimi için veriyi tazele) */
  onElapsed: () => void;
}

/** Lig başlık kartı: durum, canlı geri sayım, süre çubuğu ve temel bilgiler. */
export default function LeagueHero({ league, onEdit, join, onElapsed }: Props) {
  const { status } = league;
  const startedAt = league.started_at ?? league.starts_at ?? league.created_at;
  const target = status === 'upcoming' ? league.starts_at : status === 'active' ? league.ends_at : null;

  return (
    <Card className={cn('overflow-hidden', status === 'finished' && 'border-gold/30')}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={status} />
          <VisibilityBadge visibility={league.visibility} />
          {league.is_member && <RoleBadge role={league.role} />}
        </div>
        {onEdit && (
          <ToolbarButton onClick={onEdit} icon={<PencilSquareIcon className="h-4 w-4" aria-hidden="true" />}>
            Düzenle
          </ToolbarButton>
        )}
      </div>

      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-center">
        <div className="min-w-0">
          {status === 'finished' ? (
            <div>
              <p className="text-sm text-muted">Lig sona erdi</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                Bitiş: <span className="num">{formatLeagueDate(league.finalized_at ?? league.ends_at)}</span>
              </p>
              <p className="mt-1.5 text-sm text-muted">Sonuçlar donduruldu; sıralama artık değişmez.</p>
            </div>
          ) : target ? (
            <Countdown target={target} label={status === 'upcoming' ? 'Başlamasına kalan' : 'Bitmesine kalan'} onElapsed={onElapsed} />
          ) : (
            <div>
              <p className="text-sm text-muted">{status === 'upcoming' ? 'Başlangıç' : 'Süre'}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{status === 'upcoming' ? 'Yakında' : 'Süresiz lig'}</p>
              <p className="mt-1.5 text-sm text-muted">{status === 'active' ? 'Kurucu silene kadar sürer.' : 'Kurucu başlangıç zamanını belirleyecek.'}</p>
            </div>
          )}

          {status !== 'upcoming' && <ProgressBar startedAt={startedAt} endsAt={league.ends_at} finished={status === 'finished'} />}
          {status === 'upcoming' && (
            <p className="mt-4 text-sm text-muted">
              Başlamadan önce katılan herkes başlangıç anındaki varlığından ölçülür; erken katılmanın avantajı ya da dezavantajı yoktur.
            </p>
          )}

          {join && (
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button onClick={join.onJoin} loading={join.pending} disabled={join.disabled} className="sm:w-auto">
                Lige katıl
              </Button>
              {join.reason && <p className="text-xs text-muted">{join.reason}</p>}
            </div>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <Meta icon={<StarIcon />} label="Kurucu">
            <span className="truncate">{league.owner_username}</span>
          </Meta>
          <Meta icon={<UsersIcon />} label="Oyuncu">
            <span className="num">
              {league.member_count}/{league.max_members}
            </span>
          </Meta>
          <Meta icon={<CalendarDaysIcon />} label="Başlangıç">
            <span className="num truncate">{formatLeagueDate(status === 'upcoming' ? league.starts_at : startedAt)}</span>
          </Meta>
          <Meta icon={<FlagIcon />} label="Bitiş">
            <span className="num truncate">{league.ends_at ? formatLeagueDate(league.ends_at) : 'Süresiz'}</span>
          </Meta>
        </dl>
      </div>
    </Card>
  );
}

const unitLabels = { days: 'gün', hours: 'saat', minutes: 'dk', seconds: 'sn' } as const;

function countdownText(p: CountdownParts) {
  const parts = p.days > 0 ? [`${p.days} gün`, `${p.hours} saat`, `${p.minutes} dakika`] : [`${p.hours} saat`, `${p.minutes} dakika`, `${p.seconds} saniye`];
  return parts.join(' ');
}

/** Saniyede bir işleyen geri sayım; 1 günden uzunsa gün/saat/dk, kısaysa saat/dk/sn gösterir. */
function Countdown({ target, label, onElapsed }: { target: string; label: string; onElapsed: () => void }) {
  const now = useNow(1000);
  const parts = countdownParts(target, now);
  const elapsed = parts?.totalMs === 0;
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    if (elapsed && firedFor.current !== target) {
      firedFor.current = target;
      onElapsed();
    }
  }, [elapsed, target, onElapsed]);

  if (!parts) return null;
  const units: (keyof typeof unitLabels)[] = parts.days > 0 ? ['days', 'hours', 'minutes'] : ['hours', 'minutes', 'seconds'];
  const urgent = parts.days === 0 && parts.hours === 0;

  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      {elapsed ? (
        <p className="mt-1 text-2xl font-semibold text-fg">{label.startsWith('Başla') ? 'Başlıyor…' : 'Sonuçlanıyor…'}</p>
      ) : (
        <div role="timer" aria-label={`${label}: ${countdownText(parts)}`} className="mt-2 flex items-stretch gap-2 sm:gap-3">
          {units.map((u, i) => (
            <div key={u} className="flex items-stretch gap-2 sm:gap-3" aria-hidden="true">
              {i > 0 && <span className="self-center pb-4 text-xl font-semibold text-subtle">:</span>}
              <div
                className={cn(
                  'flex min-w-[4.25rem] flex-col items-center rounded-xl border px-2 py-2.5 sm:min-w-[5rem]',
                  urgent ? 'border-down/30 bg-down-soft' : 'border-line bg-surface-2',
                )}
              >
                <span className={cn('num text-3xl font-bold tabular-nums leading-none tracking-tight sm:text-4xl', urgent ? 'text-down' : 'text-fg')}>
                  {String(parts[u]).padStart(2, '0')}
                </span>
                <span className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">{unitLabels[u]}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ startedAt, endsAt, finished }: { startedAt: string | null; endsAt: string | null; finished: boolean }) {
  const now = useNow(60_000);
  const ratio = finished ? 1 : leagueProgress(startedAt, endsAt, now);
  if (ratio == null) return null;
  const pct = Math.round(ratio * 100);
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>Lig süresi</span>
        <span className="num font-medium text-fg">%{pct}</span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-label="Lig süresinin geçen kısmı"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className={cn('h-full rounded-full transition-[width] duration-700', finished ? 'bg-gold' : 'bg-brand')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Meta({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-line bg-surface-2 p-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-muted [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="mt-0.5 flex min-w-0 text-sm font-semibold text-fg">{children}</dd>
      </div>
    </div>
  );
}
