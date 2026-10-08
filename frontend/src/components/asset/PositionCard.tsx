import type { ReactNode } from 'react';
import { BriefcaseIcon } from '@heroicons/react/20/solid';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import { Delta, Money } from '@portfoygo/shared/ui/Delta';
import Button from '@portfoygo/shared/ui/Button';
import { formatQuantity, formatTRY } from '@portfoygo/shared/format';
import type { LiveHolding } from '@/context/PortfolioContext';

/** Kullanıcının bu varlıktaki açık pozisyonu (canlı fiyatla değerlenmiş). */
export default function PositionCard({ holding, onSell, onBuy }: { holding: LiveHolding; onSell: () => void; onBuy: () => void }) {
  return (
    <Card>
      <CardHeader icon={<BriefcaseIcon />} title="Pozisyonun" description="Canlı fiyatla değerlenir" />
      <div className="p-5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">Güncel değer</p>
            <p className="num mt-1 truncate text-2xl font-semibold tracking-tight">{formatTRY(holding.liveValue)}</p>
          </div>
          <Delta value={holding.livePLPercent} />
        </div>

        <dl className="mt-4 space-y-2.5 text-sm">
          <Row label="Miktar" value={<span className="num">{formatQuantity(holding.quantity)}</span>} />
          <Row label="Ortalama maliyet" value={<span className="num">{formatTRY(holding.averagePrice, { precise: true })}</span>} />
          <Row label="Toplam maliyet" value={<span className="num">{formatTRY(holding.averagePrice * holding.quantity)}</span>} />
          <Row label="Kâr / zarar" value={<Money value={holding.livePL} signed className="font-semibold" />} />
        </dl>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="up" onClick={onBuy}>Ekle</Button>
          <Button variant="sell" onClick={onSell}>Sat</Button>
        </div>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
