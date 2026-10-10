'use client';

import { useState } from 'react';
import { BoltIcon, PlayIcon } from '@heroicons/react/20/solid';
import { cn, formatUSD } from '@portfoygo/shared/format';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Alert, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { useActiveArenaRound, useArenaInstruments } from '@/hooks/useArena';
import { useArenaStart } from '@/hooks/useArenaStart';
import { useNow } from '@/hooks/useNow';
import { ARENA_DURATIONS, MAX_ROUND_INSTRUMENTS, durationLabel, formatClock, formatCountdown, type ArenaDuration } from './model';

const chip = (active: boolean) =>
  cn(
    'inline-flex h-11 items-center justify-center rounded-xl border px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
    active ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-fg hover:border-line-strong hover:bg-surface-2',
  );

/** "Hızlı tur" başlatma kartı: süre ve enstrüman seçimi; devam eden tur varsa "Devam et". */
export default function QuickRoundCard({ className }: { className?: string }) {
  const instruments = useArenaInstruments();
  const active = useActiveArenaRound();
  const { start, starting, limit } = useArenaStart();
  const now = useNow(1000);
  const [duration, setDuration] = useState<ArenaDuration>(60);
  // null = kullanılabilir tüm enstrümanlar
  const [picked, setPicked] = useState<string[] | null>(null);

  const list = instruments.data ?? [];
  // Varsayılan: kullanılabilir ilk 4 enstrüman (bir turda en fazla 4)
  const available = list.filter((i) => i.available).map((i) => i.code).slice(0, MAX_ROUND_INSTRUMENTS);
  const allAvailable = list.filter((i) => i.available).map((i) => i.code);
  const chosen = picked ? picked.filter((c) => allAvailable.includes(c)) : available;
  const full = chosen.length >= MAX_ROUND_INSTRUMENTS;
  const toggle = (code: string) => {
    const next = chosen.includes(code) ? chosen.filter((c) => c !== code) : full ? chosen : [...chosen, code];
    setPicked(next);
  };

  // Süresi dolmuş tur (önbellekteki eski "aktif" kayıt) devam ettirilemez
  const activeEnd = active.data ? Date.parse(active.data.round.ends_at) : 0;
  const running = active.data && active.data.round.status !== 'finished' && activeEnd > now ? active.data : null;
  const remaining = running ? activeEnd - now : 0;
  const limitWait = limit?.retryAt ? limit.retryAt - now : 0;
  const blocked = !!limit && (limit.retryAt == null || limitWait > 0);

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title="Hızlı tur" description="Süreni seç, başlat, tek dokunuşla al-sat." icon={<BoltIcon />} />
      <div className="flex flex-1 flex-col gap-5 px-5 pb-5 sm:px-6 sm:pb-6">
        {running ? (
          <div className="rounded-2xl border border-brand/40 bg-brand-soft p-4">
            <p className="text-sm font-semibold text-fg">Devam eden bir turun var</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span>
                Kalan <span className="num font-semibold text-fg">{formatClock(Math.max(0, remaining))}</span>
              </span>
              <span className="num">{formatUSD(running.me.equity)}</span>
              <Delta value={running.me.return_pct} />
            </div>
            <LinkButton href={`/arena/round/${encodeURIComponent(running.round.id)}`} size="lg" className="mt-4 w-full" icon={<PlayIcon className="h-5 w-5" aria-hidden="true" />}>
              Devam et
            </LinkButton>
          </div>
        ) : (
          <>
            <div>
              <p id="arena-duration" className="mb-2 text-sm font-medium text-fg">
                Süre
              </p>
              <div role="group" aria-labelledby="arena-duration" className="grid grid-cols-4 gap-2">
                {ARENA_DURATIONS.map((d) => (
                  <button key={d} type="button" aria-pressed={duration === d} onClick={() => setDuration(d)} className={chip(duration === d)}>
                    {durationLabel(d)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p id="arena-instruments" className="mb-2 flex items-baseline justify-between gap-2 text-sm font-medium text-fg">
                Enstrümanlar
                <span className="text-xs font-normal text-subtle">en fazla {MAX_ROUND_INSTRUMENTS}</span>
              </p>
              {instruments.isLoading ? (
                <div className="grid grid-cols-2 gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-11 rounded-xl" />
                  ))}
                </div>
              ) : instruments.error ? (
                <p className="text-sm text-muted">Enstrüman listesi alınamadı; tur varsayılan enstrümanlarla başlar.</p>
              ) : (
                <div role="group" aria-labelledby="arena-instruments" className="grid grid-cols-2 gap-2">
                  {list.map((i) => {
                    const on = chosen.includes(i.code);
                    return (
                      <button
                        key={i.code}
                        type="button"
                        aria-pressed={on}
                        disabled={!i.available || (!on && full)}
                        onClick={() => toggle(i.code)}
                        className={cn(chip(on), 'h-auto min-h-11 flex-col items-start gap-0 px-3.5 py-1.5 text-left')}
                        title={i.available ? `Makas ${i.spread_display}` : 'Şu an kullanılamıyor'}
                      >
                        <span className="max-w-full truncate">{i.label}</span>
                        <span className={cn('max-w-full truncate text-[11px] font-normal', on ? 'text-brand' : 'text-subtle')}>
                          {i.available ? (i.spread_display ? `Makas ${i.spread_display}` : 'Açık') : 'Şu an kapalı'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {limit && (
              <Alert tone="info">
                {limit.message}
                {limitWait > 0 && (
                  <span className="num mt-1 block font-medium">Yeni tur için: {formatCountdown(limitWait)}</span>
                )}
              </Alert>
            )}

            <div className="mt-auto">
              <Button
                size="lg"
                className="h-14 w-full text-base"
                loading={starting}
                disabled={blocked || (!!instruments.data && chosen.length === 0)}
                onClick={() => void start(duration, picked ? chosen : undefined)}
                icon={<PlayIcon className="h-5 w-5" aria-hidden="true" />}
              >
                Turu başlat
              </Button>
              <p className="mt-2 text-center text-xs text-subtle">
                {durationLabel(duration)} · $10.000 sanal bakiye · {chosen.length || 'tüm'} enstrüman
              </p>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
