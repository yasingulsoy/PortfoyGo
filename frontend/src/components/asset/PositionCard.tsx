import type { ReactNode } from 'react';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta, Money } from '@portfoygo/shared/ui/Delta';
import Button from '@portfoygo/shared/ui/Button';
import { formatQuantity } from '@portfoygo/shared/format';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import type { LiveHolding } from '@/context/PortfolioContext';

interface Props {
  holding: LiveHolding;
  onSell: () => void;
  onBuy: () => void;
  /** Kart çerçevesi ve başlık olmadan (ör. sekme paneli içinde) */
  bare?: boolean;
}

/** Kullanıcının bu varlıktaki açık pozisyonu (canlı fiyatla değerlenmiş). */
export default function PositionCard({ holding, onSell, onBuy, bare = false }: Props) {
  const dc = useDisplayCurrency();
  const body = (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">Güncel değer</p>
          <p className="num mt-1 truncate text-2xl font-semibold text-fg">{dc.money(holding.liveValue)}</p>
        </div>
        <Delta value={holding.livePLPercent} />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Miktar" value={<span className="num">{formatQuantity(holding.quantity)}</span>} />
        <Tile label="Ortalama maliyet" value={<span className="num">{dc.money(holding.averagePrice, { precise: true })}</span>} />
        <Tile label="Toplam maliyet" value={<span className="num">{dc.money(holding.averagePrice * holding.quantity)}</span>} />
        <Tile label="Kâr / zarar" value={<Money value={dc.convert(holding.livePL)} currency={dc.currency} signed />} />
      </dl>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:flex sm:justify-end">
        <Button variant="secondary" onClick={onSell} className="sm:min-w-28">
          Sat
        </Button>
        <Button variant="primary" onClick={onBuy} className="sm:min-w-28">
          Al
        </Button>
      </div>
    </>
  );

  if (bare) return <div>{body}</div>;

  return (
    <Card>
      <CardHeader title="Pozisyonum" description="Canlı fiyatla değerlenir" />
      <div className="px-5 pb-5 sm:px-6 sm:pb-6">{body}</div>
    </Card>
  );
}

function Tile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line px-4 py-3">
      <dt className="truncate text-xs text-muted">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-fg">{value}</dd>
    </div>
  );
}
