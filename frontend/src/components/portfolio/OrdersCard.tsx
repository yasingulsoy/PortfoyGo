'use client';

import { useState } from 'react';
import { ArrowPathIcon, QueueListIcon } from '@heroicons/react/20/solid';
import { ordersApi } from '@/lib/api';
import { useMarket } from '@/hooks/useMarketData';
import { cn, formatDateTime, formatPercent, formatQuantity, formatRelative, formatTRY } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import AssetAvatar from '@/components/ui/AssetAvatar';
import Modal from '@/components/ui/Modal';
import Tabs from '@/components/ui/Tabs';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { formatTimeLeft } from '@/components/trade/orderInput';
import { ORDER_STATUS, distanceToTrigger, orderLabel, type OrderRow } from './useOrders';

type View = 'active' | 'history';

/** Emir tipi rozet tonu: alış yeşil, zarar durdur kırmızı, satış/kâr al marka */
export function orderTone(o: Pick<OrderRow, 'side' | 'type'>): 'up' | 'down' | 'brand' | 'gold' {
  if (o.side === 'buy') return 'up';
  if (o.type === 'stop_loss') return 'down';
  if (o.type === 'take_profit') return 'gold';
  return 'brand';
}

export function OrderTypeBadge({ order, className }: { order: Pick<OrderRow, 'side' | 'type'>; className?: string }) {
  return (
    <Badge tone={orderTone(order)} className={className}>
      {orderLabel(order)}
    </Badge>
  );
}

interface Props {
  active: OrderRow[];
  history: OrderRow[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onChanged: () => void | Promise<unknown>;
  className?: string;
  id?: string;
}

/** "Bekleyen emirler" kartı: aktif emirler (iptal edilebilir) ve geçmiş. */
export default function OrdersCard({ active, history, loading, error, onRetry, onChanged, className, id }: Props) {
  const [view, setView] = useState<View>('active');
  const [pending, setPending] = useState<OrderRow | null>(null);
  const { find } = useMarket();

  const rows = view === 'active' ? active : history.slice(0, 30);
  const reservedTotal = active.reduce((s, o) => s + o.reservedCash, 0);

  return (
    <Card id={id} className={cn('scroll-mt-24 overflow-hidden', className)}>
      <CardHeader
        icon={<QueueListIcon />}
        title="Bekleyen emirler"
        description={
          reservedTotal > 0 ? (
            <>
              Limit alışlar için ayrılan nakit: <span className="num text-fg">{formatTRY(reservedTotal)}</span>
            </>
          ) : (
            'Fiyat seviyeye gelince otomatik gerçekleşen emirler'
          )
        }
      />
      <div className="px-5 pt-3">
        <Tabs
          variant="underline"
          label="Emir durumu"
          value={view}
          onChange={setView}
          items={[
            { value: 'active', label: 'Aktif', count: active.length },
            { value: 'history', label: 'Geçmiş', count: history.length },
          ]}
        />
      </div>

      {loading ? (
        <div className="space-y-3 p-5">
          {[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : error && rows.length === 0 ? (
        <div className="p-5">
          <Alert tone="error">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              Emirler yüklenemedi.
              <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
                <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden="true" /> Tekrar dene
              </button>
            </span>
          </Alert>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<QueueListIcon />}
          title={view === 'active' ? 'Bekleyen emrin yok' : 'Geçmiş emir yok'}
          description={
            view === 'active'
              ? 'Al/Sat penceresinde “Limit” seçerek ya da pozisyonlar tablosundaki “Emir” düğmesiyle zarar durdur / kâr al emri oluşturabilirsin.'
              : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((o) => {
            const asset = find(o.assetType, o.symbol);
            return (
              <OrderListRow
                key={o.id}
                order={o}
                livePrice={asset?.priceTRY ?? null}
                image={asset?.image}
                onCancel={view === 'active' ? () => setPending(o) : undefined}
              />
            );
          })}
        </ul>
      )}

      <CancelOrderDialog
        order={pending}
        onClose={() => setPending(null)}
        onCancelled={async () => {
          setPending(null);
          await onChanged();
        }}
      />
    </Card>
  );
}

/** Tek emir satırı (portföy kartı ve varlık sayfası ortak kullanır). */
export function OrderListRow({
  order,
  livePrice,
  image,
  onCancel,
  showAvatar = true,
}: {
  order: OrderRow;
  livePrice: number | null;
  image?: string;
  onCancel?: () => void;
  showAvatar?: boolean;
}) {
  const isActive = order.status === 'active';
  const distance = isActive ? distanceToTrigger(order, livePrice) : null;
  const status = ORDER_STATUS[order.status] ?? { label: order.status, tone: 'neutral' as const };
  const timeLeft = isActive ? formatTimeLeft(order.expiresAt) : null;

  const detail = (() => {
    if (isActive) {
      return [
        `${formatQuantity(order.quantity)} adet`,
        order.reservedCash > 0 ? `${formatTRY(order.reservedCash)} ayrıldı` : null,
        timeLeft,
      ]
        .filter(Boolean)
        .join(' · ');
    }
    if (order.status === 'filled') {
      const qty = order.filledQuantity ?? order.quantity;
      return `${formatQuantity(qty)} adet × ${formatTRY(order.filledPrice ?? 0, { precise: true })}${order.filledAt ? ` · ${formatRelative(order.filledAt)}` : ''}`;
    }
    return [order.failReason, order.updatedAt ? formatRelative(order.updatedAt) : null].filter(Boolean).join(' · ');
  })();

  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      {showAvatar && <AssetAvatar symbol={order.symbol} type={order.assetType} image={image} size={32} />}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[13px] font-semibold">{order.symbol}</span>
          <OrderTypeBadge order={order} />
          {!isActive && <Badge tone={status.tone}>{status.label}</Badge>}
        </p>
        <p className="num mt-0.5 truncate text-xs text-muted" title={order.expiresAt && isActive ? `Son geçerlilik: ${formatDateTime(order.expiresAt)}` : undefined}>
          {detail || '—'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="num text-sm font-semibold">{formatTRY(order.triggerPrice, { precise: true })}</p>
        <p className="num mt-0.5 text-xs text-subtle">
          {isActive && distance != null ? (
            <>
              <span className="sr-only">Güncel fiyata uzaklık: </span>
              {formatPercent(distance)}
            </>
          ) : (
            'tetikleme'
          )}
        </p>
      </div>
      {onCancel && (
        <Button size="sm" variant="ghost" onClick={onCancel} aria-label={`${order.symbol} ${orderLabel(order).toLocaleLowerCase('tr-TR')} emrini iptal et`}>
          İptal
        </Button>
      )}
    </li>
  );
}

/** Emir iptali onay penceresi. */
export function CancelOrderDialog({
  order,
  onClose,
  onCancelled,
}: {
  order: OrderRow | null;
  onClose: () => void;
  onCancelled: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const close = () => {
    if (busy) return;
    setError('');
    onClose();
  };

  const confirm = async () => {
    if (!order) return;
    setBusy(true);
    setError('');
    try {
      const res = await ordersApi.cancel(order.id);
      if (res && res.success === false) throw new Error(res.message || 'Emir iptal edilemedi.');
      const refunded = Number(res?.refunded ?? 0);
      toast.success('Emir iptal edildi', {
        description: refunded > 0 ? `${formatTRY(refunded)} bakiyene iade edildi.` : `${order.symbol} ${orderLabel(order).toLocaleLowerCase('tr-TR')} emri kaldırıldı.`,
      });
      await onCancelled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Emir iptal edilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!order}
      onClose={close}
      size="sm"
      title="Emri iptal et"
      description={order ? `${order.symbol} için ${orderLabel(order).toLocaleLowerCase('tr-TR')} emri kaldırılacak.` : undefined}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>Vazgeç</Button>
          <Button variant="danger" onClick={confirm} loading={busy}>İptal et</Button>
        </div>
      }
    >
      {order && (
        <dl className="space-y-2 rounded-xl bg-surface-2 p-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Tetikleme fiyatı</dt>
            <dd className="num font-medium">{formatTRY(order.triggerPrice, { precise: true })}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Miktar</dt>
            <dd className="num font-medium">{formatQuantity(order.quantity)} {order.symbol}</dd>
          </div>
          {order.reservedCash > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">İade edilecek nakit</dt>
              <dd className="num font-medium text-up">{formatTRY(order.reservedCash)}</dd>
            </div>
          )}
        </dl>
      )}
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}
    </Modal>
  );
}
