'use client';

import { BoltIcon, ClockIcon, PlayIcon, TrophyIcon, WalletIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import { arenaDurationLabel } from '@/lib/labels';
import { Countdown, formatCash } from './parts';
import { formatTr, formatTrTime } from './time';

export interface PreviewData {
  title: string;
  description: string;
  sponsor: string;
  prize: string;
  /** epoch ms; geçersizse null */
  startsAt: number | null;
  durationS: number;
  instruments: { code: string; label: string }[];
  cash: number | null;
}

/** Oyuncu uygulamasındaki arena kartının sadeleştirilmiş önizlemesi. */
export default function ChallengePreview({ data }: { data: PreviewData }) {
  const { title, description, sponsor, prize, startsAt, durationS, instruments, cash } = data;
  return (
    <section aria-labelledby="arena-preview-title">
      <h2 id="arena-preview-title" className="mb-2 text-sm font-medium text-fg/80">
        Oyuncu görünümü
      </h2>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted">
            <BoltIcon className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            <span className="truncate">{sponsor ? `${sponsor} sunar` : 'PortfoyGo Arena'}</span>
          </span>
          {startsAt ? (
            <Countdown to={startsAt} prefix="Başlamasına" doneLabel="Başlamak üzere" className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-brand" />
          ) : (
            <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-xs text-subtle">Zaman seçilmedi</span>
          )}
        </div>

        <div className="space-y-4 p-4">
          <div>
            <p className={cn('break-words text-base font-semibold leading-snug', title ? 'text-fg' : 'text-subtle')}>{title || 'Meydan okuma başlığı'}</p>
            <p className={cn('mt-1 line-clamp-3 whitespace-pre-line break-words text-sm', description ? 'text-muted' : 'text-subtle')}>
              {description || 'Kısa bir açıklama oyunculara kuralları ve hedefi anlatır.'}
            </p>
          </div>

          {prize && (
            <div className="flex items-start gap-2.5 rounded-xl bg-gold-soft px-3 py-2.5 text-gold">
              <TrophyIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="min-w-0 break-words text-sm font-medium">{prize}</p>
            </div>
          )}

          <dl className="grid grid-cols-3 gap-2 text-center">
            <PreviewStat icon={ClockIcon} label="Süre" value={arenaDurationLabel(durationS)} />
            <PreviewStat icon={WalletIcon} label="Bakiye" value={cash ? formatCash(cash) : '—'} />
            <PreviewStat icon={PlayIcon} label="Başlangıç" value={startsAt ? formatTrTime(startsAt) : '—'} />
          </dl>

          <div>
            <p className="mb-1.5 text-xs font-medium text-subtle">İşlem yapılabilecekler</p>
            {instruments.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {instruments.map((i) => (
                  <li key={i.code} className="rounded-md bg-surface-3 px-2 py-1 text-xs font-medium text-fg/80">
                    {i.label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-subtle">En az 2 enstrüman seç.</p>
            )}
          </div>

          <span className="flex h-10 w-full items-center justify-center rounded-lg bg-brand text-sm font-medium text-brand-fg opacity-90" aria-hidden="true">
            Katıl
          </span>
        </div>
      </div>
      <p className="mt-3 text-xs text-subtle">
        {startsAt ? `Başlangıç: ${formatTr(startsAt)} (Türkiye saati).` : 'Başlangıç zamanı seçildiğinde geri sayım burada görünür.'} Kartın son hâli oyuncu uygulamasında biraz
        farklı olabilir.
      </p>
    </section>
  );
}

function PreviewStat({ icon: Icon, label, value }: { icon: typeof ClockIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line px-2 py-2">
      <dt className="flex items-center justify-center gap-1 text-[11px] text-subtle">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="num mt-0.5 truncate text-sm font-semibold text-fg">{value}</dd>
    </div>
  );
}
