'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { FlagIcon } from '@heroicons/react/20/solid';
import Button from '@portfoygo/shared/ui/Button';
import { Alert, Badge, Skeleton } from '@portfoygo/shared/ui/Feedback';
import Modal from '@portfoygo/shared/ui/Modal';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { cn, formatDateTime, formatUSD } from '@portfoygo/shared/format';
import { adminApi, adminKeys, swrFetcher } from '@/lib/api';
import type { AdminLeagueDetail } from '@/lib/types';
import { ConfirmModal } from './controls';

const STATUS: Record<AdminLeagueDetail['status'], { label: string; tone: 'brand' | 'up' | 'neutral' }> = {
  upcoming: { label: 'Başlamadı', tone: 'brand' },
  active: { label: 'Sürüyor', tone: 'up' },
  finished: { label: 'Bitti', tone: 'neutral' },
};

const pct = (v: number | string | null | undefined, digits = 2) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const r = Math.round(n * 10 ** digits) / 10 ** digits || 0;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}%${Math.abs(r).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};
const bps = (n: number) => `%${(n / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Lig detayı: mod, kurallar, katılımcılar / takımlar; devam eden portföy ligini erken bitirme. */
export default function LeagueDetailModal({ leagueId, onClose, onChanged }: { leagueId: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { data, error, isLoading, mutate } = useSWR<AdminLeagueDetail>(adminKeys.leagueDetail(leagueId), swrFetcher, { revalidateOnFocus: false });
  const [confirm, setConfirm] = useState(false);
  const portfolio = data?.mode === 'portfolio';

  return (
    <>
      <Modal open onClose={onClose} title={data?.name ?? 'Lig'} description={data ? `${portfolio ? 'Portföy ligi' : 'Ana lig'} · kurucu ${data.owner_username ?? '—'}` : undefined}>
        {isLoading && !data ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error && !data ? (
          <Alert tone="error">Lig detayı yüklenemedi.</Alert>
        ) : data ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={STATUS[data.status].tone}>{STATUS[data.status].label}</Badge>
              <Badge tone={portfolio ? 'brand' : 'neutral'}>{portfolio ? 'Portföy ligi' : 'Ana lig'}</Badge>
              <Badge>{data.visibility === 'public' ? 'Herkese açık' : 'Özel'}</Badge>
            </div>

            {data.rules && (
              <dl className="num grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <Item label="Sermaye" value={formatUSD(data.rules.starting_capital_usd)} />
                <Item label="İşlem maliyeti" value={bps(data.rules.commission_bps)} />
                <Item
                  label="Katılım"
                  value={data.rules.participation === 'team' ? `Takım (${data.rules.team_size} kişi × ${data.rules.max_teams})` : 'Bireysel'}
                />
                <Item label="Başlangıç" value={formatDateTime(data.rules.starts_at)} />
                <Item label="Bitiş" value={formatDateTime(data.rules.ends_at)} />
                <Item label="Geç katılım" value={formatDateTime(data.rules.late_join_until)} />
              </dl>
            )}

            {portfolio ? (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[30rem] text-sm">
                  <caption className="sr-only">Katılımcılar</caption>
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th scope="col" className="px-3 py-2 font-medium">Sıra</th>
                      <th scope="col" className="px-3 py-2 font-medium">{data.rules?.participation === 'team' ? 'Takım / üyeler' : 'Katılımcı'}</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Getiri</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Değer</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.entries.map((e) => (
                      <tr key={e.entry_id} className={cn(e.withdrawn && 'opacity-60')}>
                        <td className="num px-3 py-2 text-muted">{e.rank ?? '—'}</td>
                        <td className="px-3 py-2">
                          <p className="flex flex-wrap items-center gap-1.5 font-medium text-fg">
                            {e.label}
                            {e.late_join && <Badge>Geç</Badge>}
                            {e.withdrawn && <Badge tone="down">Ayrıldı</Badge>}
                            {!e.has_portfolio && <Badge>Portföy yok</Badge>}
                            {e.has_strategy && <Badge tone="brand">Strateji</Badge>}
                          </p>
                          {e.members.length > 0 && <p className="text-xs text-muted">{e.members.join(', ')}</p>}
                        </td>
                        <td className={cn('num px-3 py-2 text-right', (e.return_pct ?? 0) > 0 ? 'text-up' : (e.return_pct ?? 0) < 0 ? 'text-down' : 'text-muted')}>
                          {pct(e.return_pct)}
                        </td>
                        <td className="num px-3 py-2 text-right text-fg">{e.equity_usd != null ? formatUSD(e.equity_usd) : '—'}</td>
                        <td className="num px-3 py-2 text-right text-muted">{e.trades_count ?? '—'}</td>
                      </tr>
                    ))}
                    {data.entries.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-3 text-muted">
                          Henüz katılımcı yok.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line text-sm">
                {data.members.map((m) => (
                  <li key={m.user_id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="truncate font-medium text-fg">{m.username}</span>
                    <span className="num shrink-0 text-xs text-muted">
                      {m.role === 'owner' ? 'Kurucu · ' : ''}
                      {m.final_rank ? `#${m.final_rank} · ${pct(m.final_return_pct ?? null)}` : formatDateTime(m.joined_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">Üye sayısı: {data.members.length}</p>

            {portfolio && data.status === 'active' && (
              <div className="flex flex-col gap-2 rounded-xl border border-gold/30 bg-gold-soft p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-fg">Ligi şimdi bitirirsen bitiş tarihi bugüne çekilir, portföyler dondurulur ve sonuçlar yazılır.</p>
                <Button size="sm" variant="secondary" icon={<FlagIcon className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => setConfirm(true)}>
                  Şimdi bitir
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Portföy ligini şimdi bitir"
        description={data?.name}
        confirmLabel="Ligi bitir"
        tone="danger"
        reason={{ label: 'Gerekçe', placeholder: 'Denetim kaydına yazılır' }}
        onConfirm={async (reason) => {
          await adminApi.finalizePortfolioLeague(leagueId, reason || undefined);
          toast.success('Lig bitirildi');
          setConfirm(false);
          await mutate();
          onChanged();
        }}
      >
        <p>Bu işlem geri alınamaz; katılımcılara sıra bildirimi gider.</p>
      </ConfirmModal>
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface-2 px-3 py-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-fg">{value}</dd>
    </div>
  );
}
