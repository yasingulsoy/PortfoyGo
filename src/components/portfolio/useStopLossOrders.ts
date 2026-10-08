'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { stopLossApi } from '@/lib/api';
import type { AssetType, StopLossOrder } from '@/types';

export interface StopLossRow extends StopLossOrder {
  assetType: AssetType | null;
}

const EMPTY: StopLossRow[] = [];

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/** Backend `{ success, stopLossOrders }` döndürür; eski/alternatif zarflar (`orders`, `data`) için de savunmacı davranır. */
function extractOrders(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];
  for (const key of ['stopLossOrders', 'orders', 'data']) {
    const v = body[key];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object' && Array.isArray(v.orders)) return v.orders;
  }
  return [];
}

function mapOrder(o: any): StopLossRow {
  return {
    id: String(o.id),
    portfolio_item_id: String(o.portfolio_item_id ?? ''),
    symbol: String(o.symbol ?? '').toUpperCase(),
    name: o.name ?? undefined,
    assetType: (o.asset_type ?? null) as AssetType | null,
    trigger_price: num(o.trigger_price),
    quantity: num(o.quantity),
    status: String(o.status ?? 'active'),
    created_at: o.created_at,
  };
}

async function fetchOrders(): Promise<StopLossRow[]> {
  const body = await stopLossApi.list();
  return extractOrders(body).map(mapOrder);
}

/** Kullanıcının stop-loss emirleri (aynı SWR anahtarını paylaşan tüm bileşenler tek isteğe bağlanır). */
export function useStopLossOrders() {
  const { data, error, isLoading, mutate } = useSWR<StopLossRow[]>('stop-loss:orders', fetchOrders, {
    refreshInterval: 30_000,
    keepPreviousData: true,
  });
  const orders = data ?? EMPTY;

  const active = useMemo(() => orders.filter((o) => o.status === 'active'), [orders]);
  const history = useMemo(() => orders.filter((o) => o.status !== 'active'), [orders]);
  const activeByItem = useMemo(() => {
    const map = new Map<string, StopLossRow>();
    for (const o of active) map.set(o.portfolio_item_id, o);
    return map;
  }, [active]);

  return { orders, active, history, activeByItem, error, isLoading: isLoading && !data, refresh: mutate };
}
