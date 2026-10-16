import { BanknotesIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid';
import { cn, formatQuantity, formatUSD } from '@portfoygo/shared/format';
import AssetAvatar from '@portfoygo/shared/ui/AssetAvatar';
import { DataTable, TBody, THead, Td, Th, Tr } from '@/components/common/Table';
import { ASSET_TYPE_LABEL, fmtPct, fmtPoints } from './model';
import type { SandboxHolding } from './types';

interface Props {
  holdings: SandboxHolding[];
  cashUsd: number;
  /** yüzde */
  cashWeight: number;
  /** Hedef nakit ağırlığı (yüzde); hedef yoksa null */
  targetCashWeight?: number | null;
  /** Hedef / sapma sütunlarını göster (hedef ağırlık kaydedilmişse) */
  showTargets?: boolean;
  /** Satırdaki "İşlem" düğmesi */
  onSelect?: (h: SandboxHolding) => void;
  label?: string;
  className?: string;
}

/** Sapma tonu: |sapma| < 2 puan nötr, < 5 sarı, üstü kırmızı */
function driftTone(d: number | null): string {
  if (d === null) return 'text-muted';
  const a = Math.abs(d);
  return a < 2 ? 'text-muted' : a < 5 ? 'text-gold' : 'text-down';
}

/**
 * Pozisyon tablosu: miktar, ortalama maliyet, fiyat, değer, ağırlık (hedef / sapma), gerçekleşmemiş K/Z.
 * Nakit son satırdadır. Dar ekranda tablo kendi kabında yatay kayar; ikincil sütunlar gizlenir.
 */
export default function HoldingsTable({ holdings, cashUsd, cashWeight, targetCashWeight = null, showTargets, onSelect, label = 'Pozisyonlar', className }: Props) {
  const targets = showTargets ?? holdings.some((h) => h.target_weight !== null);
  return (
    <DataTable label={label} className={className}>
      <THead>
        <Th>Varlık</Th>
        <Th align="right" className="hidden md:table-cell">
          Miktar
        </Th>
        <Th align="right" className="hidden lg:table-cell">
          Ort. maliyet
        </Th>
        <Th align="right" className="hidden sm:table-cell">
          Fiyat
        </Th>
        <Th align="right">Değer</Th>
        <Th align="right">Ağırlık</Th>
        {targets && (
          <Th align="right" className="hidden sm:table-cell">
            Hedef · sapma
          </Th>
        )}
        <Th align="right" className="hidden md:table-cell">
          K/Z
        </Th>
        {onSelect && <Th align="right">İşlem</Th>}
      </THead>
      <TBody>
        {holdings.map((h) => (
          <Tr key={`${h.asset_type}:${h.symbol}`}>
            <Td>
              <div className="flex min-w-0 items-center gap-2.5">
                <AssetAvatar symbol={h.symbol} type={h.asset_type} size={30} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1 font-medium text-fg">
                    {h.symbol}
                    {h.stale && (
                      <span title="Fiyat güncel değil" className="text-gold">
                        <ExclamationTriangleIcon className="h-3.5 w-3.5" aria-label="Fiyat güncel değil" />
                      </span>
                    )}
                  </p>
                  <p className="max-w-[10rem] truncate text-xs text-muted">
                    {ASSET_TYPE_LABEL[h.asset_type]} · {h.name}
                  </p>
                </div>
              </div>
            </Td>
            <Td align="right" className="num hidden whitespace-nowrap text-muted md:table-cell">
              {formatQuantity(h.quantity)}
            </Td>
            <Td align="right" className="num hidden whitespace-nowrap text-muted lg:table-cell">
              {formatUSD(h.avg_cost_usd, { precise: true })}
            </Td>
            <Td align="right" className="num hidden whitespace-nowrap text-muted sm:table-cell">
              {formatUSD(h.price_usd, { precise: true })}
            </Td>
            <Td align="right" className="num whitespace-nowrap font-medium text-fg">
              {formatUSD(h.value_usd)}
            </Td>
            <Td align="right" className="num whitespace-nowrap text-fg">
              {fmtPct(h.weight)}
            </Td>
            {targets && (
              <Td align="right" className="num hidden whitespace-nowrap sm:table-cell">
                <span className="text-muted">{h.target_weight === null ? '—' : fmtPct(h.target_weight)}</span>
                {h.drift !== null && <span className={cn('ml-1.5 text-xs', driftTone(h.drift))}>{fmtPoints(h.drift, 1)}</span>}
              </Td>
            )}
            <Td align="right" className={cn('num hidden whitespace-nowrap md:table-cell', h.pnl_usd >= 0 ? 'text-up' : 'text-down')}>
              {formatUSD(h.pnl_usd)}
              <span className="ml-1 text-xs">({fmtPct(h.pnl_pct, { sign: true })})</span>
            </Td>
            {onSelect && (
              <Td align="right">
                <button
                  type="button"
                  onClick={() => onSelect(h)}
                  className="h-8 rounded-lg border border-line px-2.5 text-xs font-medium text-fg transition-colors hover:border-brand hover:text-brand"
                  aria-label={`${h.symbol} için işlem`}
                >
                  Al/Sat
                </button>
              </Td>
            )}
          </Tr>
        ))}
        <Tr>
          <Td>
            <div className="flex items-center gap-2.5">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-surface-3 text-muted" aria-hidden="true">
                <BanknotesIcon className="h-4 w-4" />
              </span>
              <div>
                <p className="font-medium text-fg">Nakit</p>
                <p className="text-xs text-muted">USD</p>
              </div>
            </div>
          </Td>
          <Td align="right" className="hidden md:table-cell" />
          <Td align="right" className="hidden lg:table-cell" />
          <Td align="right" className="hidden sm:table-cell" />
          <Td align="right" className="num whitespace-nowrap font-medium text-fg">
            {formatUSD(cashUsd)}
          </Td>
          <Td align="right" className="num whitespace-nowrap text-fg">
            {fmtPct(cashWeight)}
          </Td>
          {targets && (
            <Td align="right" className="num hidden whitespace-nowrap sm:table-cell">
              <span className="text-muted">{targetCashWeight === null ? '—' : fmtPct(targetCashWeight)}</span>
              {targetCashWeight !== null && (
                <span className={cn('ml-1.5 text-xs', driftTone(cashWeight - targetCashWeight))}>{fmtPoints(cashWeight - targetCashWeight, 1)}</span>
              )}
            </Td>
          )}
          <Td align="right" className="hidden md:table-cell" />
          {onSelect && <Td align="right" />}
        </Tr>
      </TBody>
    </DataTable>
  );
}
