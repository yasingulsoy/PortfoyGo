'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@portfoygo/shared/ui/Feedback';
import Button from '@portfoygo/shared/ui/Button';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { isAssetType } from '@portfoygo/shared/types';
import { cn, formatDateTime, formatQuantity, formatRelative, formatTRY } from '@portfoygo/shared/format';
import { adminApi } from '@/lib/api';
import { assetTypeLabel, orderStatus, orderTypeLabel, sideLabel, sideTone } from '@/lib/labels';
import type { AdminOrder, AdminTransaction } from '@/lib/types';
import { num } from './model';
import { ConfirmModal } from './controls';
import { table } from './ui';

/* İşlem ve emir tabloları: /transactions, /orders ve kullanıcı detayında ortak kullanılır. */

const userHref = (id: string) => `/users/${encodeURIComponent(id)}`;

function UserCell({ id, username }: { id: string; username: string }) {
  return (
    <Link href={userHref(id)} className="font-medium text-fg hover:text-brand">
      {username}
    </Link>
  );
}

/** Varlık hücresi: logo + sembol + ad · tip (işlem / emir tabloları ve kullanıcı detayındaki pozisyonlar). */
export function AssetCell({ symbol, name, assetType }: { symbol: string; name?: string | null; assetType: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {isAssetType(assetType) && <AssetAvatar symbol={symbol} type={assetType} size={28} />}
      <div className="min-w-0">
        <p className="font-medium text-fg">{symbol}</p>
        <p className="max-w-[12rem] truncate text-xs text-subtle" title={name ?? undefined}>
          {name ? `${name} · ` : ''}
          {assetTypeLabel(assetType)}
        </p>
      </div>
    </div>
  );
}

/** İki satırlı tarih: gün / saat (dar sütun) */
function When({ at }: { at: string }) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return <>—</>;
  return (
    <time dateTime={at} title={formatDateTime(at)} className="block whitespace-nowrap">
      <span className="block text-fg/80">{d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
      <span className="num block text-xs text-subtle">{d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
    </time>
  );
}

export function TransactionsTableView({ items, showUser = true, caption }: { items: AdminTransaction[]; showUser?: boolean; caption: string }) {
  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className={table.headRow}>
            <th scope="col" className={table.th}>Tarih</th>
            {showUser && <th scope="col" className={table.th}>Kullanıcı</th>}
            <th scope="col" className={table.th}>Tür</th>
            <th scope="col" className={table.th}>Varlık</th>
            <th scope="col" className={cn(table.th, 'text-right')}>Miktar</th>
            <th scope="col" className={cn(table.th, 'text-right')}>Fiyat</th>
            <th scope="col" className={cn(table.th, 'text-right')}>Tutar</th>
            <th scope="col" className={cn(table.th, 'hidden text-right lg:table-cell')}>Net / komisyon</th>
          </tr>
        </thead>
        <tbody className={table.body}>
          {items.map((t) => (
            <tr key={t.id} className="transition-colors hover:bg-surface-2">
              <td className={table.td}>
                <When at={t.created_at} />
              </td>
              {showUser && (
                <td className={cn(table.td, 'whitespace-nowrap')}>
                  <UserCell id={t.user_id} username={t.username} />
                </td>
              )}
              <td className={table.td}>
                <Badge tone={sideTone(t.type)}>{sideLabel(t.type)}</Badge>
              </td>
              <td className={table.td}>
                <AssetCell symbol={t.symbol} name={t.name} assetType={t.asset_type} />
              </td>
              <td className={cn(table.td, 'num whitespace-nowrap text-right')}>{formatQuantity(num(t.quantity))}</td>
              <td className={cn(table.td, 'num whitespace-nowrap text-right')}>{formatTRY(num(t.price), { precise: true })}</td>
              <td className={cn(table.td, 'num whitespace-nowrap text-right font-medium text-fg')}>{formatTRY(num(t.total_amount))}</td>
              <td className={cn(table.td, 'num hidden whitespace-nowrap text-right lg:table-cell')}>
                <span className="block">{formatTRY(num(t.net_amount))}</span>
                <span className="block text-xs text-subtle">kom. {formatTRY(num(t.commission))}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrdersTableView({
  items,
  showUser = true,
  caption,
  onCancel,
}: {
  items: AdminOrder[];
  showUser?: boolean;
  caption: string;
  onCancel?: (o: AdminOrder) => void;
}) {
  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className={table.headRow}>
            <th scope="col" className={table.th}>Oluşturma</th>
            {showUser && <th scope="col" className={table.th}>Kullanıcı</th>}
            <th scope="col" className={table.th}>Varlık</th>
            <th scope="col" className={table.th}>Emir</th>
            <th scope="col" className={cn(table.th, 'text-right')}>Miktar</th>
            <th scope="col" className={cn(table.th, 'text-right')}>Tetik fiyatı</th>
            <th scope="col" className={table.th}>Durum</th>
            {onCancel && (
              <th scope="col" className={cn(table.th, 'text-right')}>
                <span className="sr-only">İşlem</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className={table.body}>
          {items.map((o) => {
            const st = orderStatus(o.status);
            return (
              <tr key={o.id} className="transition-colors hover:bg-surface-2">
                <td className={table.td}>
                  <When at={o.created_at} />
                </td>
                {showUser && (
                  <td className={cn(table.td, 'whitespace-nowrap')}>
                    <UserCell id={o.user_id} username={o.username} />
                  </td>
                )}
                <td className={table.td}>
                  <AssetCell symbol={o.symbol} assetType={o.asset_type} />
                </td>
                <td className={cn(table.td, 'whitespace-nowrap')}>
                  <span className="flex items-center gap-1.5">
                    <Badge tone={sideTone(o.side)}>{sideLabel(o.side)}</Badge>
                    <span className="text-xs text-muted">{orderTypeLabel(o.type)}</span>
                  </span>
                </td>
                <td className={cn(table.td, 'num whitespace-nowrap text-right')}>{formatQuantity(num(o.quantity))}</td>
                <td className={cn(table.td, 'num whitespace-nowrap text-right')}>
                  <span className="block text-fg">{formatTRY(num(o.trigger_price), { precise: true })}</span>
                  {o.filled_price != null ? (
                    <span className="block text-xs text-subtle">gerç. {formatTRY(num(o.filled_price), { precise: true })}</span>
                  ) : o.reserved_cash != null && num(o.reserved_cash) > 0 ? (
                    <span className="block text-xs text-subtle">bloke {formatTRY(num(o.reserved_cash))}</span>
                  ) : null}
                </td>
                <td className={table.td}>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {o.fail_reason ? (
                    <p className="mt-1 max-w-[14rem] truncate text-xs text-subtle" title={o.fail_reason}>
                      {o.fail_reason}
                    </p>
                  ) : o.status === 'active' && o.expires_at ? (
                    <p className="mt-1 whitespace-nowrap text-xs text-subtle" title={`Son geçerlilik: ${formatDateTime(o.expires_at)}`}>
                      Bitiş {formatRelativeFuture(o.expires_at)}
                    </p>
                  ) : null}
                </td>
                {onCancel && (
                  <td className={cn(table.td, 'text-right')}>
                    {o.status === 'active' ? (
                      <Button variant="down" size="sm" onClick={() => onCancel(o)} aria-label={`${o.symbol} ${sideLabel(o.side).toLocaleLowerCase('tr')} emrini iptal et`}>
                        İptal et
                      </Button>
                    ) : null}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Gelecekteki zaman: "3 gün sonra"; geçmişse göreli geçmiş. */
function formatRelativeFuture(at: string) {
  const diff = new Date(at).getTime() - Date.now();
  if (!Number.isFinite(diff)) return '—';
  if (diff <= 0) return formatRelative(at);
  const h = Math.round(diff / 3_600_000);
  if (h < 1) return 'bir saatten az';
  if (h < 24) return `${h} sa sonra`;
  return `${Math.round(h / 24)} gün sonra`;
}

/** Emir iptali: gerekçe alanlı onay penceresi + iade tutarı bildirimi. */
export function useCancelOrder(onDone: () => void) {
  const toast = useToast();
  const [target, setTarget] = useState<AdminOrder | null>(null);

  const modal = (
    <ConfirmModal
      open={!!target}
      onClose={() => setTarget(null)}
      title="Emri iptal et"
      description={target ? [target.username, `${sideLabel(target.side)} ${target.symbol}`, `${formatQuantity(num(target.quantity))} adet`].filter(Boolean).join(' · ') : undefined}
      confirmLabel="Emri iptal et"
      tone="danger"
      reason={{ label: 'Gerekçe', placeholder: 'Emrin iptal nedeni olarak kullanıcıya gösterilir ve denetim kaydına yazılır' }}
      onConfirm={async (reason) => {
        if (!target) return;
        const res = await adminApi.cancelOrder(target.id, reason || undefined);
        const refunded = num(res?.data?.refunded ?? res?.refunded);
        toast.success('Emir iptal edildi', {
          description: refunded > 0 ? `${formatTRY(refunded)} bloke nakit kullanıcıya iade edildi.` : `${target.symbol} emri artık etkin değil.`,
        });
        setTarget(null);
        onDone();
      }}
    >
      <p>Bekleyen emir iptal edilir; alış emirlerinde bloke edilen nakit kullanıcının bakiyesine iade edilir. Bu işlem geri alınamaz.</p>
    </ConfirmModal>
  );

  return { open: setTarget, modal };
}
