'use client';

import { useState, type FormEvent } from 'react';
import { ArrowPathIcon, QueueListIcon } from '@heroicons/react/20/solid';
import { ordersApi } from '@/lib/api';
import { useMarket } from '@/hooks/useMarketData';
import { useNow } from '@/hooks/useNow';
import { formatCountdown, formatTrDayTime } from '@/lib/marketHours';
import { cn, formatDateTime, formatPercent, formatQuantity, formatRelative, formatTRY } from '@portfoygo/shared/format';
import { Card } from '@portfoygo/shared/ui/Card';
import { DataTable, TBody, THead, Td, Th, Tr } from '@/components/common/Table';
import Button from '@portfoygo/shared/ui/Button';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import Modal from '@portfoygo/shared/ui/Modal';
import Tabs from '@portfoygo/shared/ui/Tabs';
import { Field } from '@portfoygo/shared/ui/Field';
import { Alert, Badge, EmptyState, Skeleton } from '@portfoygo/shared/ui/Feedback';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { TRAIL_PERCENT_MAX, TRAIL_PERCENT_MIN, formatTimeLeft, parseDecimal, sanitizeDecimal, toInput, trailingTrigger } from '@/components/trade/orderInput';
import { ORDER_STATUS, distanceToTrigger, isMarketOnOpen, isTrailing, orderLabel, trailLabel, type OrderRow } from './useOrders';

type View = 'active' | 'history';

/** Emir tipi rozet tonu: alış yeşil, zarar durdur / takip eden stop kırmızı, kâr al altın, diğer satışlar marka */
export function orderTone(o: Pick<OrderRow, 'side' | 'type'>): 'up' | 'down' | 'brand' | 'gold' {
  if (o.side === 'buy') return 'up';
  if (o.type === 'stop_loss' || o.type === 'trailing_stop') return 'down';
  if (o.type === 'take_profit') return 'gold';
  return 'brand';
}

export function OrderTypeBadge({ order, className }: { order: Pick<OrderRow, 'side' | 'type'>; className?: string }) {
  return (
    <Badge tone={orderTone(order)} className={cn('whitespace-nowrap', className)}>
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
  const [editing, setEditing] = useState<OrderRow | null>(null);
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
                  onEdit={view === 'active' && isTrailing(o) ? () => setEditing(o) : undefined}
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
                    onEdit={view === 'active' && isTrailing(o) ? () => setEditing(o) : undefined}
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
      <EditTrailingDialog
        order={editing}
        livePrice={editing ? (find(editing.assetType, editing.symbol)?.priceTRY ?? null) : null}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await onChanged();
        }}
      />
    </Card>
  );
}

/** Emir satırının alt bilgi metni (miktar, ayrılan nakit, takip, kalan süre ya da sonuç). */
function orderDetail(order: OrderRow) {
  if (order.status === 'active') {
    const trail = isTrailing(order) ? trailLabel(order) : null;
    return [
      `${formatQuantity(order.quantity)} adet`,
      order.reservedCash > 0 ? `${formatTRY(order.reservedCash)} ayrıldı` : null,
      trail ? `${trail} takip` : null,
      isTrailing(order) && order.highWater ? `zirve ${formatTRY(order.highWater, { precise: true })}` : null,
      isMarketOnOpen(order) && order.executeAfter ? `açılış ${formatTrDayTime(new Date(order.executeAfter))}` : formatTimeLeft(order.expiresAt),
    ]
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

function EditButton({ order, onEdit }: { order: OrderRow; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`${order.symbol} takip eden stop emrini düzenle`}
      className="inline-flex h-8 shrink-0 items-center rounded-lg px-2.5 text-xs font-medium text-brand transition-colors hover:bg-brand-soft"
    >
      Düzenle
    </button>
  );
}

/** Açılışta emri: "Açılışta" + kalan süre (aktifken) */
function MooTriggerCell({ order }: { order: OrderRow }) {
  const now = useNow(30_000);
  const at = order.executeAfter ? Date.parse(order.executeAfter) : NaN;
  const waiting = order.status === 'active' && Number.isFinite(at);
  return (
    <>
      <p className="whitespace-nowrap text-sm font-semibold text-fg">Açılışta</p>
      <p className="num mt-0.5 whitespace-nowrap text-xs text-muted" title={`Referans fiyat: ${formatTRY(order.triggerPrice, { precise: true })}`}>
        {waiting ? (at > now ? `açılışa ${formatCountdown(at - now)}` : 'ilk taze fiyat bekleniyor') : `ref. ${formatTRY(order.triggerPrice, { precise: true })}`}
      </p>
    </>
  );
}

function TriggerCell({ order, livePrice }: { order: OrderRow; livePrice: number | null }) {
  if (isMarketOnOpen(order)) return <MooTriggerCell order={order} />;
  const isActive = order.status === 'active';
  const distance = isActive ? distanceToTrigger(order, livePrice) : null;
  return (
    <>
      <p className="num whitespace-nowrap text-sm font-semibold text-fg">
        {isActive && isTrailing(order) && <span className="sr-only">Güncel tetikleme fiyatı: </span>}
        {formatTRY(order.triggerPrice, { precise: true })}
      </p>
      <p className="num mt-0.5 whitespace-nowrap text-xs text-muted">
        {isActive && distance != null ? (
          <>
            <span className="sr-only">Güncel fiyata uzaklık: </span>
            {formatPercent(distance)}
            {isTrailing(order) && <span> · güncel</span>}
          </>
        ) : (
          'tetikleme'
        )}
      </p>
    </>
  );
}

function OrderTableRow({
  order,
  livePrice,
  image,
  onCancel,
  onEdit,
}: {
  order: OrderRow;
  livePrice: number | null;
  image?: string;
  onCancel?: () => void;
  onEdit?: () => void;
}) {
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
              className="num mt-0.5 line-clamp-2 max-w-[14rem] min-w-[6rem] text-xs text-muted"
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
          <span className="flex flex-col items-end">
            {onEdit && <EditButton order={order} onEdit={onEdit} />}
            <CancelButton order={order} onCancel={onCancel} />
          </span>
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
  onEdit,
  showAvatar = true,
}: {
  order: OrderRow;
  livePrice: number | null;
  image?: string;
  onCancel?: () => void;
  onEdit?: () => void;
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
      {(onEdit || onCancel) && (
        <div className="flex shrink-0 flex-col items-end">
          {onEdit && <EditButton order={order} onEdit={onEdit} />}
          {onCancel && <CancelButton order={order} onCancel={onCancel} />}
        </div>
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

type TrailMode = 'percent' | 'amount';

/**
 * Takip eden stop düzenleme: mesafe (yüzde VEYA TL). Zirve korunur; yeni tetikleme = zirve × (1 − %) ya da
 * zirve − TL ve güncel fiyatın altında olmalı (aksi halde emir hemen tetiklenirdi).
 */
export function EditTrailingDialog({
  order,
  livePrice,
  onClose,
  onSaved,
}: {
  order: OrderRow | null;
  livePrice: number | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  return (
    <Modal open={!!order} onClose={onClose} size="sm" title="Takip eden stopu düzenle" description={order ? `${order.symbol} · ${formatQuantity(order.quantity)} adet` : undefined}>
      {order && <EditTrailingForm key={order.id} order={order} livePrice={livePrice} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function EditTrailingForm({ order, livePrice, onClose, onSaved }: { order: OrderRow; livePrice: number | null; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const toast = useToast();
  const [mode, setMode] = useState<TrailMode>(order.trailAmount != null ? 'amount' : 'percent');
  const [input, setInput] = useState(() => toInput(order.trailAmount ?? order.trailPercent ?? 5));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const highWater = order.highWater ?? order.triggerPrice;
  const value = parseDecimal(input);
  const trigger = value > 0 ? trailingTrigger(highWater, mode === 'percent' ? { percent: value } : { amount: value }) : NaN;
  const inputError = (() => {
    if (input.trim() === '') return 'Takip mesafesi girin.';
    if (!(value > 0)) return 'Takip mesafesi 0’dan büyük olmalı.';
    if (mode === 'percent' && (value < TRAIL_PERCENT_MIN || value > TRAIL_PERCENT_MAX)) return `%${TRAIL_PERCENT_MIN} ile %${TRAIL_PERCENT_MAX} arasında olmalı.`;
    if (mode === 'amount' && value >= highWater) return 'Takip tutarı zirve fiyattan küçük olmalı.';
    if (livePrice && trigger >= livePrice) return 'Yeni tetikleme güncel fiyatın altında olmalı; aksi halde emir hemen tetiklenir.';
    return undefined;
  })();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (inputError || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await ordersApi.update(order.id, mode === 'percent' ? { trail_percent: value } : { trail_amount: value });
      if (res && res.success === false) throw new Error(res.message || 'Emir güncellenemedi.');
      toast.success('Emir güncellendi', { description: `${order.symbol} yeni tetikleme: ${formatTRY(Number(res?.order?.trigger_price ?? trigger), { precise: true })}` });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Emir güncellenemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <dl className="space-y-2.5 rounded-xl border border-line bg-surface-2 p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Zirve fiyat</dt>
          <dd className="num font-medium">{formatTRY(highWater, { precise: true })}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Güncel tetikleme</dt>
          <dd className="num font-medium">{formatTRY(order.triggerPrice, { precise: true })}</dd>
        </div>
        {livePrice != null && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Güncel fiyat</dt>
            <dd className="num font-medium">{formatTRY(livePrice, { precise: true })}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-fg/80">Mesafe</span>
        <Tabs
          label="Takip mesafesi birimi"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError('');
          }}
          items={[
            { value: 'percent', label: '%' },
            { value: 'amount', label: '₺' },
          ]}
          className="[&_button]:h-7 [&_button]:px-3 [&_button]:text-xs"
        />
      </div>
      <Field
        data-autofocus
        className="mt-3"
        label={mode === 'percent' ? 'Takip yüzdesi' : 'Takip tutarı'}
        suffix={mode === 'percent' ? '%' : '₺'}
        inputMode="decimal"
        autoComplete="off"
        value={input}
        onChange={(e) => setInput(sanitizeDecimal(e.target.value))}
        error={inputError}
        hint={!inputError && Number.isFinite(trigger) ? `Yeni tetikleme: ${formatTRY(trigger, { precise: true })}` : undefined}
      />
      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Vazgeç
        </Button>
        <Button type="submit" loading={busy} disabled={!!inputError}>
          Kaydet
        </Button>
      </div>
    </form>
  );
}
