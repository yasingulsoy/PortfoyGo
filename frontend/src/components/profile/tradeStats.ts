import type { Transaction } from '@/types';

export interface TradeStats {
  total: number;
  buys: number;
  sells: number;
  /** Ortalama maliyetin üzerinde kapanan satışlar */
  wins: number;
  /** Ortalama maliyetin altında kapanan satışlar */
  losses: number;
  /** Gerçekleşen K/Z (komisyon hariç, yalnızca eşleşebilen satışlar) */
  realized: number;
}

/**
 * İşlem geçmişini kronolojik olarak oynatıp her satışı o andaki ortalama maliyetle
 * karşılaştırır. Alışı geçmişte görünmeyen satışlar (eski kayıtlar) hesaba katılmaz.
 */
export function computeTradeStats(transactions: Transaction[]): TradeStats {
  const ordered = [...transactions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const positions = new Map<string, { qty: number; cost: number }>();
  const stats: TradeStats = { total: transactions.length, buys: 0, sells: 0, wins: 0, losses: 0, realized: 0 };

  for (const t of ordered) {
    const key = `${t.assetType}:${t.symbol}`;
    const pos = positions.get(key) ?? { qty: 0, cost: 0 };
    if (t.type === 'buy') {
      stats.buys += 1;
      pos.qty += t.quantity;
      pos.cost += t.price * t.quantity;
    } else {
      stats.sells += 1;
      if (pos.qty <= 0) continue;
      const qty = Math.min(t.quantity, pos.qty);
      const avg = pos.cost / pos.qty;
      const pnl = (t.price - avg) * qty;
      if (pnl > 0) stats.wins += 1;
      else if (pnl < 0) stats.losses += 1;
      stats.realized += pnl;
      pos.cost -= avg * qty;
      pos.qty -= qty;
    }
    positions.set(key, pos);
  }
  return stats;
}
