'use client';

import { useMemo, useState } from 'react';
import { ArrowPathIcon, ShieldExclamationIcon } from '@heroicons/react/20/solid';
import type { LiveHolding } from '@/context/PortfolioContext';
import { stopLossApi } from '@/lib/api';
import { cn, formatPercent, formatQuantity, formatRelative, formatTRY } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import AssetAvatar from '@/components/ui/AssetAvatar';
import Modal from '@/components/ui/Modal';
import Tabs from '@/components/ui/Tabs';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/Feedback';
import type { StopLossRow } from './useStopLossOrders';

type View = 'active' | 'history';

const STATUS: Record<string, { label: string; tone: 'up' | 'down' | 'neutral' | 'brand' }> = {
  active: { label: 'Aktif', tone: 'brand' },
  triggered: { label: 'Gerçekleşti', tone: 'up' },
  cancelled: { label: 'İptal edildi', tone: 'neutral' },
};

interface Props {
  active: StopLossRow[];
  history: StopLossRow[];
  holdings: LiveHolding[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onChanged: () => void | Promise<unknown>;
  className?: string;
}

export default function StopLossOrdersCard({ active, history, holdings, loading, error, onRetry, onChanged, className }: Props) {
  const [view, setView] = useState<View>('active');
  const [pending, setPending] = useState<StopLossRow | null>(null);

  const byItem = useMemo(() => new Map(holdings.map((h) => [h.id, h])), [holdings]);
  const rows = view === 'active' ? active : history.slice(0, 20);

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader
        icon={<ShieldExclamationIcon />}
        title="Stop-loss emirleri"
        description="Fiyat tetikleme seviyesine inince otomatik satış"
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
              Stop-loss emirleri yüklenemedi.
              <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
                <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden="true" /> Tekrar dene
              </button>
            </span>
          </Alert>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ShieldExclamationIcon />}
          title={view === 'active' ? 'Aktif emrin yok' : 'Geçmiş emir yok'}
          description={view === 'active' ? 'Pozisyonlar tablosundaki “Stop-loss” düğmesiyle zararını sınırlayan bir emir oluşturabilirsin.' : undefined}
        />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((o) => (
            <OrderRow key={o.id} order={o} holding={byItem.get(o.portfolio_item_id)} onCancel={view === 'active' ? () => setPending(o) : undefined} />
          ))}
        </ul>
      )}

      <CancelDialog
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

function OrderRow({ order, holding, onCancel }: { order: StopLossRow; holding?: LiveHolding; onCancel?: () => void }) {
  const live = holding?.livePrice ?? null;
  const distance = live && live > 0 ? ((order.trigger_price - live) / live) * 100 : null;
  const status = STATUS[order.status] ?? { label: order.status, tone: 'neutral' as const };
  const type = holding?.assetType ?? order.assetType ?? 'stock';

  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <AssetAvatar symbol={order.symbol} type={type} image={holding?.image} size={32} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[13px] font-semibold">{order.symbol}</span>
          {!onCancel && <Badge tone={status.tone}>{status.label}</Badge>}
        </p>
        <p className="num mt-0.5 truncate text-xs text-muted">
          {formatQuantity(order.quantity)} adet · {order.created_at ? formatRelative(order.created_at) : '—'}
        </p>
      </div>
      <div className="text-right">
        <p className="num text-sm font-semibold">{formatTRY(order.trigger_price, { precise: true })}</p>
        <p className="num mt-0.5 text-xs text-subtle">
          {onCancel && distance != null ? (
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
        <Button size="sm" variant="ghost" onClick={onCancel} aria-label={`${order.symbol} stop-loss emrini iptal et`}>
          İptal
        </Button>
      )}
    </li>
  );
}

function CancelDialog({ order, onClose, onCancelled }: { order: StopLossRow | null; onClose: () => void; onCancelled: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
      const res = await stopLossApi.cancel(order.id);
      if (res && res.success === false) throw new Error(res.message || 'Emir iptal edilemedi.');
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
      description={order ? `${order.symbol} için stop-loss emri kaldırılacak.` : undefined}
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
            <dd className="num font-medium">{formatTRY(order.trigger_price, { precise: true })}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Miktar</dt>
            <dd className="num font-medium">{formatQuantity(order.quantity)} {order.symbol}</dd>
          </div>
        </dl>
      )}
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}
    </Modal>
  );
}
