import crypto from 'crypto';
import pool from '../../config/database';
import { AppSettings } from '../appSettings';
import { GameError, Queryable, istanbulDayStart, nextIstanbulMidnight, withTx } from './common';
import { SLOT, SLOT_PAYTABLE, SLOT_REEL_WEIGHTS, SLOT_SYMBOL_IDS, SLOT_SYMBOL_LABELS, SlotRule, SlotSymbolId } from './config';
import { awardInTx, insertLedger } from './ledger';
import { ResponsiblePlay } from './responsible';

/**
 * Slot Makinesi — "Olasılık dersi" (slot_spins, app_settings; migration 026).
 *
 *  - Sunucu belirler: her makara bağımsız olarak crypto.randomInt ile ağırlığa göre seçilir; istemci yalnızca
 *    sonuca doğru (soldan sağa, sonuçtan bağımsız sabit sürelerle) animasyon yapar. Yakın kaçış (near-miss)
 *    üretilmez, sonuç "süslenmez".
 *  - Bahis düşümü ve kazanç tek transaction'da game_ledger'a yazılır ('slot_bet' −bahis, 'slot_win' +kazanç;
 *    ref = ('slot', request_id)). Aynı request_id tekrar gelirse kayıtlı sonuç döner (jeton ikinci kez düşmez).
 *  - Sınırlar (config SLOT): bahis 5/10/25, çevirmeler arası ≥ 1,5 sn (429 SLOT_COOLDOWN), günde ≤ 100 çevirme
 *    (429 SLOT_DAILY_SPIN_LIMIT), günlük net kayıp ≤ 250 jeton (429 SLOT_DAILY_LOSS_LIMIT, İstanbul gece yarısı
 *    sıfırlanır), her 25 çevirmede durum özeti (onaysız sonraki çevirme 409 SLOT_REALITY_CHECK).
 *  - Sorumlu oyun: 18+ onayı ve kullanıcının kendi molası (403 ADULT_CONFIRM_REQUIRED / ARENA_BREAK); Arena
 *    günlük tur sınırı uygulanmaz.
 *  - Yönetici aç/kapat: app_settings 'slot_enabled' (kapalıyken 410 SLOT_DISABLED).
 *  - Gösterilen olasılıklar, RTP ve kasa avantajı ödeme tablosundan tam sayımla hesaplanır (slotMath()).
 */

export type RandomInt = (maxExclusive: number) => number;
export const cryptoRandomInt: RandomInt = (max) => crypto.randomInt(0, max);

export type ReelWeights = Record<SlotSymbolId, number>;

// ---------------------------------------------------------------------------
// Matematik (saf)
// ---------------------------------------------------------------------------

export function reelTotal(weights: ReelWeights): number {
  return SLOT_SYMBOL_IDS.reduce((s, id) => s + Math.max(0, weights[id] ?? 0), 0);
}

/** Ağırlıklı seçim: rand(toplam) → sembol (sıra = SLOT_SYMBOL_IDS) */
export function pickSymbol(rand: RandomInt, weights: ReelWeights): SlotSymbolId {
  const total = reelTotal(weights);
  let x = rand(total);
  if (!Number.isInteger(x) || x < 0 || x >= total) x = 0;
  for (const id of SLOT_SYMBOL_IDS) {
    const w = Math.max(0, weights[id] ?? 0);
    if (x < w) return id;
    x -= w;
  }
  return SLOT_SYMBOL_IDS[SLOT_SYMBOL_IDS.length - 1];
}

/** Üç makarayı birbirinden bağımsız çevirir (soldan sağa). */
export function spinReels(rand: RandomInt = cryptoRandomInt, reels: ReelWeights[] = SLOT_REEL_WEIGHTS): SlotSymbolId[] {
  return reels.map((w) => pickSymbol(rand, w));
}

const NONE_RULE: SlotRule = { id: 'none', kind: 'none', multiplier: 0 };

/** Ödeme kuralı: ilk eşleşen. 'pair' = TAM OLARAK iki makara aynı (üçlü değil). */
export function evaluateReels(reels: readonly SlotSymbolId[], paytable: SlotRule[] = SLOT_PAYTABLE): SlotRule {
  const [a, b, c] = reels;
  const equal = Number(a === b) + Number(b === c) + Number(a === c);
  for (const rule of paytable) {
    if (rule.kind === 'three' && equal === 3 && a === rule.symbol) return rule;
    if (rule.kind === 'pair' && equal === 1) return rule;
    if (rule.kind === 'none') return rule;
  }
  return NONE_RULE;
}

export interface SlotMath {
  /** Tüm sonuçların ağırlık çarpımı toplamı (= Π makara toplamı) */
  total_ways: number;
  /** kural id → o kuralın uygulandığı sonuçların ağırlık toplamı */
  ways: Record<string, number>;
  /** Teorik geri ödeme (0..1), tam kesir: return_ways / total_ways */
  rtp: number;
  return_ways: number;
  rtp_pct: number;
  house_edge_pct: number;
  hit_rate_pct: number;
  /** Bahis başına çevirme getirisinin standart sapması (bahis katı) */
  stdev: number;
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

/** Tüm sonuçları (makara ağırlıklarıyla) sayarak olasılık ve RTP'yi hesaplar — gösterilen değerler buradan gelir. */
export function computeSlotMath(reels: ReelWeights[] = SLOT_REEL_WEIGHTS, paytable: SlotRule[] = SLOT_PAYTABLE): SlotMath {
  if (reels.length !== 3) throw new Error('Slot: 3 makara bekleniyor');
  const ways: Record<string, number> = {};
  for (const r of paytable) ways[r.id] = 0;
  let total = 0;
  let returnWays = 0;
  let squareWays = 0;
  for (const a of SLOT_SYMBOL_IDS) {
    const wa = reels[0][a] ?? 0;
    if (wa <= 0) continue;
    for (const b of SLOT_SYMBOL_IDS) {
      const wb = reels[1][b] ?? 0;
      if (wb <= 0) continue;
      for (const c of SLOT_SYMBOL_IDS) {
        const wc = reels[2][c] ?? 0;
        if (wc <= 0) continue;
        const w = wa * wb * wc;
        const rule = evaluateReels([a, b, c], paytable);
        ways[rule.id] = (ways[rule.id] ?? 0) + w;
        total += w;
        returnWays += w * rule.multiplier;
        squareWays += w * rule.multiplier * rule.multiplier;
      }
    }
  }
  const rtp = total > 0 ? returnWays / total : 0;
  const hit = total > 0 ? 1 - (ways.none ?? 0) / total : 0;
  const variance = total > 0 ? squareWays / total - rtp * rtp : 0;
  return {
    total_ways: total,
    ways,
    rtp,
    return_ways: returnWays,
    rtp_pct: round4(rtp * 100),
    house_edge_pct: round4((1 - rtp) * 100),
    hit_rate_pct: round4(hit * 100),
    stdev: round4(Math.sqrt(Math.max(0, variance))),
  };
}

let mathCache: SlotMath | null = null;
/** Yapılandırmadan hesaplanan (önbellekli) olasılık özeti */
export function slotMath(): SlotMath {
  mathCache ??= computeSlotMath();
  return mathCache;
}

export interface SlotPaytableRow {
  id: string;
  kind: SlotRule['kind'];
  /** 'three' için sembol, diğerlerinde null */
  symbol: SlotSymbolId | null;
  combo: string;
  multiplier: number;
  /** Bu sonucun ağırlık toplamı / tüm sonuçlar → tam olasılık (ör. 27 / 8000) */
  ways: number;
  total_ways: number;
  probability_pct: number;
}

export function comboLabel(rule: SlotRule): string {
  if (rule.kind === 'three') return `3× ${SLOT_SYMBOL_LABELS[rule.symbol]}`;
  if (rule.kind === 'pair') return 'Herhangi iki aynı sembol';
  return 'Diğer tüm sonuçlar';
}

export function paytableDto(math: SlotMath = slotMath(), paytable: SlotRule[] = SLOT_PAYTABLE): SlotPaytableRow[] {
  return paytable.map((r) => {
    const w = math.ways[r.id] ?? 0;
    return {
      id: r.id,
      kind: r.kind,
      symbol: r.kind === 'three' ? r.symbol : null,
      combo: comboLabel(r),
      multiplier: r.multiplier,
      ways: w,
      total_ways: math.total_ways,
      probability_pct: math.total_ways > 0 ? round4((w / math.total_ways) * 100) : 0,
    };
  });
}

/** Teorik beklenen net (jeton): −kasa avantajı × toplam bahis (yuvarlanmış) */
export function expectedNet(wagered: number, math: SlotMath = slotMath()): number {
  const v = Math.round(-wagered * (1 - math.rtp));
  return v === 0 ? 0 : v;
}

// ---------------------------------------------------------------------------
// Durum (bugün / tüm zamanlar / oturum) ve sınırlar
// ---------------------------------------------------------------------------

export interface SlotTotals {
  spins: number;
  wagered: number;
  won: number;
  net: number;
}

export interface SlotLifetime extends SlotTotals {
  realized_rtp_pct: number | null;
}

export interface SlotSession extends SlotTotals {
  expected_net: number;
  started_at: string | null;
  /** Durum özeti bekleniyor: sonraki çevirme reality_check_ack:true ile gönderilmeli */
  reality_check_due: boolean;
}

export interface SlotLimits {
  bets: number[];
  max_spins_per_day: number;
  daily_loss_cap: number;
  min_interval_ms: number;
  reality_check_every: number;
  spins_left_today: number;
  loss_remaining_today: number;
  /** Şu an yapılabilecek en büyük bahis (sınırlar ve bakiye; hiçbiri yoksa null) */
  max_bet_now: number | null;
  resets_at: string;
  next_spin_at: string | null;
}

export interface SlotStats {
  today: SlotTotals;
  lifetime: SlotLifetime;
  session: SlotSession;
}

interface RawState {
  coins: number;
  today: SlotTotals;
  lifetime: SlotTotals;
  session: SlotTotals & { started_at: string | null };
  lastAt: number | null;
}

const totals = (spins: number, wagered: number, won: number): SlotTotals => ({ spins, wagered, won, net: won - wagered });
const addSpin = (t: SlotTotals, bet: number, win: number): SlotTotals => totals(t.spins + 1, t.wagered + bet, t.won + win);

async function loadState(db: Queryable, userId: string, now: Date): Promise<RawState> {
  const dayStart = istanbulDayStart(now);
  // Sıralı: db bir transaction istemcisi olabilir (aynı istemcide eşzamanlı sorgu yok)
  const agg = await db.query(
    `SELECT COUNT(*)::int AS spins, COALESCE(SUM(bet), 0)::bigint AS wagered, COALESCE(SUM(win), 0)::bigint AS won,
            COUNT(*) FILTER (WHERE created_at >= $2)::int AS spins_today,
            COALESCE(SUM(bet) FILTER (WHERE created_at >= $2), 0)::bigint AS wagered_today,
            COALESCE(SUM(win) FILTER (WHERE created_at >= $2), 0)::bigint AS won_today,
            MAX(created_at) AS last_at
       FROM slot_spins WHERE user_id = $1`,
    [userId, dayStart]
  );
  // Oturum: aralarında ≤ sessionGapMs olan son çevirmeler (en fazla 3 gün geriye)
  const recent = await db.query(
    `SELECT bet, win, created_at FROM slot_spins
      WHERE user_id = $1 AND created_at > $2
      ORDER BY created_at DESC, id DESC LIMIT 1000`,
    [userId, new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)]
  );
  const user = await db.query(`SELECT coins FROM users WHERE id = $1`, [userId]);
  const a = agg.rows[0] ?? {};
  let prev = now.getTime();
  let sSpins = 0;
  let sWagered = 0;
  let sWon = 0;
  let startedAt: string | null = null;
  for (const row of recent.rows) {
    const t = new Date(row.created_at).getTime();
    if (prev - t > SLOT.sessionGapMs) break;
    sSpins += 1;
    sWagered += Number(row.bet);
    sWon += Number(row.win);
    startedAt = new Date(t).toISOString();
    prev = t;
  }
  const lastAt = a.last_at ? new Date(a.last_at).getTime() : null;
  return {
    coins: Number(user.rows[0]?.coins ?? 0),
    today: totals(Number(a.spins_today ?? 0), Number(a.wagered_today ?? 0), Number(a.won_today ?? 0)),
    lifetime: totals(Number(a.spins ?? 0), Number(a.wagered ?? 0), Number(a.won ?? 0)),
    session: { ...totals(sSpins, sWagered, sWon), started_at: startedAt },
    lastAt,
  };
}

function realityDue(spins: number): boolean {
  return spins > 0 && spins % SLOT.realityCheckEvery === 0;
}

function statsOf(s: RawState): SlotStats {
  const lt = s.lifetime;
  return {
    today: s.today,
    lifetime: { ...lt, realized_rtp_pct: lt.wagered > 0 ? round4((lt.won / lt.wagered) * 100) : null },
    session: { ...s.session, expected_net: expectedNet(s.session.wagered), reality_check_due: realityDue(s.session.spins) },
  };
}

/** Kalan net kayıp hakkı: günlük sınır + bugünkü net (kazançlıysa hak büyür) */
export function lossRemaining(today: SlotTotals): number {
  return Math.max(0, SLOT.dailyLossCap + today.net);
}

function limitsOf(s: RawState, now: Date): SlotLimits {
  const spinsLeft = Math.max(0, SLOT.maxSpinsPerDay - s.today.spins);
  const lossLeft = lossRemaining(s.today);
  const allowed = SLOT.bets.filter((b) => b <= lossLeft && b <= s.coins);
  const nextAt = s.lastAt !== null ? s.lastAt + SLOT.minIntervalMs : null;
  return {
    bets: [...SLOT.bets],
    max_spins_per_day: SLOT.maxSpinsPerDay,
    daily_loss_cap: SLOT.dailyLossCap,
    min_interval_ms: SLOT.minIntervalMs,
    reality_check_every: SLOT.realityCheckEvery,
    spins_left_today: spinsLeft,
    loss_remaining_today: lossLeft,
    max_bet_now: spinsLeft > 0 && allowed.length > 0 ? Math.max(...allowed) : null,
    resets_at: nextIstanbulMidnight(now).toISOString(),
    next_spin_at: nextAt !== null && nextAt > now.getTime() ? new Date(nextAt).toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// Geçmiş (kümülatif getiri grafiği için örneklenmiş noktalar)
// ---------------------------------------------------------------------------

export interface SlotHistoryPoint {
  /** Kaçıncı çevirme (1'den) */
  n: number;
  /** O ana kadar toplam bahis / kazanç */
  wagered: number;
  won: number;
}

export const HISTORY_MAX_POINTS = 200;

async function historyOf(db: Queryable, userId: string, totalSpins: number): Promise<SlotHistoryPoint[]> {
  if (totalSpins <= 0) return [];
  const step = Math.max(1, Math.ceil(totalSpins / HISTORY_MAX_POINTS));
  const r = await db.query(
    `SELECT n, wagered, won FROM (
       SELECT row_number() OVER w AS n, SUM(bet) OVER w AS wagered, SUM(win) OVER w AS won
         FROM slot_spins WHERE user_id = $1
       WINDOW w AS (ORDER BY created_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
     ) s
     WHERE n % $2 = 0 OR n = $3 OR n = 1
     ORDER BY n`,
    [userId, step, totalSpins]
  );
  return r.rows.map((x: any) => ({ n: Number(x.n), wagered: Number(x.wagered), won: Number(x.won) }));
}

// ---------------------------------------------------------------------------
// Açık / kapalı
// ---------------------------------------------------------------------------

export const SLOT_ENABLED_ENV = 'SLOT_ENABLED_DEFAULT';

export async function slotFlag(db: Queryable = pool) {
  return AppSettings.flag(SLOT.settingKey, SLOT_ENABLED_ENV, db);
}

function disabledError(): GameError {
  return new GameError(410, 'Slot Makinesi şu an kapalı.', 'SLOT_DISABLED', { enabled: false });
}

// ---------------------------------------------------------------------------
// Servis
// ---------------------------------------------------------------------------

export interface SlotSpinInput {
  bet: number;
  request_id: string;
  /** Durum özeti (her 25 çevirme) görüldü ve "Devam" seçildi */
  reality_check_ack?: boolean;
}

export interface SlotSpinResult {
  request_id: string;
  replayed: boolean;
  reels: SlotSymbolId[];
  combo: { id: string; label: string; multiplier: number };
  bet: number;
  win: number;
  net: number;
  balance: number;
  stats: SlotStats;
  limits: SlotLimits;
  /** Bu çevirme oturumdaki 25., 50. … çevirmeyse durum özeti */
  reality_check: { spins: number; wagered: number; won: number; net: number; expected_net: number } | null;
}

function ruleById(id: string): SlotRule {
  return SLOT_PAYTABLE.find((r) => r.id === id) ?? NONE_RULE;
}

function realityPayload(session: SlotTotals) {
  return { spins: session.spins, wagered: session.wagered, won: session.won, net: session.net, expected_net: expectedNet(session.wagered) };
}

export class Slot {
  static async info(userId: string, now: Date = new Date()) {
    const flag = await slotFlag();
    if (!flag.enabled) throw disabledError();
    const state = await loadState(pool, userId, now);
    const math = slotMath();
    const stats = statsOf(state);
    return {
      enabled: true,
      symbols: SLOT_SYMBOL_IDS.map((id) => ({ id, label: SLOT_SYMBOL_LABELS[id] })),
      reel_weights: SLOT_REEL_WEIGHTS.map((w) => SLOT_SYMBOL_IDS.map((id) => ({ symbol: id, weight: w[id] ?? 0, total: reelTotal(w) }))),
      bets: [...SLOT.bets],
      paytable: paytableDto(math),
      rtp_pct: math.rtp_pct,
      house_edge_pct: math.house_edge_pct,
      hit_rate_pct: math.hit_rate_pct,
      stdev: math.stdev,
      celebrate_net_multiple: SLOT.celebrateNetMultiple,
      limits: limitsOf(state, now),
      coins: state.coins,
      today: stats.today,
      lifetime: stats.lifetime,
      session: stats.session,
      history: await historyOf(pool, userId, state.lifetime.spins),
      disclaimer: SLOT.disclaimer,
    };
  }

  static async spin(userId: string, input: SlotSpinInput, opts: { rand?: RandomInt; now?: Date } = {}): Promise<SlotSpinResult> {
    const now = opts.now ?? new Date();
    const bet = Math.trunc(Number(input.bet));
    if (!SLOT.bets.includes(bet)) {
      throw new GameError(400, `Bahis ${SLOT.bets.join(', ')} jetondan biri olmalı`, 'INVALID_BET', { bets: [...SLOT.bets] });
    }
    const requestId = String(input.request_id);

    // Aynı istek tekrar geldiyse (ağ hatası sonrası yeniden deneme) kayıtlı sonucu döndür
    const replay = await Slot.replay(pool, userId, requestId, bet, now);
    if (replay) return replay;

    if (!(await slotFlag()).enabled) throw disabledError();
    await ResponsiblePlay.assertAdultAndNoBreak(userId, pool, now);

    return withTx(null, async (c) => {
      // Kullanıcı satırı kilidi: aynı kullanıcının çevirmeleri sıraya girer (bekleme süresi / sınırlar tutarlı)
      const locked = await c.query(`SELECT coins FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      if (!locked.rows[0]) throw new GameError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');

      const again = await Slot.replay(c, userId, requestId, bet, now);
      if (again) return again;

      const state = await loadState(c, userId, now);
      const limits = limitsOf(state, now);

      if (state.lastAt !== null && now.getTime() - state.lastAt < SLOT.minIntervalMs) {
        const retry = SLOT.minIntervalMs - (now.getTime() - state.lastAt);
        throw new GameError(429, 'Biraz yavaş: iki çevirme arasında en az 1,5 saniye olmalı.', 'SLOT_COOLDOWN', {
          retry_after_ms: retry,
          next_spin_at: new Date(state.lastAt + SLOT.minIntervalMs).toISOString(),
        });
      }
      if (state.today.spins >= SLOT.maxSpinsPerDay) {
        throw new GameError(429, `Bugünkü ${SLOT.maxSpinsPerDay} çevirme hakkını kullandın. Yarın görüşmek üzere!`, 'SLOT_DAILY_SPIN_LIMIT', {
          limit: SLOT.maxSpinsPerDay,
          spins_today: state.today.spins,
          resets_at: limits.resets_at,
        });
      }
      if (bet > limits.loss_remaining_today) {
        const maxBet = SLOT.bets.filter((b) => b <= limits.loss_remaining_today);
        throw new GameError(
          429,
          maxBet.length > 0
            ? `Bu bahis günlük ${SLOT.dailyLossCap} jetonluk kayıp sınırını aşabilir. En fazla ${Math.max(...maxBet)} jetonluk bahis yapabilirsin.`
            : `Bugünkü ${SLOT.dailyLossCap} jetonluk kayıp sınırına ulaştın. Slot gece yarısı (İstanbul) yeniden açılır.`,
          'SLOT_DAILY_LOSS_LIMIT',
          {
            cap: SLOT.dailyLossCap,
            net_today: state.today.net,
            loss_remaining: limits.loss_remaining_today,
            max_bet: maxBet.length > 0 ? Math.max(...maxBet) : null,
            resets_at: limits.resets_at,
          }
        );
      }
      if (realityDue(state.session.spins) && input.reality_check_ack !== true) {
        throw new GameError(409, 'Devam etmeden önce oturum özetine bir göz at.', 'SLOT_REALITY_CHECK', {
          session: realityPayload(state.session),
        });
      }

      const debit = await c.query(`UPDATE users SET coins = coins - $2 WHERE id = $1 AND coins >= $2 RETURNING coins`, [userId, bet]);
      if (debit.rows.length === 0) {
        throw new GameError(400, 'Yeterli jetonun yok.', 'INSUFFICIENT_COINS', { coins: state.coins, bet });
      }
      const ref = { ref_type: 'slot', ref_id: requestId };
      const inserted = await insertLedger(c, userId, { coins: -bet, xp: 0, reason: SLOT.ledger.bet, ...ref });
      if (!inserted) throw new GameError(409, 'Bu çevirme zaten işlendi.', 'SLOT_REQUEST_CONFLICT');

      const reels = spinReels(opts.rand ?? cryptoRandomInt);
      const rule = evaluateReels(reels);
      const win = bet * rule.multiplier;
      let balance = Number(debit.rows[0].coins);
      if (win > 0) {
        const credited = await awardInTx(c, userId, { coins: win, reason: SLOT.ledger.win, ...ref });
        balance = credited.balance.coins;
      }

      await c.query(
        `INSERT INTO slot_spins (user_id, request_id, bet, win, reels, combo, multiplier, balance_after, reality_ack, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)`,
        [userId, requestId, bet, win, JSON.stringify(reels), rule.id, rule.multiplier, balance, input.reality_check_ack === true, now]
      );

      const after: RawState = {
        coins: balance,
        today: addSpin(state.today, bet, win),
        lifetime: addSpin(state.lifetime, bet, win),
        session: { ...addSpin(state.session, bet, win), started_at: state.session.started_at ?? now.toISOString() },
        lastAt: now.getTime(),
      };
      return {
        request_id: requestId,
        replayed: false,
        reels,
        combo: { id: rule.id, label: comboLabel(rule), multiplier: rule.multiplier },
        bet,
        win,
        net: win - bet,
        balance,
        stats: statsOf(after),
        limits: limitsOf(after, now),
        reality_check: realityDue(after.session.spins) ? realityPayload(after.session) : null,
      };
    });
  }

  /** Kayıtlı çevirme (aynı request_id) → aynı sonuç; farklı bahisle tekrar kullanılırsa 409. */
  private static async replay(db: Queryable, userId: string, requestId: string, bet: number, now: Date): Promise<SlotSpinResult | null> {
    const r = await db.query(`SELECT bet, win, reels, combo FROM slot_spins WHERE user_id = $1 AND request_id = $2`, [userId, requestId]);
    const row = r.rows[0];
    if (!row) return null;
    if (Number(row.bet) !== bet) {
      throw new GameError(409, 'Bu istek kimliği farklı bir bahisle zaten kullanıldı.', 'SLOT_REQUEST_CONFLICT');
    }
    const state = await loadState(db, userId, now);
    const rule = ruleById(String(row.combo));
    const reels = (typeof row.reels === 'string' ? JSON.parse(row.reels) : row.reels) as SlotSymbolId[];
    const win = Number(row.win);
    return {
      request_id: requestId,
      replayed: true,
      reels,
      combo: { id: rule.id, label: comboLabel(rule), multiplier: rule.multiplier },
      bet: Number(row.bet),
      win,
      net: win - Number(row.bet),
      balance: state.coins,
      stats: statsOf(state),
      limits: limitsOf(state, now),
      reality_check: null,
    };
  }

  // -------------------------------------------------------------------------
  // Yönetici
  // -------------------------------------------------------------------------

  static async adminSummary(now: Date = new Date()) {
    const flag = await slotFlag();
    const math = slotMath();
    const dayStart = istanbulDayStart(now);
    const weekStart = new Date(dayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
    const minBet = Math.min(...SLOT.bets);
    const [agg, capped] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS spins, COUNT(DISTINCT user_id)::int AS players,
                COALESCE(SUM(bet), 0)::bigint AS wagered, COALESCE(SUM(win), 0)::bigint AS won,
                COUNT(*) FILTER (WHERE created_at >= $1)::int AS spins_today,
                COUNT(DISTINCT user_id) FILTER (WHERE created_at >= $1)::int AS players_today,
                COALESCE(SUM(bet) FILTER (WHERE created_at >= $1), 0)::bigint AS wagered_today,
                COALESCE(SUM(win) FILTER (WHERE created_at >= $1), 0)::bigint AS won_today,
                COUNT(*) FILTER (WHERE created_at >= $2)::int AS spins_7d,
                COALESCE(SUM(bet) FILTER (WHERE created_at >= $2), 0)::bigint AS wagered_7d,
                COALESCE(SUM(win) FILTER (WHERE created_at >= $2), 0)::bigint AS won_7d
           FROM slot_spins`,
        [dayStart, weekStart]
      ),
      // Bugün kayıp sınırı yüzünden artık bahis yapamayanlar (kalan hak < en küçük bahis)
      pool.query(
        `SELECT COUNT(*)::int AS n FROM (
           SELECT user_id FROM slot_spins WHERE created_at >= $1 GROUP BY user_id
           HAVING $2::int + SUM(win) - SUM(bet) < $3::int
         ) x`,
        [dayStart, SLOT.dailyLossCap, minBet]
      ),
    ]);
    const a = agg.rows[0] ?? {};
    const period = (spins: number, wagered: number, won: number) => ({
      spins,
      wagered,
      won,
      house_net: wagered - won,
      realized_rtp_pct: wagered > 0 ? round4((won / wagered) * 100) : null,
    });
    return {
      enabled: flag.enabled,
      source: flag.source,
      updated_at: flag.row?.updated_at ?? null,
      updated_by_username: flag.row?.updated_by_username ?? null,
      default_enabled: flag.source === 'default' ? flag.enabled : null,
      config: {
        rtp_pct: math.rtp_pct,
        house_edge_pct: math.house_edge_pct,
        hit_rate_pct: math.hit_rate_pct,
        bets: [...SLOT.bets],
        max_spins_per_day: SLOT.maxSpinsPerDay,
        daily_loss_cap: SLOT.dailyLossCap,
        min_interval_ms: SLOT.minIntervalMs,
        reality_check_every: SLOT.realityCheckEvery,
      },
      total: { ...period(Number(a.spins ?? 0), Number(a.wagered ?? 0), Number(a.won ?? 0)), players: Number(a.players ?? 0) },
      today: {
        ...period(Number(a.spins_today ?? 0), Number(a.wagered_today ?? 0), Number(a.won_today ?? 0)),
        players: Number(a.players_today ?? 0),
        players_at_loss_cap: Number(capped.rows[0]?.n ?? 0),
      },
      last_7d: period(Number(a.spins_7d ?? 0), Number(a.wagered_7d ?? 0), Number(a.won_7d ?? 0)),
    };
  }

  /** Yönetici aç/kapat. Önceki değeri (etkin hâli) döndürür. */
  static async setEnabled(enabled: boolean, adminId: string | null): Promise<{ enabled: boolean; previous: boolean }> {
    const before = await slotFlag();
    await AppSettings.set(SLOT.settingKey, enabled, adminId);
    return { enabled, previous: before.enabled };
  }
}
