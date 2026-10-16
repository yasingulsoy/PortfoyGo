import type { PoolClient } from 'pg';
import { Sandbox, type HistoryRange, type SetWeightsInput, type TradeInput } from '../sandbox/service';
import { SandboxPrices } from '../sandbox/prices';
import { assetKey, maxDrawdownPct, volatilityAnnPct } from '../sandbox/math';

/**
 * Portföy Ligi ↔ sanal portföy motoru (services/sandbox) arasındaki ince adaptör.
 * Lig modülü motoru YALNIZCA buradan çağırır; motor imzası değişirse tek dosya güncellenir.
 *
 * Motor yetki kontrolü YAPMAZ (actorUserId yalnızca işlem defterine yazılır): lig üyeliği, takım üyeliği ve
 * dönem kontrolü (başlamadan / bittikten sonra işlem yok) service.ts'deki assertCanTrade'in işidir.
 */
export const Engine = {
  create(
    args: { name: string; userId: string; startingCash: number; commissionBps: number; leagueId: string; teamId: string | null },
    client?: PoolClient
  ) {
    return Sandbox.create(
      {
        kind: 'league',
        name: args.name,
        userId: args.userId,
        startingCash: args.startingCash,
        commissionBps: args.commissionBps,
        leagueId: args.leagueId,
        teamId: args.teamId,
      },
      client
    );
  },
  trade: (portfolioId: string, actorUserId: string, input: TradeInput) => Sandbox.trade(portfolioId, actorUserId, input),
  setTargetWeights: (portfolioId: string, actorUserId: string, input: SetWeightsInput, dryRun = false) =>
    Sandbox.setTargetWeights(portfolioId, actorUserId, input, { dryRun }),
  valuation: (portfolioId: string) => Sandbox.valuation(portfolioId),
  metrics: (portfolioId: string) => Sandbox.metrics(portfolioId),
  history: (portfolioId: string, range: HistoryRange) => Sandbox.history(portfolioId, range),
  trades: (portfolioId: string, limit = 50) => Sandbox.trades(portfolioId, { limit }),
  freeze: (portfolioId: string, client?: PoolClient) => Sandbox.freeze(portfolioId, client),
  prices: SandboxPrices.getUsdPrices.bind(SandboxPrices),
  assetKey,
  maxDrawdownPct,
  volatilityAnnPct,
};

export type { HistoryRange };
