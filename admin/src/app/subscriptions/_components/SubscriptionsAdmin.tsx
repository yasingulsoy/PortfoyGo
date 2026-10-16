'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { ClockIcon, GiftIcon, SparklesIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import Modal from '@portfoygo/shared/ui/Modal';
import { Alert, Badge, EmptyState } from '@portfoygo/shared/ui/Feedback';
import { cn, formatNumber } from '@portfoygo/shared/format';
import { MetricCard, TableCardHeader, TableSkeleton, table } from '@/components/ui';
import { LoadError, Pagination, SearchInput, SelectField, StaleNotice } from '@/components/controls';
import { adminKeys, swrFetcher } from '@/lib/api';
import { toPaged, useDebouncedValue } from '@/lib/hooks';
import SubscriptionActionModal, { type SubAction } from './SubscriptionActionModal';
import { PAGE, SOURCE_LABEL, STATUS_META, STATUS_OPTIONS, daysLeft, shortDate, usePlans, useSubscriptions, type SubStatusFilter } from './data';

/** Abonelikler: özet, liste (filtre + arama), Premium tanımla / uzat / iptal ve plan özellikleri. */
export default function SubscriptionsAdmin() {
  const params = useSearchParams();
  const initial = params.get('search') ?? '';
  const [status, setStatus] = useState<SubStatusFilter>(initial ? 'all' : 'current');
  const [search, setSearch] = useState(initial);
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState<SubAction | null>(null);
  const [picker, setPicker] = useState(false);
  const q = useDebouncedValue(search.trim());
  const list = useSubscriptions({ status, search: q || undefined, offset });
  const s = list.summary;

  return (
    <div className="space-y-6">
      <Alert tone="info">
        Ödeme altyapısı yok: Premium yalnızca kullanıcının tek seferlik 14 günlük denemesi veya buradan yapılan tanımla açılır. Her tanım / uzatma /
        iptal not ister ve denetim kaydına yazılır.
      </Alert>

      <section aria-label="Abonelik özeti" className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
        <MetricCard icon={SparklesIcon} label="Geçerli Premium" value={s ? formatNumber(s.current_premium, 0) : '—'} loading={list.loading} hint="Yönetici / ödeme" />
        <MetricCard icon={GiftIcon} label="Süren denemeler" value={s ? formatNumber(s.current_trials, 0) : '—'} loading={list.loading} />
        <MetricCard icon={ClockIcon} label="7 gün içinde bitecek" value={s ? formatNumber(s.expiring_7d, 0) : '—'} loading={list.loading} hint="Deneme + Premium" />
        <MetricCard icon={CheckIcon} label="Kullanılan deneme hakkı" value={s ? formatNumber(s.trials_used, 0) : '—'} loading={list.loading} hint="Kullanıcı başına bir kez" />
      </section>

      <Card className="min-w-0 overflow-hidden">
        <TableCardHeader
          title="Abonelikler"
          description={list.loading ? 'Yükleniyor' : `${formatNumber(list.total, 0)} kayıt · en yeni önce`}
          actions={
            <Button onClick={() => setPicker(true)} icon={<UserPlusIcon className="h-4 w-4" aria-hidden="true" />}>
              Premium tanımla
            </Button>
          }
        />
        <div className="flex flex-col gap-3 px-5 pb-4 sm:flex-row sm:items-end sm:px-6">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setOffset(0);
            }}
            placeholder="Kullanıcı adı veya e-posta"
            label="Abonelik ara"
          />
          <SelectField
            label="Durum"
            hideLabel
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as SubStatusFilter);
              setOffset(0);
            }}
            options={STATUS_OPTIONS}
            className="w-full sm:w-64"
          />
        </div>
        <StaleNotice show={!!list.error && list.items.length > 0} />
        {list.loading ? (
          <TableSkeleton rows={5} />
        ) : list.error && list.items.length === 0 ? (
          <LoadError error={list.error} title="Abonelikler yüklenemedi" onRetry={() => void list.mutate()} />
        ) : list.items.length === 0 ? (
          <EmptyState className="border-t border-line" icon={<SparklesIcon />} title="Kayıt yok" description="Bu filtreye uyan abonelik bulunmuyor." />
        ) : (
          <div className={cn(table.wrap, 'transition-opacity', list.isValidating && 'opacity-70')} aria-busy={list.isValidating}>
            <table className={table.table}>
              <caption className="sr-only">Abonelik kayıtları</caption>
              <thead>
                <tr className={table.headRow}>
                  <th scope="col" className={table.th}>
                    Kullanıcı
                  </th>
                  <th scope="col" className={table.th}>
                    Durum
                  </th>
                  <th scope="col" className={cn(table.th, 'hidden md:table-cell')}>
                    Dönem
                  </th>
                  <th scope="col" className={cn(table.th, 'hidden lg:table-cell')}>
                    Tanımlayan · not
                  </th>
                  <th scope="col" className={cn(table.th, 'text-right')}>
                    <span className="sr-only">Eylemler</span>
                  </th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {list.items.map((r) => {
                  const st = STATUS_META[r.status] ?? { label: r.status, tone: 'neutral' as const };
                  const left = r.is_current ? daysLeft(r.ends_at) : null;
                  const shown = r.is_current ? st : r.status === 'trial' || r.status === 'active' ? STATUS_META.expired : st;
                  return (
                    <tr key={r.id} className="align-top transition-colors hover:bg-surface-2">
                      <td className={table.td}>
                        <Link href={`/users/${encodeURIComponent(r.user_id)}`} className="font-medium text-fg hover:text-brand">
                          {r.username ?? '—'}
                        </Link>
                        <p className="truncate text-xs text-subtle">{r.email}</p>
                        <p className="mt-1 text-xs text-subtle md:hidden">
                          {shortDate(r.starts_at)} → {r.ends_at ? shortDate(r.ends_at) : 'süresiz'}
                        </p>
                      </td>
                      <td className={cn(table.td, 'whitespace-nowrap')}>
                        <Badge tone={shown.tone}>{shown.label}</Badge>
                        <p className="mt-1 text-xs text-subtle">{SOURCE_LABEL[r.source] ?? r.source}</p>
                        {r.is_current && <p className="num text-xs text-subtle">{left === null ? 'Süresiz' : `${left} gün kaldı`}</p>}
                      </td>
                      <td className={cn(table.td, 'hidden whitespace-nowrap md:table-cell')}>
                        <p className="num text-fg">{shortDate(r.starts_at)}</p>
                        <p className="num text-xs text-subtle">→ {r.ends_at ? shortDate(r.ends_at) : 'süresiz'}</p>
                        {r.canceled_at && <p className="num text-xs text-subtle">İptal: {shortDate(r.canceled_at)}</p>}
                      </td>
                      <td className={cn(table.td, 'hidden max-w-xs lg:table-cell')}>
                        <p className="text-fg">{r.granted_by_username ?? (r.source === 'trial' ? 'Kullanıcı' : '—')}</p>
                        {r.note && (
                          <p className="line-clamp-2 text-xs text-subtle" title={r.note}>
                            {r.note}
                          </p>
                        )}
                      </td>
                      <td className={cn(table.td, 'whitespace-nowrap text-right')}>
                        {r.is_current ? (
                          <span className="inline-flex flex-wrap justify-end gap-1.5">
                            {r.ends_at && (
                              <Button size="sm" variant="secondary" onClick={() => setAction({ kind: 'extend', userId: r.user_id, username: r.username ?? '' })}>
                                Uzat
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'revoke', userId: r.user_id, username: r.username ?? '' })}>
                              Sonlandır
                            </Button>
                          </span>
                        ) : (
                          <span className="text-xs text-subtle">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination offset={offset} limit={PAGE} total={list.total} onChange={setOffset} label="Abonelik sayfaları" />
      </Card>

      <PlansCard />

      <UserPicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(u) => {
          setPicker(false);
          setAction({ kind: 'grant', userId: u.id, username: u.username });
        }}
      />
      <SubscriptionActionModal action={action} onClose={() => setAction(null)} onDone={() => void list.mutate()} />
    </div>
  );
}

function PlansCard() {
  const plans = usePlans();
  return (
    <Card className="min-w-0 overflow-hidden">
      <TableCardHeader title="Planlar" description="Özellik anahtarları sunucudaki yetki kontrolünde kullanılır (migration 025 tohumu)." />
      <div className="grid grid-cols-1 gap-4 border-t border-line p-5 sm:p-6 md:grid-cols-2">
        {(plans.data ?? []).map((p) => (
          <div key={p.id} className="rounded-xl border border-line p-4">
            <p className="flex items-center justify-between gap-2 font-semibold text-fg">
              {p.name}
              <Badge tone={p.id === 'premium' ? 'brand' : 'neutral'}>{p.price_display}</Badge>
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {p.features.map((f) => (
                <li key={f.key} className="flex items-start gap-2">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-up" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="text-fg">{f.label}</span> <code className="text-xs text-subtle">{f.key}</code>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Premium tanımlanacak kullanıcıyı bul (yönetici kullanıcı araması) */
function UserPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (u: { id: string; username: string }) => void }) {
  const [q, setQ] = useState('');
  const term = useDebouncedValue(q.trim());
  const res = useSWR(open && term.length >= 2 ? adminKeys.users({ limit: 8, offset: 0, search: term }) : null, swrFetcher, { revalidateOnFocus: false });
  const users = toPaged<{ id: string; username: string; email: string; is_deleted?: boolean }>(res.data).items;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Kullanıcı seç"
      description="Premium tanımlanacak hesabı kullanıcı adı veya e-postayla ara."
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
        </div>
      }
    >
      <SearchInput value={q} onChange={setQ} placeholder="En az 2 karakter" label="Kullanıcı ara" className="sm:w-full" />
      <ul className="mt-3 max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {term.length < 2 ? (
          <li className="px-4 py-3 text-sm text-subtle">Aramak için yazmaya başla</li>
        ) : res.isLoading ? (
          <li className="px-4 py-3 text-sm text-subtle">Aranıyor…</li>
        ) : users.length === 0 ? (
          <li className="px-4 py-3 text-sm text-subtle">Sonuç yok</li>
        ) : (
          users.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                disabled={!!u.is_deleted}
                onClick={() => onPick(u)}
                className="flex w-full flex-col items-start px-4 py-2.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                <span className="font-medium text-fg">{u.username}</span>
                <span className="text-xs text-subtle">{u.email}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </Modal>
  );
}
