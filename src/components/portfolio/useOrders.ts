'use client';

import { useMemo } from 'react';
import useSWR, { mutate } from 'swr';
import { ordersApi, type OrderSide, type OrderType } from '@/lib/api';
import type { AssetType } from '@/types';

export type { OrderSide, OrderType };
export type OrderStatus = 'active' | 'filled' | 'cancelled' | 'expired' | 'failed';

export interface OrderRow {
  id: string;
  assetType: AssetType;
  symbol: string;
  name: string | null;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  triggerPrice: number;
  status: OrderStatus;
  reservedCash: number;
  filledPrice: number | null;
  filledQuantity: number | null;
  filledAt: string | null;
  failReason: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Tüm bileşenler aynı anahtarı paylaşır (tek istek, ortak önbellek). */
export const ORDERS_KEY = 'orders:list';

/** Emir oluşturan/iptal eden yerlerden listeyi yenilemek için. */
export function refreshOrders() {
  return mutate(ORDERS_KEY);
}

export const ORDER_TYPE_LABEL: Record<`${OrderSide}:${OrderType}`, string> = {
  'buy:limit': 'Limit alış',
  'sell:limit': 'Limit satış',
  'sell:stop_loss': 'Zarar durdur',
  'sell:take_profit': 'Kâr al',
  'buy:stop_loss': 'Zarar durdur',
  'buy:take_profit': 'Kâr al',
};

export const orderLabel = (o: Pick<OrderRow, 'side' | 'type'>) => ORDER_TYPE_LABEL[`${o.side}:${o.type}`] ?? o.type;

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: 'up' | 'down' | 'neutral' | 'brand' | 'gold' }> = {
  active: { label: 'Aktif', tone: 'brand' },
  filled: { label: 'Gerçekleşti', tone: 'up' },
  cancelled: { label: 'İptal edildi', tone: 'neutral' },
  expired: { label: 'Süresi doldu', tone: 'gold' },
  failed: { label: 'Başarısız', tone: 'down' },
};

/** "a:b" anahtarı — pozisyonlarla eşleştirmek için (emirlerde portföy öğesi ID'si yok). */
export const holdingKey = (assetType: AssetType, symbol: string) => `${assetType}:${symbol.toUpperCase()}`;

/** Canlı fiyata göre tetiklemeye uzaklık (%): pozitif → fiyatın yükselmesi gerekir. */
export function distanceToTrigger(o: Pick<OrderRow, 'triggerPrice'>, livePrice: number | null | undefined): number | null {
  if (!livePrice || livePrice <= 0) return null;
  return ((o.triggerPrice - livePrice) / livePrice) * 100;
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : num(v));
const strOrNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));

function mapOrder(o: any): OrderRow {
  return {
    id: String(o.id),
    assetType: (o.asset_type ?? 'stock') as AssetType,
    symbol: String(o.symbol ?? '').toUpperCase(),
    name: o.name ?? null,
    side: o.side === 'buy' ? 'buy' : 'sell',
    type: (o.type ?? 'limit') as OrderType,
    quantity: num(o.quantity),
    triggerPrice: num(o.trigger_price),
    status: (o.status ?? 'active') as OrderStatus,
    reservedCash: num(o.reserved_cash),
    filledPrice: numOrNull(o.filled_price),
    filledQuantity: numOrNull(o.filled_quantity),
    filledAt: strOrNull(o.filled_at),
    failReason: strOrNull(o.fail_reason),
    expiresAt: strOrNull(o.expires_at),
    createdAt: String(o.created_at ?? ''),
    updatedAt: String(o.updated_at ?? o.created_at ?? ''),
  };
}

const extract = (body: any): any[] => (Array.isArray(body?.orders) ? body.orders : Array.isArray(body) ? body : []);

async function fetchOrders(): Promise<{ active: OrderRow[]; history: OrderRow[] }> {
  const [active, history] = await Promise.all([ordersApi.list('active'), ordersApi.list('history')]);
  return { active: extract(active).map(mapOrder), history: extract(history).map(mapOrder) };
}

const EMPTY: OrderRow[] = [];

/** Kullanıcının bekleyen ve geçmiş emirleri. */
export function useOrders() {
  const { data, error, isLoading, mutate: revalidate } = useSWR(ORDERS_KEY, fetchOrders, {
    refreshInterval: 30_000,
    keepPreviousData: true,
  });
  const active = data?.active ?? EMPTY;
  const history = data?.history ?? EMPTY;

  /** Pozisyon anahtarı (holdingKey) → o varlıktaki aktif SATIŞ emirleri (tetiklemeye göre sıralı) */
  const activeSellByHolding = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    for (const o of active) {
      if (o.side !== 'sell') continue;
      const key = holdingKey(o.assetType, o.symbol);
      const list = map.get(key);
      if (list) list.push(o);
      else map.set(key, [o]);
    }
    for (const list of map.values()) list.sort((a, b) => b.triggerPrice - a.triggerPrice);
    return map;
  }, [active]);

  const reservedTotal = useMemo(() => active.reduce((s, o) => s + o.reservedCash, 0), [active]);

  return {
    active,
    history,
    activeSellByHolding,
    reservedTotal,
    error,
    isLoading: isLoading && !data,
    refresh: revalidate,
  };
}
