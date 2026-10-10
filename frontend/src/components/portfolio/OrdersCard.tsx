'use client';

import { useState } from 'react';
import { ArrowPathIcon, QueueListIcon } from '@heroicons/react/20/solid';
import { ordersApi } from '@/lib/api';
import { useMarket } from '@/hooks/useMarketData';
import { cn, formatDateTime, formatPercent, formatQuantity, formatRelative, formatTRY } from '@portfoygo/shared/format';
import { Card } from '@portfoygo/shared/ui/Card';
import { DataTable, TBody, THead, Td, Th, Tr } from '@/components/common/Table';
import Button from '@portfoygo/shared/ui/Button';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import Modal from '@portfoygo/shared/ui/Modal';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { Alert, Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
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
      <div className="flex flex-col gap-4 px-5 pb-4 pt-5 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg">Bekleyen emirler</h2>
          <p className="mt-1 text-sm text-muted">
            {reservedTotal > 0 ? (
              <>
                Limit alışlar için ayrılan nakit: <span className="num font-medium text-fg">{formatTRY(reservedTotal)}</span>
              </>
            ) : (
              'Fiyat seviyeye gelince otomatik gerçekleşen emirler'
            )}
          </p>
        </div>
        <Tabs
          label="Emir durumu"
          value={view}
          onChange={setView}
          className="max-w-full shrink-0 self-start"
          items={[
            { value: 'active', label: 'Aktif', count: active.length },
            { value: 'history', label: 'Geçmiş', count: history.length },
          ]}
        />
      </div>

      {loading ? (
        <div className="space-y-3 px-5 pb-6 sm:px-6">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error && rows.length === 0 ? (
        <div className="px-5 pb-6 sm:px-6">
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
          className="border-t border-line"
          icon={<QueueListIcon />}
          title={view === 'active' ? 'Bekleyen emrin yok' : 'Geçmiş emir yok'}
          description={
            view === 'active'
              ? 'Al/Sat penceresinde “Limit” seçerek ya da pozisyonlar tablosundaki “Emir” eylemiyle zarar durdur / kâr al emri oluşturabilirsin.'
              : undefined
          }
        />
      ) : (
        <>
          {/* Küçük ekranlar: liste */}
          <ul className="divide-y divide-line border-t border-line sm:hidden">
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
          {/* sm ve üzeri: tablo */}
          <DataTable label={view === 'active' ? 'Aktif emirler' : 'Geçmiş emirler'} className="hidden pb-2 sm:block">
            <THead>
              <Th>Varlık</Th>
              <Th>Emir</Th>
              <Th align="right">Tetikleme</Th>
              {view === 'active' && (
                <Th align="right" className="w-16">
                  <span className="sr-only">İşlem</span>
                </Th>
              )}
            </THead>
            <TBody>
              {rows.map((o) => {
                const asset = find(o.assetType, o.symbol);
                return (
                  <OrderTableRow
                    key={o.id}
                    order={o}
                    livePrice={asset?.priceTRY ?? null}
                    image={asset?.image}
                    onCancel={view === 'active' ? () => setPending(o) : undefined}
                  />
                );
              })}
            </TBody>
          </DataTable>
        </>
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

/** Emir satırının alt bilgi metni (miktar, ayrılan nakit, kalan süre ya da sonuç). */
function orderDetail(order: OrderRow) {
  if (order.status === 'active') {
    return [`${formatQuantity(order.quantity)} adet`, order.reservedCash > 0 ? `${formatTRY(order.reservedCash)} ayrıldı` : null, formatTimeLeft(order.expiresAt)]
      .filter(Boolean)
      .join(' · ');
  }
  if (order.status === 'filled') {
    const qty = order.filledQuantity ?? order.quantity;
    return `${formatQuantity(qty)} adet × ${formatTRY(order.filledPrice ?? 0, { precise: true })}${order.filledAt ? ` · ${formatRelative(order.filledAt)}` : ''}`;
  }
  return [order.failReason, order.updatedAt ? formatRelative(order.updatedAt) : null].filter(Boolean).join(' · ');
}

function CancelButton({ order, onCancel }: { order: OrderRow; onCancel: () => void }) {
  return (
    <button
      type="button"
      onClick={onCancel}
      aria-label={`${order.symbol} ${orderLabel(order).toLocaleLowerCase('tr-TR')} emrini iptal et`}
      className="inline-flex h-8 shrink-0 items-center rounded-lg px-2.5 text-xs font-medium text-down transition-colors hover:bg-down-soft"
    >
      İptal
    </button>
  );
}

function TriggerCell({ order, livePrice }: { order: OrderRow; livePrice: number | null }) {
  const isActive = order.status === 'active';
  const distance = isActive ? distanceToTrigger(order, livePrice) : null;
  return (
    <>
      <p className="num whitespace-nowrap text-sm font-semibold text-fg">{formatTRY(order.triggerPrice, { precise: true })}</p>
      <p className="num mt-0.5 whitespace-nowrap text-xs text-muted">
        {isActive && distance != null ? (
          <>
            <span className="sr-only">Güncel fiyata uzaklık: </span>
            {formatPercent(distance)}
          </>
        ) : (
          'tetikleme'
        )}
      </p>
    </>
  );
}

function OrderTableRow({ order, livePrice, image, onCancel }: { order: OrderRow; livePrice: number | null; image?: string; onCancel?: () => void }) {
  const isActive = order.status === 'active';
  const status = ORDER_STATUS[order.status] ?? { label: order.status, tone: 'neutral' as const };
  const detail = orderDetail(order);
  return (
    <Tr>
      <Td>
        <div className="flex min-w-0 items-center gap-3">
          <AssetAvatar symbol={order.symbol} type={order.assetType} image={image} size={36} />
          <div className="min-w-0">
            <p className="font-medium text-fg">{order.symbol}</p>
            <p
              className="num mt-0.5 max-w-[14rem] truncate text-xs text-muted"
              title={order.expiresAt && isActive ? `Son geçerlilik: ${formatDateTime(order.expiresAt)}` : undefined}
            >
              {detail || '—'}
            </p>
          </div>
        </div>
      </Td>
      <Td>
        <span className="flex flex-wrap gap-1.5">
          <OrderTypeBadge order={order} />
          {!isActive && <Badge tone={status.tone}>{status.label}</Badge>}
        </span>
      </Td>
      <Td align="right">
        <TriggerCell order={order} livePrice={livePrice} />
      </Td>
      {onCancel && (
        <Td align="right">
          <CancelButton order={order} onCancel={onCancel} />
        </Td>
      )}
    </Tr>
  );
}

/** Tek emir satırı (portföy kartının mobil listesi ve varlık sayfası ortak kullanır). */
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
  const status = ORDER_STATUS[order.status] ?? { label: order.status, tone: 'neutral' as const };
  const detail = orderDetail(order);

  return (
    <li className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
      {showAvatar && <AssetAvatar symbol={order.symbol} type={order.assetType} image={image} size={36} />}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-fg">{order.symbol}</span>
          <OrderTypeBadge order={order} />
          {!isActive && <Badge tone={status.tone}>{status.label}</Badge>}
        </p>
        <p className="num mt-0.5 truncate text-xs text-muted" title={order.expiresAt && isActive ? `Son geçerlilik: ${formatDateTime(order.expiresAt)}` : undefined}>
          {detail || '—'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <TriggerCell order={order} livePrice={livePrice} />
      </div>
      {onCancel && <CancelButton order={order} onCancel={onCancel} />}
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
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={busy} data-autofocus>
            Vazgeç
          </Button>
          <Button variant="danger" onClick={confirm} loading={busy}>
            Emri iptal et
          </Button>
        </div>
      }
    >
      {order && (
        <dl className="space-y-2.5 rounded-xl border border-line bg-surface-2 p-4 text-sm">
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
