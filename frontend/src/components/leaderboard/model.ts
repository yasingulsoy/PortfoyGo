import { STARTING_BALANCE } from '@/lib/constants';

export type Board = 'alltime' | 'week';

/** UI'nin kullandığı, sayıları normalize edilmiş liderlik satırı. */
export interface Leader {
  rank: number;
  username: string;
  totalValue: number;
  /** alltime: başlangıçtan bu yana TL; week: bu haftaki TL getiri */
  pl: number;
  plPercent: number;
}

const n = (v: unknown) => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(x) ? x : 0;
};

export function normalizeLeaders(res: any, board: Board): Leader[] {
  const raw: any[] = Array.isArray(res?.leaderboard) ? res.leaderboard : Array.isArray(res?.data) ? res.data : [];
  return raw
    .filter((r) => r && typeof r.username === 'string')
    .map((r, i) => {
      const totalValue = r.total_value != null ? n(r.total_value) : n(r.balance) + n(r.portfolio_value);
      const pl =
        board === 'week'
          ? n(r.week_profit_loss_tl ?? r.total_profit_loss)
          : totalValue - STARTING_BALANCE;
      return {
        rank: r.rank != null ? n(r.rank) : i + 1,
        username: r.username,
        totalValue,
        pl,
        plPercent: n(r.profit_loss_percent),
      };
    });
}

export interface MyRank {
  rank: number | null;
  rankWeek: number | null;
}

export function normalizeMyRank(res: any): MyRank {
  const toRank = (v: unknown) => (v == null || v === '' ? null : n(v) > 0 ? n(v) : null);
  return { rank: toRank(res?.rank), rankWeek: toRank(res?.rankWeek ?? res?.rank_week) };
}

export const BOARD_COPY: Record<Board, { title: string; description: string }> = {
  alltime: {
    title: 'Hesap büyümesi',
    description:
      'Herkes aynı 100.000 TL sanal başlangıçla değerlendirilir; ne zaman kayıt olursan ol, hesabını yüzde kaç büyüttüğüne göre sıralanırsın.',
  },
  week: {
    title: 'Hafta getirisi',
    description:
      'Bu haftaya (Pazartesi) girerkenki toplam varlığına göre elde ettiğin getiri ölçülür; yeni ve eski oyuncular aynı hafta penceresinde kıyaslanır.',
  },
};
