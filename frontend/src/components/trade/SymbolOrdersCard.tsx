'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLivePortfolio } from '@/context/PortfolioContext';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { toolbarButtonClass } from '@/components/common/controls';
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
        title="Bekleyen emirlerin"
        description={`${symbol} için ${rows.length} aktif emir`}
        action={
          <Link href="/portfolio#bekleyen-emirler" className={toolbarButtonClass}>
            Tümü
          </Link>
        }
      />
      <ul className="divide-y divide-line border-t border-line">
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
