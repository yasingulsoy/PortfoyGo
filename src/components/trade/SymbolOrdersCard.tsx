'use client';

import { useMemo, useState } from 'react';
import { QueueListIcon } from '@heroicons/react/20/solid';
import { useLivePortfolio } from '@/context/PortfolioContext';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { CancelOrderDialog, OrderListRow } from '@/components/portfolio/OrdersCard';
import { useOrders, type OrderRow } from '@/components/portfolio/useOrders';
import type { AssetType } from '@/types';

/** Varlık sayfası: bu sembol için aktif bekleyen emirler (yoksa hiçbir şey göstermez). */
export default function SymbolOrdersCard({ type, symbol, livePrice }: { type: AssetType; symbol: string; livePrice: number | null }) {
  const { active, refresh } = useOrders();
  const { refresh: refreshPortfolio } = useLivePortfolio();
  const { refreshUser } = useAuth();
  const [pending, setPending] = useState<OrderRow | null>(null);

  const rows = useMemo(() => active.filter((o) => o.assetType === type && o.symbol === symbol.toUpperCase()), [active, type, symbol]);
  if (rows.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<QueueListIcon />}
        title="Bekleyen emirlerin"
        description={`${symbol} için ${rows.length} aktif emir`}
        action={<LinkButton href="/portfolio#bekleyen-emirler" variant="ghost" size="sm">Tümü</LinkButton>}
      />
      <ul className="divide-y divide-line">
        {rows.map((o) => (
          <OrderListRow key={o.id} order={o} livePrice={livePrice} showAvatar={false} onCancel={() => setPending(o)} />
        ))}
      </ul>
      <CancelOrderDialog
        order={pending}
        onClose={() => setPending(null)}
        onCancelled={async () => {
          setPending(null);
          await Promise.all([refresh(), refreshPortfolio(), refreshUser()]);
        }}
      />
    </Card>
  );
}
