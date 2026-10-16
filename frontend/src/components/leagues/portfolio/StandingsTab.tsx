'use client';

import { Fragment, useState } from 'react';
import { ChevronDownIcon, ClockIcon, StarIcon, UsersIcon } from '@heroicons/react/20/solid';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta } from '@portfoygo/shared/ui/Delta';
import { Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { cn, formatUSD } from '@portfoygo/shared/format';
import { DataTable, TBody, THead, Td, Th } from '@/components/common/Table';
import { RankMedal } from '@/components/season/TitleBadge';
import { fmtDrawdown, fmtPlainPct } from '@/lib/portfolioLeagues';
import type { LeagueStatus } from '@/types';
import type { PortfolioLeagueStandings, StandingRow } from '@/types/portfolioLeague';
import StyleTags from './StyleTags';

interface Props {
  data: PortfolioLeagueStandings | undefined;
  loading: boolean;
  status: LeagueStatus;
  participation: 'solo' | 'team';
}

/** Sıralama: getiri, değer, en büyük düşüş, oynaklık, işlem, devir hızı. Takım satırları üyelere açılır. */
export default function StandingsTab({ data, loading, status, participation }: Props) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const rows = data?.rows ?? [];
  const upcoming = status === 'upcoming';
  const finished = status === 'finished';
  const team = participation === 'team';

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader
        title={finished ? 'Final sıralaması' : upcoming ? (team ? 'Takımlar' : 'Katılımcılar') : 'Canlı sıralama'}
        description={
          finished
            ? 'Sonuçlar donduruldu'
            : upcoming
              ? 'Sıralama lig başladığında oluşur'
              : 'Getiri · aynı sermaye ve işlem maliyetiyle · 30 sn’de bir yenilenir'
        }
      />
      {loading && !data ? (
        <div className="space-y-3 px-5 pb-5 sm:px-6" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          className="border-t border-line"
          icon={<UsersIcon />}
          title={team ? 'Henüz takım yok' : 'Henüz katılımcı yok'}
          description={team ? 'Takımını kur ve takım kodunu arkadaşlarınla paylaş.' : 'Davet kodunu paylaşarak arkadaşlarını çağır.'}
        />
      ) : (
        <DataTable label={finished ? 'Final sıralaması' : 'Portföy ligi sıralaması'} className="pb-2" tableClassName="min-w-[22rem]">
          <THead>
            <Th className="w-12">{upcoming ? <span className="sr-only">Sıra</span> : 'Sıra'}</Th>
            <Th>{team ? 'Takım' : 'Katılımcı'}</Th>
            {!upcoming && (
              <>
                <Th align="right">Getiri</Th>
                <Th align="right" className="hidden sm:table-cell">
                  Değer
                </Th>
                <Th align="right" className="hidden md:table-cell" title="Ölçüm dönemindeki tepeden dibe en büyük düşüş">
                  En büyük düşüş
                </Th>
                <Th align="right" className="hidden lg:table-cell" title="Yıllıklaştırılmış oynaklık">
                  Oynaklık
                </Th>
                <Th align="right" className="hidden md:table-cell">
                  İşlem
                </Th>
                <Th align="right" className="hidden xl:table-cell" title="İlk kurulum hariç işlem hacmi / 2 / başlangıç sermayesi">
                  Devir
                </Th>
              </>
            )}
          </THead>
          <TBody>
            {rows.map((r, i) => (
              <Fragment key={r.entry_id}>
                <Row row={r} index={i} upcoming={upcoming} finished={finished} expanded={open.has(r.entry_id)} onToggle={() => toggle(r.entry_id)} />
                {r.kind === 'team' && open.has(r.entry_id) && (
                  <tr className="bg-surface-2">
                    <td colSpan={upcoming ? 2 : 8} className="px-0 py-2">
                      <ul className="grid gap-1.5 pl-12 pr-2 text-sm sm:grid-cols-2">
                        {r.members.length === 0 && <li className="text-muted">Üye kalmadı</li>}
                        {r.members.map((m) => (
                          <li key={m.user_id} className="flex min-w-0 items-center gap-2">
                            <UserInitial name={m.username} size={22} />
                            <span className="truncate font-medium text-fg">{m.username}</span>
                            {m.is_captain && (
                              <span title="Kaptan" className="text-gold">
                                <StarIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="sr-only">Kaptan</span>
                              </span>
                            )}
                            {!upcoming && <span className="num ml-auto shrink-0 text-xs text-muted">{m.trades_count} işlem</span>}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </TBody>
        </DataTable>
      )}
      {!upcoming && rows.some((r) => r.late_join) && (
        <p className="flex items-center gap-1.5 border-t border-line px-5 py-3 text-xs text-muted sm:px-6">
          <ClockIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>“Geç katıldı”: aynı sermayeyle ama lig başladıktan sonra ölçülmeye başlayan katılımcı (geç katılım süresi içinde).</span>
        </p>
      )}
    </Card>
  );
}

function Row({
  row: r,
  index,
  upcoming,
  finished,
  expanded,
  onToggle,
}: {
  row: StandingRow;
  index: number;
  upcoming: boolean;
  finished: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isTeam = r.kind === 'team';
  return (
    <tr aria-current={r.is_me ? 'true' : undefined} className={cn('transition-colors', r.is_me ? 'bg-brand-soft' : 'hover:bg-surface-2')}>
      <Td>{upcoming || r.rank == null ? <span className="num text-sm text-subtle">{index + 1}.</span> : <RankMedal rank={r.rank} highlight={r.is_me} />}</Td>
      <Td className="max-w-0">
        <div className="flex min-w-0 items-center gap-2.5">
          <UserInitial name={r.label} size={32} tone={r.is_me ? 'brand' : finished && r.rank === 1 ? 'gold' : 'neutral'} className="max-sm:hidden" />
          <div className="min-w-0">
            <p className="flex min-w-0 flex-wrap items-center gap-1.5">
              {isTeam ? (
                <button
                  type="button"
                  onClick={onToggle}
                  aria-expanded={expanded}
                  className="inline-flex min-w-0 items-center gap-1 font-medium text-fg hover:text-brand"
                >
                  <span className="truncate">{r.label}</span>
                  <ChevronDownIcon className={cn('h-4 w-4 shrink-0 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
                  <span className="sr-only">{expanded ? 'üyeleri gizle' : 'üyeleri göster'}</span>
                </button>
              ) : (
                <span className="truncate font-medium text-fg">{r.label}</span>
              )}
              {r.is_me && <Badge tone="brand">{isTeam ? 'Takımın' : 'Sen'}</Badge>}
              {r.late_join && <Badge>Geç katıldı</Badge>}
              {r.stale && !finished && <Badge tone="gold">Fiyat gecikmeli</Badge>}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {isTeam && <span>{r.members.length} üye</span>}
              {!upcoming && r.equity_usd != null && <span className="num sm:hidden">{formatUSD(r.equity_usd)}</span>}
              {!upcoming && <span className="num md:hidden">DD {fmtDrawdown(r.max_drawdown_pct)} · {r.trades_count ?? 0} işlem</span>}
              {!upcoming && <StyleTags tags={r.style_tags} />}
            </div>
          </div>
        </div>
      </Td>
      {!upcoming && (
        <>
          <Td align="right">{r.return_pct != null ? <Delta value={r.return_pct} /> : <span className="text-subtle">—</span>}</Td>
          <Td align="right" className="num hidden whitespace-nowrap text-fg sm:table-cell">
            {r.equity_usd != null ? formatUSD(r.equity_usd) : '—'}
          </Td>
          <Td align="right" className={cn('num hidden whitespace-nowrap md:table-cell', r.max_drawdown_pct ? 'text-down' : 'text-muted')}>
            {fmtDrawdown(r.max_drawdown_pct)}
          </Td>
          <Td align="right" className="num hidden whitespace-nowrap text-muted lg:table-cell">
            {fmtPlainPct(r.volatility_ann)}
          </Td>
          <Td align="right" className="num hidden text-fg md:table-cell">
            {r.trades_count ?? '—'}
          </Td>
          <Td align="right" className="num hidden whitespace-nowrap text-muted xl:table-cell">
            {fmtPlainPct(r.turnover_pct, 0)}
          </Td>
        </>
      )}
    </tr>
  );
}
