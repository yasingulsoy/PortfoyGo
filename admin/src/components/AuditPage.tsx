'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DocumentMagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/20/solid';
import { Card } from '@portfoygo/shared/ui/Card';
import { Badge, EmptyState } from '@portfoygo/shared/ui/Feedback';
import UserInitial from '@portfoygo/shared/ui/UserInitial';
import { cn, formatDateTime, formatNumber, formatRelative, formatTRY } from '@portfoygo/shared/format';
import { adminKeys } from '@/lib/api';
import { usePaged } from '@/lib/hooks';
import { AUDIT_ACTIONS, arenaDurationLabel, auditAction } from '@/lib/labels';
import type { AuditEntry } from '@/lib/types';
import { TableCardHeader, TableSkeleton, table } from './ui';
import { LoadError, Pagination, SelectField, StaleNotice } from './controls';

const PAGE_SIZE = 25;

const ACTION_OPTIONS = [
  { value: '', label: 'Tüm eylemler' },
  ...Object.entries(AUDIT_ACTIONS).map(([value, m]) => ({ value, label: m.label })),
];

const META_LABELS: Record<string, string> = {
  reason: 'Gerekçe',
  refunded: 'İade',
  is_admin: 'Yönetici',
  ban: 'Yasak',
  symbol: 'Sembol',
  name: 'Ad',
  job: 'İş',
  count: 'Adet',
  members: 'Üye',
  member_count: 'Üye',
  sessions: 'Oturum',
  revoked: 'Kapatılan',
  changed: 'Değişti',
  already_verified: 'Zaten doğrulanmıştı',
  from: 'Önceki',
  to: 'Yeni',
  status: 'Durum',
  recipients: 'Alıcı',
  link: 'Bağlantı',
  title: 'Başlık',
  starts_at: 'Başlangıç',
  duration_s: 'Süre',
  instruments: 'Enstrümanlar',
  starting_cash: 'Başlangıç bakiyesi',
  sponsor: 'Sponsor',
  prize_text: 'Ödül',
  participants: 'Katılımcı',
};

function metaValue(key: string, v: unknown): string {
  if (typeof v === 'boolean') return v ? 'evet' : 'hayır';
  if (key === 'refunded' && typeof v === 'number') return formatTRY(v);
  if (v === null || v === undefined) return '—';
  if (key === 'starts_at' && typeof v === 'string') return formatDateTime(v);
  if (key === 'duration_s' && (typeof v === 'number' || typeof v === 'string')) return arenaDurationLabel(Number(v));
  if (key === 'starting_cash' && (typeof v === 'number' || typeof v === 'string')) return `$${formatNumber(Number(v), 0)}`;
  if (Array.isArray(v)) return v.map(String).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Üst veriden kısa, okunur özet: "Gerekçe: spam · İade: ₺1.200,00" veya "evet → hayır" */
function metaSummary(meta: AuditEntry['metadata']): { text: string; full: string } | null {
  if (!meta || typeof meta !== 'object') return null;
  // Kimlik alanları (owner_id vb.) özette gürültü yaratır; tam içerik title'da kalır
  const entries = Object.entries(meta).filter(([k, v]) => v !== null && v !== undefined && v !== '' && !/(^|_)id$/.test(k));
  if (!entries.length) return null;
  // Rol değişimi gibi kayıtlarda "Önceki → Yeni" tek parça gösterilir
  const fromTo = 'from' in meta && 'to' in meta ? `${metaValue('from', meta.from)} → ${metaValue('to', meta.to)}` : null;
  const parts = entries.filter(([k]) => !fromTo || (k !== 'from' && k !== 'to'));
  const text = [fromTo, ...parts.slice(0, fromTo ? 2 : 3).map(([k, v]) => `${META_LABELS[k] ?? k}: ${metaValue(k, v)}`)].filter(Boolean).join(' · ');
  return { text, full: JSON.stringify(meta, null, 2) };
}

const TARGET_KINDS: Record<string, string> = {
  order: 'Emir',
  league: 'Lig',
  job: 'İş',
  cache: 'Önbellek',
  announcement: 'Duyuru',
  arena_challenge: 'Arena meydan okuması',
  challenge: 'Arena meydan okuması',
};

function Target({ e }: { e: AuditEntry }) {
  const label = e.target_label || e.target_id || '—';
  if (e.target_type === 'user' && e.target_id) {
    return (
      <Link href={`/users/${encodeURIComponent(e.target_id)}`} className="font-medium text-fg hover:text-brand">
        {label}
      </Link>
    );
  }
  const kind = e.target_type ? (TARGET_KINDS[e.target_type] ?? null) : null;
  return (
    <span className="min-w-0">
      <span className="block max-w-[14rem] truncate text-fg" title={label}>
        {label}
      </span>
      {kind && <span className="text-xs text-subtle">{kind}</span>}
    </span>
  );
}

export default function AuditPage() {
  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);
  const key = adminKeys.audit({ action, limit: PAGE_SIZE, offset });
  const { items, total, error, loading, isValidating, mutate } = usePaged<AuditEntry>(key);

  return (
    <Card className="min-w-0 overflow-hidden">
      <TableCardHeader
        title="Yönetici eylemleri"
        description={loading ? 'Yükleniyor' : `${formatNumber(total, 0)} kayıt · en yeni önce`}
        actions={
          <SelectField
            label="Eylem türü"
            hideLabel
            options={ACTION_OPTIONS}
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setOffset(0);
            }}
            className="w-full sm:w-64"
          />
        }
      />
      <StaleNotice show={!!error && items.length > 0} />

      {loading ? (
        <TableSkeleton rows={8} />
      ) : error && items.length === 0 ? (
        <LoadError error={error} title="Denetim kaydı yüklenemedi" onRetry={() => void mutate()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={action ? <FunnelIcon /> : <DocumentMagnifyingGlassIcon />}
          title={action ? 'Bu eylem için kayıt yok' : 'Henüz kayıt yok'}
          description={action ? undefined : 'Yöneticilerin yaptığı her değişiklik burada listelenir.'}
          className="border-t border-line"
        />
      ) : (
        <div className={cn(table.wrap, 'transition-opacity', isValidating && 'opacity-70')} aria-busy={isValidating}>
          <table className={table.table}>
            <caption className="sr-only">Denetim kaydı</caption>
            <thead>
              <tr className={table.headRow}>
                <th scope="col" className={table.th}>Zaman</th>
                <th scope="col" className={table.th}>Yönetici</th>
                <th scope="col" className={table.th}>Eylem</th>
                <th scope="col" className={table.th}>Hedef</th>
                <th scope="col" className={cn(table.th, 'hidden lg:table-cell')}>Ayrıntı</th>
                <th scope="col" className={cn(table.th, 'hidden xl:table-cell')}>IP</th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {items.map((e) => {
                const a = auditAction(e.action);
                const meta = metaSummary(e.metadata);
                return (
                  <tr key={e.id} className="align-top transition-colors hover:bg-surface-2">
                    <td className={cn(table.td, 'whitespace-nowrap')}>
                      <time dateTime={e.created_at} title={formatDateTime(e.created_at)} className="block text-fg/80">
                        {formatRelative(e.created_at)}
                      </time>
                      <span className="text-xs text-subtle">{formatDateTime(e.created_at)}</span>
                    </td>
                    <td className={cn(table.td, 'whitespace-nowrap')}>
                      <Link href={`/users/${encodeURIComponent(e.admin_id)}`} className="inline-flex items-center gap-2 font-medium text-fg hover:text-brand">
                        <UserInitial name={e.admin_username || '?'} size={28} tone="gold" />
                        {e.admin_username || '—'}
                      </Link>
                    </td>
                    <td className={table.td}>
                      <Badge tone={a.tone} className="whitespace-nowrap">
                        {a.label}
                      </Badge>
                      {meta && (
                        <p className="mt-1 max-w-[14rem] truncate text-xs text-subtle lg:hidden" title={meta.full}>
                          {meta.text}
                        </p>
                      )}
                    </td>
                    <td className={table.td}>
                      <Target e={e} />
                    </td>
                    <td className={cn(table.td, 'hidden max-w-[20rem] lg:table-cell')}>
                      {meta ? (
                        <span className="line-clamp-2 break-words text-xs" title={meta.full}>
                          {meta.text}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={cn(table.td, 'hidden whitespace-nowrap xl:table-cell')}>
                      <span className="num font-mono text-xs">{e.ip || '—'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onChange={setOffset} label="Denetim kaydı sayfaları" />
    </Card>
  );
}
