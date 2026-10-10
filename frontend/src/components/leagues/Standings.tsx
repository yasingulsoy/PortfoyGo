'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { StarIcon, UserMinusIcon } from '@heroicons/react/20/solid';
import { Delta, Money } from '@portfoygo/shared/ui/Delta';
import { Badge, Skeleton } from '@portfoygo/shared/ui/Feedback';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { cn, formatDate } from '@portfoygo/shared/format';
import { DataTable, TBody, THead, Td, Th } from '@/components/common/Table';
import { RankMedal } from '@/components/season/TitleBadge';
import { rankDeltas } from '@/lib/competition';
import type { LeagueMember, LeagueStatus } from '@/types';

interface Props {
  members: LeagueMember[];
  /** upcoming: sırasız oyuncu listesi · active: canlı sıralama · finished: dondurulmuş final tablosu */
  status: LeagueStatus;
  /** Kurucu ise her üyenin yanında çıkarma düğmesi gösterilir. */
  canRemove: boolean;
  onRemove: (member: LeagueMember) => void;
}

const rankMap = (members: LeagueMember[]) => new Map(members.filter((m) => m.rank != null).map((m) => [m.user_id, m.rank as number]));

/**
 * SWR yenilemeleri arasında sıra değişimlerini izler (user_id anahtarlı). Sıralama imzası
 * değiştiğinde farklar render sırasında hesaplanır (efekt içinde setState yok); değişim yoksa
 * önceki oklar korunur. `version` her yeni değişimde artar ve vurgu animasyonunu tetikler.
 */
function useRankChanges(members: LeagueMember[]) {
  const signature = members.map((m) => `${m.user_id}:${m.rank ?? ''}`).join('|');
  const [state, setState] = useState(() => ({ signature, ranks: rankMap(members), deltas: {} as Record<string, number>, version: 0 }));
  if (state.signature !== signature) {
    const deltas = rankDeltas(state.ranks, members);
    const changed = Object.keys(deltas).length > 0;
    setState({ signature, ranks: rankMap(members), deltas: changed ? deltas : state.deltas, version: changed ? state.version + 1 : state.version });
  }
  return state;
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * FLIP: satırların önceki konumunu saklar, yeniden sıralamadan sonra eski konumdan yeni
 * konuma kaydırır; sırası değişen satırı kısa süre renkle vurgular. Azaltılmış harekette kapalı.
 */
function useFlipRows(signature: string, deltas: Record<string, number>, version: number) {
  const rows = useRef(new Map<string, HTMLTableRowElement>());
  const tops = useRef(new Map<string, number>());
  const flashedVersion = useRef(version);

  useLayoutEffect(() => {
    const reduce = prefersReducedMotion();
    const flash = flashedVersion.current !== version;
    flashedVersion.current = version;
    const next = new Map<string, number>();
    rows.current.forEach((el, id) => {
      const top = el.offsetTop;
      next.set(id, top);
      if (reduce || typeof el.animate !== 'function') return;
      const before = tops.current.get(id);
      if (before != null && before !== top) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }], {
          duration: 650,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        });
      }
      const d = deltas[id];
      if (flash && d) {
        const styles = getComputedStyle(el);
        const color = styles.getPropertyValue(d > 0 ? '--up-soft' : '--down-soft').trim();
        if (color) el.animate([{ backgroundColor: color }, { backgroundColor: styles.backgroundColor }], { duration: 1600, easing: 'ease-out' });
      }
    });
    tops.current = next;
    // deltas, version ile birlikte değişir; imza değişimi yeterli tetikleyicidir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, version]);

  return (id: string) => (el: HTMLTableRowElement | null) => {
    if (el) rows.current.set(id, el);
    else rows.current.delete(id);
  };
}

function RankChange({ delta, version }: { delta: number | undefined; version: number }) {
  if (!delta) return null;
  const up = delta > 0;
  return (
    <span
      key={version}
      className={cn('num animate-enter inline-flex items-center text-[11px] font-semibold leading-none', up ? 'text-up' : 'text-down')}
      title="Son güncellemeden bu yana"
    >
      <span aria-hidden="true">
        {up ? '▲' : '▼'}
        {Math.abs(delta)}
      </span>
      <span className="sr-only">{up ? `${delta} sıra yükseldi` : `${Math.abs(delta)} sıra düştü`}</span>
    </span>
  );
}

/** Lig sıralaması: TailAdmin tablo düzeni; dar ekranda K/Z ve katılım sütunları alt satıra iner. */
export default function Standings({ members, status, canRemove, onRemove }: Props) {
  const { deltas, version, signature } = useRankChanges(members);
  const rowRef = useFlipRows(signature, status === 'active' ? deltas : {}, version);
  const upcoming = status === 'upcoming';
  const finished = status === 'finished';
  const showRemove = canRemove && !finished;

  return (
    <DataTable label={upcoming ? 'Lig oyuncuları' : finished ? 'Final sıralaması' : 'Lig sıralaması'} className="pb-2" tableClassName="table-fixed">
      <THead>
        <Th className="w-12 md:w-16">{upcoming ? <span className="sr-only">Sıra</span> : finished ? 'Final' : 'Sıra'}</Th>
        <Th>Oyuncu</Th>
        {!upcoming && (
          <Th align="right" className="w-28">
            {finished ? 'Final getiri' : 'Getiri'}
          </Th>
        )}
        {status === 'active' && (
          <Th align="right" className="hidden w-36 md:table-cell">
            K/Z
          </Th>
        )}
        <Th align="right" className={cn('w-32', !upcoming && 'hidden lg:table-cell')}>
          Katılım
        </Th>
        {showRemove && (
          <Th align="right" className="w-12 md:w-14">
            <span className="sr-only">İşlem</span>
          </Th>
        )}
      </THead>
      <TBody>
        {members.map((m, i) => (
          <tr
            key={m.user_id || m.username}
            ref={rowRef(m.user_id || m.username)}
            aria-current={m.is_me ? 'true' : undefined}
            className={cn('transition-colors', m.is_me ? 'bg-brand-soft' : 'hover:bg-surface-2')}
          >
            <Td>
              {upcoming || m.rank == null ? (
                <span className="num text-sm text-subtle">{i + 1}.</span>
              ) : (
                <div className="flex flex-col items-start gap-1">
                  <RankMedal rank={m.rank} highlight={m.is_me} />
                  {status === 'active' && <RankChange delta={deltas[m.user_id]} version={version} />}
                </div>
              )}
            </Td>
            <Td>
              <div className="flex min-w-0 items-center gap-3">
                <UserInitial
                  name={m.username}
                  size={36}
                  tone={m.is_me ? 'brand' : finished && m.rank === 1 ? 'gold' : 'neutral'}
                  className="max-sm:hidden"
                />
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-[2.5rem] truncate font-medium text-fg">{m.username}</span>
                    {m.is_me && (
                      <Badge tone="brand" className="shrink-0">
                        Sen
                      </Badge>
                    )}
                    {m.role === 'owner' && (
                      <>
                        <span className="shrink-0 text-gold md:hidden" title="Kurucu">
                          <StarIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="sr-only">Kurucu</span>
                        </span>
                        <Badge tone="gold" className="shrink-0 max-md:hidden">
                          Kurucu
                        </Badge>
                      </>
                    )}
                  </p>
                  {!upcoming && m.joined_at && <p className="truncate text-xs text-muted lg:hidden">{formatDate(m.joined_at)} katıldı</p>}
                  {upcoming && <p className="truncate text-xs text-muted">Başlangıç bekleniyor</p>}
                </div>
              </div>
            </Td>
            {!upcoming && (
              <Td align="right">
                <span className="sr-only">{finished ? 'Final getiri ' : 'Getiri '}</span>
                {m.return_pct != null ? <Delta value={m.return_pct} /> : <span className="text-subtle">—</span>}
                {status === 'active' && m.profit_tl != null && (
                  <p className="mt-1 text-xs md:hidden">
                    <Money value={m.profit_tl} signed />
                  </p>
                )}
              </Td>
            )}
            {status === 'active' && (
              <Td align="right" className="hidden whitespace-nowrap md:table-cell">
                {m.profit_tl != null ? <Money value={m.profit_tl} signed /> : <span className="text-subtle">—</span>}
              </Td>
            )}
            <Td align="right" className={cn('whitespace-nowrap text-muted', !upcoming && 'hidden lg:table-cell')}>
              {m.joined_at ? formatDate(m.joined_at) : '—'}
            </Td>
            {showRemove && (
              <Td align="right">
                {m.role === 'owner' || m.is_me ? null : (
                  <button
                    type="button"
                    onClick={() => onRemove(m)}
                    aria-label={`${m.username} adlı oyuncuyu ligden çıkar`}
                    title="Ligden çıkar"
                    className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-down-soft hover:text-down"
                  >
                    <UserMinusIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </Td>
            )}
          </tr>
        ))}
      </TBody>
    </DataTable>
  );
}

export function StandingsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line px-5 sm:px-6" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3.5">
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
