import { Card, CardHeader } from '@/components/ui/Card';
import { formatCompact, formatTRY, formatUSD } from '@/lib/format';
import type { MarketAsset } from '@/types';
import { InformationCircleIcon } from '@heroicons/react/20/solid';

interface Item {
  label: string;
  value: string;
  sub?: string;
}

const valid = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** USD kotasyonlu bir fiyatı TL (varsa) + USD alt satırıyla gösterir. */
function usdPrice(label: string, usd: number | undefined, usdTry: number | null): Item | null {
  if (!valid(usd)) return null;
  return usdTry
    ? { label, value: formatTRY(usd * usdTry, { precise: true }), sub: formatUSD(usd, { precise: true }) }
    : { label, value: formatUSD(usd, { precise: true }) };
}

function usdAmount(label: string, usd: number | undefined, usdTry: number | null): Item | null {
  if (!valid(usd)) return null;
  return usdTry
    ? { label, value: `₺${formatCompact(usd * usdTry)}`, sub: `${formatCompact(usd)} USD` }
    : { label, value: `${formatCompact(usd)} USD` };
}

export function buildKeyStats(asset: MarketAsset, usdTry: number | null): Item[] {
  const items: Array<Item | null> = [];
  if (asset.type === 'stock') {
    items.push(
      usdPrice('Açılış', asset.open, usdTry),
      usdPrice('Gün içi yüksek', asset.high, usdTry),
      usdPrice('Gün içi düşük', asset.low, usdTry),
      usdPrice('Önceki kapanış', asset.previousClose, usdTry),
      valid(asset.volume) ? { label: 'Hacim', value: formatCompact(asset.volume), sub: 'adet' } : null,
      usdAmount('Piyasa değeri', asset.marketCap, usdTry),
    );
  } else if (asset.type === 'crypto') {
    items.push(usdAmount('24 saatlik hacim', asset.volume, usdTry), usdAmount('Piyasa değeri', asset.marketCap, usdTry));
    if (asset.high || asset.low) items.push(usdPrice('24s yüksek', asset.high, usdTry), usdPrice('24s düşük', asset.low, usdTry));
  }
  if (asset.type === 'currency' || asset.type === 'commodity') {
    items.push({ label: 'Kotasyon', value: asset.priceUSD != null ? 'USD (TL’ye çevrilir)' : 'Türk lirası' });
    if (asset.priceUSD != null) items.push({ label: 'USD fiyatı', value: formatUSD(asset.priceUSD, { precise: true }) });
  }
  if (usdTry && (asset.type === 'stock' || asset.type === 'crypto' || asset.priceUSD != null)) {
    items.push({ label: 'Kullanılan USD/TRY', value: usdTry.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) });
  }
  return items.filter((i): i is Item => i !== null);
}

export default function KeyStats({ asset, usdTry }: { asset: MarketAsset; usdTry: number | null }) {
  const items = buildKeyStats(asset, usdTry);
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader icon={<InformationCircleIcon />} title="Önemli veriler" description={asset.type === 'stock' ? 'Son işlem günü' : 'Son 24 saat'} />
      <dl className="grid grid-cols-2 py-1.5 sm:grid-cols-3">
        {items.map((it) => (
          <div key={it.label} className="min-w-0 px-5 py-3">
            <dt className="text-xs text-muted">{it.label}</dt>
            <dd className="num mt-1 truncate text-sm font-semibold" title={it.value}>
              {it.value}
            </dd>
            {it.sub && <dd className="num truncate text-xs text-subtle">{it.sub}</dd>}
          </div>
        ))}
      </dl>
    </Card>
  );
}
