/**
 * Arena Koçu — bitmiş bir turun KURAL TABANLI (yapay zekâ DEĞİL) değerlendirmesi. SAF modül:
 * veritabanına bağlanmaz, saat okumaz (generated_at hariç); birim testlidir.
 *
 * Girdi: turun pozisyonları (giriş/kapanış tick'i, fiyatlar, SL/TP, tutar, kâr/zarar) ve varsa turun
 * tick başına orta fiyat yolu. Çıktı: 0..100 puan, A..E not, Türkçe içgörüler ve istatistikler.
 *
 * Kurallar (eşikler aşağıda sabit olarak):
 *  TIGHT_STOP          uyarı  SL, girişten en fazla 3 tick sonra tetiklendi
 *  NO_STOP_ON_LOSERS   uyarı  zararla kapanan işlemde SL yoktu
 *  LIQUIDATED          uyarı  pozisyon tutarının tamamını kaybetti
 *  EARLY_PROFIT_TAKING ipucu  kârla kapandı, sonra turun %20'si içinde fiyat kazancın ≥ 2 katı daha lehte gitti (yol gerekir)
 *  OVERTRADING         uyarı  dakikada > 3 işlem
 *  REVENGE_TRADING     uyarı  zarardan sonra ≤ 3 tick içinde ≥ 1,5 kat tutarla yeni işlem
 *  CONCENTRATION       ipucu  bağlanan toplam tutarın > %80'i tek enstrümanda (turda ≥ 2 enstrüman varken)
 *  GOOD_RISK_REWARD    iyi    ortalama kazanç ≥ 1,5 × ortalama kayıp
 *  POOR_RISK_REWARD    ipucu  ortalama kayıp ≥ 1,5 × ortalama kazanç
 *  CONSISTENT_WINS     iyi    ≥ 3 kazanç, kazanma oranı ≥ %60, tek kazanç toplam kazancın ≤ %50'si
 *  STOPS_DISCIPLINE    iyi    her işlemde SL vardı
 *  DID_NOTHING         ipucu  hiç işlem yok
 *
 * Puan (0..100) = risk (35) + disiplin (20) + kalite (20) + sonuç (25). Not: A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, E.
 */

/** Rapor biçimi/kuralları değişince artırılır: önbellekteki eski sürümlü raporlar yeniden hesaplanır */
export const COACH_VERSION = 2;

export const TIGHT_STOP_TICKS = 3;
export const EARLY_EXIT_WINDOW_FRAC = 0.2;
export const EARLY_EXIT_MULT = 2;
export const OVERTRADING_PER_MIN = 3;
export const OVERTRADING_MIN_TRADES = 4;
export const REVENGE_TICKS = 3;
export const REVENGE_MULT = 1.5;
export const CONCENTRATION_SHARE = 0.8;
export const GOOD_RR = 1.5;
export const CONSISTENCY_MIN_WINS = 3;
export const CONSISTENCY_MIN_WIN_RATE = 60;
export const CONSISTENCY_MAX_SINGLE_SHARE = 0.5;

export const SCORE_MAX = { risk: 35, discipline: 20, quality: 20, result: 25 } as const;
/** Sonuç bileşeni: getiri −%2 → 0 puan, +%2 → 25 puan (doğrusal) */
const RESULT_PCT_SPAN = 2;

export type Side = 'long' | 'short';
export type InsightType = 'good' | 'tip' | 'warning';
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';
export type InsightCode =
  | 'TIGHT_STOP'
  | 'NO_STOP_ON_LOSERS'
  | 'LIQUIDATED'
  | 'EARLY_PROFIT_TAKING'
  | 'OVERTRADING'
  | 'REVENGE_TRADING'
  | 'CONCENTRATION'
  | 'GOOD_RISK_REWARD'
  | 'POOR_RISK_REWARD'
  | 'CONSISTENT_WINS'
  | 'STOPS_DISCIPLINE'
  | 'DID_NOTHING';

export interface CoachInsight {
  type: InsightType;
  code: InsightCode;
  title: string;
  /** Gözlem + öneri */
  detail: string;
  /** "Neden önemli?" kısa açıklaması */
  why: string;
  /** İlgili pozisyon kimlikleri (varsa) */
  refs?: string[];
}

export interface TradeRef {
  id: string;
  instrument: string;
  side: Side;
  pnl: number;
}

export interface CoachStats {
  trades: number;
  wins: number;
  losses: number;
  /** yüzde (0..100) */
  win_rate: number;
  avg_hold_s: number;
  /** yüzde (0..100) */
  sl_usage_pct: number;
  tp_usage_pct: number;
  best_trade: TradeRef | null;
  worst_trade: TradeRef | null;
  /** yüzde (0..100), zirveden en büyük düşüş */
  max_drawdown_pct: number;
  trades_per_min: number;
  /** İşlem yapılan enstrüman kodları (ilk kullanım sırasıyla, tekil) */
  instruments_used: string[];
  total_pnl: number;
  return_pct: number;
}

export interface CoachReport {
  version: number;
  round_id: string | null;
  score: number;
  grade: Grade;
  headline: string;
  insights: CoachInsight[];
  stats: CoachStats;
  /** Puan bileşenleri (en fazla: risk 35, discipline 20, quality 20, result 25) */
  breakdown: { risk: number; discipline: number; quality: number; result: number };
  /** Fiyat yolu kullanılabildi mi (erken kâr alma kuralı ve tick bazlı düşüş yalnızca yolla) */
  path_available: boolean;
  generated_at: string;
}

export interface CoachPositionInput {
  id: string;
  instrument: string;
  side: Side;
  amount: number;
  qty: number;
  entry_price: number;
  entry_tick: number;
  stop_loss: number | null;
  take_profit: number | null;
  close_price: number | null;
  close_tick: number | null;
  pnl: number | null;
  close_reason: string | null;
}

export interface CoachRoundInput {
  round_id?: string | null;
  duration_s: number;
  starting_cash: number;
  /** Turdaki enstrümanlar */
  instruments: string[];
  positions: CoachPositionInput[];
  /** Enstrüman → tick başına orta fiyat (uzunluk duration_s + 1) */
  paths?: Map<string, number[]> | Record<string, number[]> | null;
  /** Kayıtlı getiri (yoksa pozisyonlardan hesaplanır) */
  return_pct?: number | null;
  /** Enstrüman kodu → gösterim adı */
  labels?: Record<string, string>;
  now?: Date;
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const dir = (s: Side) => (s === 'long' ? 1 : -1);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const fmt = (n: number, digits = 2) => n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const money = (n: number) => `${fmt(n)} $`;
const ratioText = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

function getPath(paths: CoachRoundInput['paths'], code: string): number[] | null {
  if (!paths) return null;
  const p = paths instanceof Map ? paths.get(code) : paths[code];
  return Array.isArray(p) && p.length > 0 ? p : null;
}

export function gradeFor(score: number): Grade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'E';
}

interface Trade extends CoachPositionInput {
  pnlv: number;
  closeT: number;
}

function normalize(input: CoachRoundInput): Trade[] {
  const T = Math.max(1, Math.floor(input.duration_s));
  return [...input.positions]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.entry_tick - b.p.entry_tick || a.i - b.i)
    .map(({ p }) => {
      const closeT = p.close_tick === null || p.close_tick === undefined ? T : Math.min(T, Math.max(p.entry_tick, p.close_tick));
      let pnlv = p.pnl;
      if (pnlv === null || pnlv === undefined || !Number.isFinite(pnlv)) {
        const path = getPath(input.paths, p.instrument);
        const exit = p.close_price ?? (path ? path[Math.min(closeT, path.length - 1)] : p.entry_price);
        pnlv = Math.max(-p.amount, (exit - p.entry_price) * p.qty * dir(p.side));
      }
      return { ...p, pnlv, closeT };
    });
}

/** Özsermaye eğrisinden en büyük düşüş (%). Yol varsa tick bazlı, yoksa kapanış olaylarına göre. */
export function maxDrawdownPct(input: CoachRoundInput, trades: Trade[] = normalize(input)): number {
  const start = input.starting_cash;
  if (trades.length === 0 || !(start > 0)) return 0;
  const T = Math.max(1, Math.floor(input.duration_s));
  const havePaths = trades.every((t) => getPath(input.paths, t.instrument));
  let peak = start;
  let mdd = 0;
  const visit = (eq: number) => {
    if (eq > peak) peak = eq;
    if (peak > 0) mdd = Math.max(mdd, (peak - eq) / peak);
  };
  if (havePaths) {
    for (let t = 0; t <= T; t++) {
      let eq = start;
      for (const p of trades) {
        if (p.closeT <= t && p.entry_tick <= t) eq += p.pnlv;
        else if (p.entry_tick <= t) {
          const path = getPath(input.paths, p.instrument)!;
          const mid = path[Math.min(t, path.length - 1)];
          eq += Math.max(-p.amount, (mid - p.entry_price) * p.qty * dir(p.side));
        }
      }
      visit(eq);
    }
  } else {
    let eq = start;
    for (const p of [...trades].sort((a, b) => a.closeT - b.closeT)) {
      eq += p.pnlv;
      visit(eq);
    }
  }
  return r2(mdd * 100);
}

// ---------------------------------------------------------------------------
// Ana analiz
// ---------------------------------------------------------------------------

export function analyzeRound(input: CoachRoundInput): CoachReport {
  const T = Math.max(1, Math.floor(input.duration_s));
  const trades = normalize(input);
  const n = trades.length;
  const label = (code: string) => input.labels?.[code] ?? code;
  const pathAvailable = input.instruments.some((c) => getPath(input.paths, c)) || trades.some((t) => getPath(input.paths, t.instrument));

  const wins = trades.filter((t) => t.pnlv > 0);
  const losses = trades.filter((t) => t.pnlv < 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnlv, 0);
  const returnPct =
    input.return_pct !== null && input.return_pct !== undefined && Number.isFinite(input.return_pct)
      ? input.return_pct
      : input.starting_cash > 0
        ? (totalPnl / input.starting_cash) * 100
        : 0;
  const tradesPerMin = n / (T / 60);
  const withSl = trades.filter((t) => t.stop_loss !== null && t.stop_loss !== undefined);
  const withTp = trades.filter((t) => t.take_profit !== null && t.take_profit !== undefined);
  const byPnl = [...trades].sort((a, b) => b.pnlv - a.pnlv);
  const ref = (t: Trade | undefined): TradeRef | null => (t ? { id: t.id, instrument: t.instrument, side: t.side, pnl: r2(t.pnlv) } : null);

  const stats: CoachStats = {
    trades: n,
    wins: wins.length,
    losses: losses.length,
    win_rate: n > 0 ? r1((wins.length / n) * 100) : 0,
    avg_hold_s: n > 0 ? r1(trades.reduce((s, t) => s + (t.closeT - t.entry_tick), 0) / n) : 0,
    sl_usage_pct: n > 0 ? r1((withSl.length / n) * 100) : 0,
    tp_usage_pct: n > 0 ? r1((withTp.length / n) * 100) : 0,
    best_trade: ref(byPnl[0]),
    worst_trade: ref(byPnl[byPnl.length - 1]),
    max_drawdown_pct: maxDrawdownPct(input, trades),
    trades_per_min: r2(tradesPerMin),
    instruments_used: [...new Set(trades.map((t) => t.instrument))],
    total_pnl: r2(totalPnl),
    return_pct: r2(returnPct),
  };

  const insights: CoachInsight[] = [];

  // --- Hiç işlem yok -------------------------------------------------------
  if (n === 0) {
    insights.push({
      type: 'tip',
      code: 'DID_NOTHING',
      title: 'Bu turda işlem açmadın',
      detail:
        'Piyasayı izlemek de öğrenmenin bir parçası. Bir sonraki turda küçük bir tutarla, zarar durdur (stop) ve kâr al seviyesi belirleyerek bir işlem denemeye ne dersin?',
      why: 'Sanal parayla denemek, gerçek parayı riske atmadan deneyim kazanmanın en güvenli yoludur.',
    });
  }

  // --- Sıkı stop ----------------------------------------------------------
  const tight = trades.filter((t) => t.close_reason === 'sl' && t.closeT - t.entry_tick <= TIGHT_STOP_TICKS);
  const slHits = trades.filter((t) => t.close_reason === 'sl');
  if (tight.length > 0) {
    insights.push({
      type: 'warning',
      code: 'TIGHT_STOP',
      title: 'Stopun fiyata çok yakındı',
      detail: `${tight.length} işlemin, açıldıktan en fazla ${TIGHT_STOP_TICKS} saniye sonra zarar durdurdan (stop) kapandı. Stopu biraz daha uzağa koyup işlem tutarını küçültmeyi dene.`,
      why: 'Fiyat her an küçük dalgalanmalar (gürültü) yapar. Stop bu gürültünün içinde kalırsa, fikrin doğru olsa bile işlemden erken atılırsın.',
      refs: tight.map((t) => t.id),
    });
  }

  // --- Zarardaki işlemlerde stop yok --------------------------------------
  const losersNoStop = losses.filter((t) => t.stop_loss === null || t.stop_loss === undefined);
  if (losersNoStop.length > 0) {
    insights.push({
      type: 'warning',
      code: 'NO_STOP_ON_LOSERS',
      title: 'Zarardaki işlemlerinde stop yoktu',
      detail: `Zararla kapanan ${losersNoStop.length} işleminde zarar durdur (stop) tanımlı değildi. İşlemi açarken "en fazla ne kadar kaybetmeye razıyım?" diye sor ve stopu oraya koy.`,
      why: 'Stop, kaybı önceden belirlediğin sınırda tutar. Küçük kayıplar kolayca telafi edilir, büyükleri zordur: %50 kaybettikten sonra başa dönmek için %100 kazanman gerekir.',
      refs: losersNoStop.map((t) => t.id),
    });
  }

  // --- Tasfiye -------------------------------------------------------------
  const liquidated = trades.filter((t) => t.close_reason === 'liquidated');
  if (liquidated.length > 0) {
    insights.push({
      type: 'warning',
      code: 'LIQUIDATED',
      title: 'Bir pozisyonun tamamen eridi',
      detail: `${liquidated.length} pozisyonun, yatırdığın tutarın tamamını kaybederek kapandı. Stop kullanmak bu durumu önler.`,
      why: 'Tek bir işlemde büyük tutarı korumasız bırakmak oyunda kalma şansını azaltır. Profesyoneller işlem başına sermayelerinin yalnızca küçük bir yüzdesini riske eder.',
      refs: liquidated.map((t) => t.id),
    });
  }

  // --- Erken kâr alma (yol gerekir) ---------------------------------------
  const W = Math.max(1, Math.round(T * EARLY_EXIT_WINDOW_FRAC));
  const early: Trade[] = [];
  for (const t of trades) {
    if (!(t.pnlv > 0) || (t.close_reason !== 'manual' && t.close_reason !== 'tp') || t.closeT >= T) continue;
    const path = getPath(input.paths, t.instrument);
    const exit = t.close_price;
    if (!path || exit === null || exit === undefined) continue;
    const captured = dir(t.side) * (exit - t.entry_price);
    if (!(captured > 0)) continue;
    let maxFav = 0;
    for (let k = t.closeT + 1; k <= Math.min(T, t.closeT + W) && k < path.length; k++) {
      maxFav = Math.max(maxFav, dir(t.side) * (path[k] - exit));
    }
    if (maxFav >= EARLY_EXIT_MULT * captured) early.push(t);
  }
  if (early.length > 0) {
    insights.push({
      type: 'tip',
      code: 'EARLY_PROFIT_TAKING',
      title: 'Kârı erken almış olabilirsin',
      detail: `${early.length} kârlı işlemini kapattıktan kısa süre sonra fiyat, kazancının en az ${EARLY_EXIT_MULT} katı kadar daha senin yönünde ilerledi. Bir kâr al (TP) hedefi belirlemek ya da stopu kâra taşıyıp pozisyonu biraz daha tutmak işe yarayabilir.`,
      why: 'Kazançları erken kesip kayıpları uzun tutmak en yaygın yatırımcı hatalarındandır. Kazanan işlemler, kaybedenleri telafi edecek kadar büyümeli.',
      refs: early.map((t) => t.id),
    });
  }

  // --- Aşırı işlem ---------------------------------------------------------
  const overtrading = n >= OVERTRADING_MIN_TRADES && tradesPerMin > OVERTRADING_PER_MIN;
  if (overtrading) {
    insights.push({
      type: 'warning',
      code: 'OVERTRADING',
      title: 'Çok sık işlem yaptın',
      detail: `Dakikada ortalama ${ratioText(tradesPerMin)} işlem açtın (toplam ${n}). Her işlemde alış-satış farkını (spread) ödersin; daha az ama daha iyi düşünülmüş işlemler dene.`,
      why: 'Sık işlem maliyeti artırır ve kararları aceleye getirir. Bir plan yapıp yalnızca plana uyan fırsatlarda işlem açmak daha iyi sonuç verir.',
    });
  }

  // --- İntikam işlemi -----------------------------------------------------
  const revenge = new Set<string>();
  for (const l of losses) {
    for (const t of trades) {
      if (t.id === l.id || revenge.has(t.id)) continue;
      if (t.entry_tick >= l.closeT && t.entry_tick - l.closeT <= REVENGE_TICKS && t.amount >= REVENGE_MULT * l.amount) revenge.add(t.id);
    }
  }
  if (revenge.size > 0) {
    insights.push({
      type: 'warning',
      code: 'REVENGE_TRADING',
      title: 'Kayıptan hemen sonra büyük işlem',
      detail: `${revenge.size} kez, zararla kapanan bir işlemden en fazla ${REVENGE_TICKS} saniye sonra öncekinin en az ${ratioText(REVENGE_MULT)} katı tutarla yeni işlem açtın. Kayıptan sonra kısa bir mola verip planına dön.`,
      why: 'Kaybı hemen "geri almak" için büyütülen işlemler (intikam işlemi) duygusal kararlardır ve kayıpları katlayabilir.',
      refs: [...revenge],
    });
  }

  // --- Yoğunlaşma ----------------------------------------------------------
  const committed = trades.reduce((s, t) => s + t.amount, 0);
  let concentration = false;
  if (n >= 2 && new Set(input.instruments).size >= 2 && committed > 0) {
    const byInst = new Map<string, number>();
    for (const t of trades) byInst.set(t.instrument, (byInst.get(t.instrument) ?? 0) + t.amount);
    const [topCode, topAmt] = [...byInst.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = topAmt / committed;
    if (share > CONCENTRATION_SHARE) {
      concentration = true;
      insights.push({
        type: 'tip',
        code: 'CONCENTRATION',
        title: 'Riskin tek enstrümanda toplandı',
        detail: `İşlemlere ayırdığın toplam tutarın %${Math.round(share * 100)}'i ${label(topCode)} üzerindeydi. Turda başka enstrümanlar da vardı.`,
        why: 'Riski farklı varlıklara dağıtmak (çeşitlendirme), tek bir varlıktaki ani hareketin tüm sonucunu belirlemesini önler.',
      });
    }
  }

  // --- Risk / getiri -------------------------------------------------------
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnlv, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s - t.pnlv, 0) / losses.length : 0;
  const rr = wins.length && losses.length && avgLoss > 0 ? avgWin / avgLoss : null;
  if (rr !== null && rr >= GOOD_RR) {
    insights.push({
      type: 'good',
      code: 'GOOD_RISK_REWARD',
      title: 'Kazançların kayıplarından büyük',
      detail: `Ortalama kazancın (${money(avgWin)}) ortalama kaybının (${money(avgLoss)}) ${ratioText(rr)} katı. Bu oranla, işlemlerin yarısından azını kazansan bile kârda kalabilirsin.`,
      why: 'Risk/getiri oranı başarı oranı kadar önemlidir: 1,5 kat ve üzeri sağlıklı bir stratejinin işaretidir.',
    });
  } else if (rr !== null && rr > 0 && 1 / rr >= GOOD_RR) {
    insights.push({
      type: 'tip',
      code: 'POOR_RISK_REWARD',
      title: 'Kayıpların kazançlarından büyük',
      detail: `Ortalama kaybın (${money(avgLoss)}), ortalama kazancının (${money(avgWin)}) ${ratioText(1 / rr)} katı. Stopunu biraz daha yakına, kâr hedefini biraz daha uzağa koymayı dene.`,
      why: 'Kayıplar kazançlardan büyükse kârda kalmak için işlemlerin çok büyük kısmını kazanman gerekir.',
    });
  }

  // --- İstikrar ------------------------------------------------------------
  const grossProfit = wins.reduce((s, t) => s + t.pnlv, 0);
  const maxWin = wins.reduce((m, t) => Math.max(m, t.pnlv), 0);
  if (
    wins.length >= CONSISTENCY_MIN_WINS &&
    stats.win_rate >= CONSISTENCY_MIN_WIN_RATE &&
    grossProfit > 0 &&
    maxWin / grossProfit <= CONSISTENCY_MAX_SINGLE_SHARE
  ) {
    insights.push({
      type: 'good',
      code: 'CONSISTENT_WINS',
      title: 'İstikrarlı kazançlar',
      detail: `${wins.length} kârlı işlem yaptın (kazanma oranı %${fmt(stats.win_rate, 0)}) ve kazancın tek bir şanslı işleme bağlı değil.`,
      why: 'Tutarlı küçük kazançlar, şansa bağlı tek bir büyük kazançtan daha güvenilir bir beceri göstergesidir.',
    });
  }

  // --- Stop disiplini ------------------------------------------------------
  if (n > 0 && withSl.length === n) {
    insights.push({
      type: 'good',
      code: 'STOPS_DISCIPLINE',
      title: 'Her işlemde stop kullandın',
      detail: 'Açtığın her işlemde zarar durdur (stop) vardı. Riskini baştan belirlemek çok iyi bir alışkanlık.',
      why: 'Stop kullanan yatırımcı en kötü durumda ne kadar kaybedeceğini önceden bilir; bu da sakin karar vermeyi kolaylaştırır.',
    });
  }

  // --- Puan ----------------------------------------------------------------
  let breakdown = { risk: 0, discipline: 0, quality: 0, result: 0 };
  if (n > 0) {
    const risk =
      15 * (withSl.length / n) +
      10 * (losses.length > 0 ? 1 - losersNoStop.length / losses.length : 1) +
      5 * (slHits.length > 0 ? 1 - tight.length / slHits.length : 1) +
      (liquidated.length > 0 ? 0 : 5);
    const pace = overtrading ? Math.max(0, 10 - (tradesPerMin - OVERTRADING_PER_MIN) * 5) : 10;
    const calm = Math.max(0, 10 - 5 * revenge.size);
    const rrScore = wins.length === 0 ? 0 : losses.length === 0 ? 10 : 10 * Math.min(1, (rr ?? 0) / 2);
    const quality = clamp(10 * (wins.length / n) + rrScore - Math.min(4, 2 * early.length) - (concentration ? 3 : 0), 0, SCORE_MAX.quality);
    const result = clamp(SCORE_MAX.result / 2 + (returnPct * SCORE_MAX.result) / (2 * RESULT_PCT_SPAN), 0, SCORE_MAX.result);
    breakdown = { risk: r1(risk), discipline: r1(pace + calm), quality: r1(quality), result: r1(result) };
  }
  const score = clamp(Math.round(breakdown.risk + breakdown.discipline + breakdown.quality + breakdown.result), 0, 100);
  const grade = gradeFor(score);

  const order: Record<InsightType, number> = { good: 0, warning: 1, tip: 2 };
  insights.sort((a, b) => order[a.type] - order[b.type]);

  return {
    version: COACH_VERSION,
    round_id: input.round_id ?? null,
    score,
    grade,
    headline: headlineFor(grade, n),
    insights,
    stats,
    breakdown,
    path_available: pathAvailable,
    generated_at: (input.now ?? new Date()).toISOString(),
  };
}

export function headlineFor(grade: Grade, trades: number): string {
  if (trades === 0) return 'Bu turda hiç işlem açmadın — bir sonrakinde küçük bir adımla başla!';
  switch (grade) {
    case 'A':
      return 'Harika tur! Disiplinli ve akıllıca işlem yaptın.';
    case 'B':
      return 'Çok iyi! Birkaç küçük dokunuşla daha da iyi olabilir.';
    case 'C':
      return 'Fena değil — geliştirebileceğin birkaç nokta var.';
    case 'D':
      return 'Zorlu bir tur oldu; aşağıdaki ipuçları bir sonrakinde işine yarayacak.';
    default:
      return 'Her usta bir zamanlar acemiydi. Aşağıdaki ipuçlarıyla bir sonraki tur daha iyi geçecek.';
  }
}
