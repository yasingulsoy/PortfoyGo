// Slot Makinesi — "Olasılık dersi": sözleşme normalleştiricileri ve saf yardımcılar (React / fetch yok; model.test.ts).

import type {
  SlotComboKind,
  SlotHistoryPoint,
  SlotInfo,
  SlotLifetime,
  SlotLimits,
  SlotPaytableRow,
  SlotRealityCheck,
  SlotReelWeight,
  SlotSession,
  SlotSpinResult,
  SlotSymbol,
  SlotSymbolId,
  SlotTotals,
} from '@/types';

export const SLOT_PATH = '/oyun/slot';

/** Sembollerin sabit sırası (makara şeridi dolgusu bu sırayla döner; sonuçtan bağımsız). */
export const SLOT_SYMBOL_ORDER: readonly SlotSymbolId[] = ['ayi', 'dolar', 'petrol', 'boga', 'altin', 'bitcoin', 'roket', 'yildiz'];

export const SLOT_SYMBOL_LABELS: Record<SlotSymbolId, string> = {
  ayi: 'Ayı',
  dolar: 'Dolar',
  petrol: 'Petrol varili',
  boga: 'Boğa',
  altin: 'Altın külçe',
  bitcoin: 'Bitcoin',
  roket: 'Roket',
  yildiz: 'Yıldız',
};

const isSymbol = (v: unknown): v is SlotSymbolId => typeof v === 'string' && (SLOT_SYMBOL_ORDER as readonly string[]).includes(v);

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const optNum = (v: unknown): number | null => {
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const int = (v: unknown) => Math.max(0, Math.floor(num(v)));

// ---------------------------------------------------------------------------
// Normalleştiriciler
// ---------------------------------------------------------------------------

export function toSlotTotals(raw: any): SlotTotals {
  const wagered = int(raw?.wagered);
  const won = int(raw?.won);
  return { spins: int(raw?.spins), wagered, won, net: won - wagered };
}

export function toSlotLifetime(raw: any): SlotLifetime {
  return { ...toSlotTotals(raw), realized_rtp_pct: optNum(raw?.realized_rtp_pct) };
}

export function toSlotSession(raw: any): SlotSession {
  return {
    ...toSlotTotals(raw),
    expected_net: Math.round(num(raw?.expected_net)),
    started_at: str(raw?.started_at),
    reality_check_due: raw?.reality_check_due === true,
  };
}

const KINDS: readonly SlotComboKind[] = ['three', 'pair', 'none'];

export function toPaytableRow(raw: any, i = 0): SlotPaytableRow {
  const kind = KINDS.includes(raw?.kind) ? (raw.kind as SlotComboKind) : 'none';
  return {
    id: String(raw?.id ?? `row-${i}`),
    kind,
    symbol: isSymbol(raw?.symbol) ? raw.symbol : null,
    combo: String(raw?.combo ?? ''),
    multiplier: Math.max(0, num(raw?.multiplier)),
    ways: int(raw?.ways),
    total_ways: int(raw?.total_ways),
    probability_pct: Math.max(0, num(raw?.probability_pct)),
  };
}

export function toSlotLimits(raw: any): SlotLimits {
  const bets = Array.isArray(raw?.bets) ? raw.bets.map((b: unknown) => int(b)).filter((b: number) => b > 0) : [];
  return {
    bets,
    max_spins_per_day: int(raw?.max_spins_per_day),
    daily_loss_cap: int(raw?.daily_loss_cap),
    min_interval_ms: int(raw?.min_interval_ms) || 1500,
    reality_check_every: int(raw?.reality_check_every),
    spins_left_today: int(raw?.spins_left_today),
    loss_remaining_today: int(raw?.loss_remaining_today),
    max_bet_now: optNum(raw?.max_bet_now),
    resets_at: str(raw?.resets_at),
    next_spin_at: str(raw?.next_spin_at),
  };
}

function toHistory(raw: unknown): SlotHistoryPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => ({ n: int(p?.n), wagered: int(p?.wagered), won: int(p?.won) }))
    .filter((p) => p.n > 0)
    .sort((a, b) => a.n - b.n);
}

export function toSlotInfo(raw: any): SlotInfo {
  const symbols: SlotSymbol[] = Array.isArray(raw?.symbols)
    ? raw.symbols.filter((s: any) => isSymbol(s?.id)).map((s: any) => ({ id: s.id as SlotSymbolId, label: String(s.label ?? SLOT_SYMBOL_LABELS[s.id as SlotSymbolId]) }))
    : [];
  const reelWeights: SlotReelWeight[][] = Array.isArray(raw?.reel_weights)
    ? raw.reel_weights.map((reel: any) =>
        Array.isArray(reel) ? reel.filter((w: any) => isSymbol(w?.symbol)).map((w: any) => ({ symbol: w.symbol, weight: int(w.weight), total: int(w.total) })) : [],
      )
    : [];
  const limits = toSlotLimits(raw?.limits);
  return {
    enabled: raw?.enabled === true,
    symbols: symbols.length ? symbols : SLOT_SYMBOL_ORDER.map((id) => ({ id, label: SLOT_SYMBOL_LABELS[id] })),
    reel_weights: reelWeights,
    bets: Array.isArray(raw?.bets) ? raw.bets.map((b: unknown) => int(b)).filter((b: number) => b > 0) : limits.bets,
    paytable: Array.isArray(raw?.paytable) ? raw.paytable.map(toPaytableRow) : [],
    rtp_pct: num(raw?.rtp_pct),
    house_edge_pct: num(raw?.house_edge_pct),
    hit_rate_pct: num(raw?.hit_rate_pct),
    stdev: Math.max(0, num(raw?.stdev)),
    celebrate_net_multiple: num(raw?.celebrate_net_multiple, 5) || 5,
    limits,
    coins: int(raw?.coins),
    today: toSlotTotals(raw?.today),
    lifetime: toSlotLifetime(raw?.lifetime),
    session: toSlotSession(raw?.session),
    history: toHistory(raw?.history),
    disclaimer: str(raw?.disclaimer),
  };
}

export function toRealityCheck(raw: any): SlotRealityCheck | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = toSlotTotals(raw);
  return { ...t, net: Math.round(num(raw?.net, t.net)), expected_net: Math.round(num(raw?.expected_net)) };
}

export function toSlotSpinResult(raw: any): SlotSpinResult {
  const reels = Array.isArray(raw?.reels) ? raw.reels.filter(isSymbol).slice(0, 3) : [];
  const bet = int(raw?.bet);
  const win = int(raw?.win);
  return {
    request_id: String(raw?.request_id ?? ''),
    replayed: raw?.replayed === true,
    reels: reels.length === 3 ? reels : (['ayi', 'ayi', 'ayi'] as SlotSymbolId[]),
    combo: {
      id: String(raw?.combo?.id ?? 'none'),
      label: String(raw?.combo?.label ?? ''),
      multiplier: Math.max(0, num(raw?.combo?.multiplier)),
    },
    bet,
    win,
    net: win - bet,
    balance: int(raw?.balance),
    stats: {
      today: toSlotTotals(raw?.stats?.today),
      lifetime: toSlotLifetime(raw?.stats?.lifetime),
      session: toSlotSession(raw?.stats?.session),
    },
    limits: toSlotLimits(raw?.limits),
    reality_check: toRealityCheck(raw?.reality_check),
  };
}

// ---------------------------------------------------------------------------
// Biçimlendirme
// ---------------------------------------------------------------------------

const MINUS = '−';

/** Yüzde: 0.0125 → "%0,0125", 95 → "%95", 43.15 → "%43,15" */
export function formatSlotPct(pct: number, maxDigits = 4): string {
  const v = Number.isFinite(pct) ? pct : 0;
  const s = Math.abs(v).toLocaleString('tr-TR', { maximumFractionDigits: maxDigits });
  return `${v < 0 ? MINUS : ''}%${s}`;
}

/** Tam olasılık: 27 / 8000 → "27 / 8.000" (karşılaştırılabilir ortak payda) */
export function formatOdds(ways: number, total: number): string {
  if (!(total > 0)) return '—';
  return `${Math.max(0, Math.round(ways)).toLocaleString('tr-TR')} / ${Math.round(total).toLocaleString('tr-TR')}`;
}

/** Çarpan: 100 → "×100", 0 → "—" */
export function formatMultiplier(m: number): string {
  if (!(m > 0)) return '—';
  return `×${m.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
}

/** İşaretli jeton: 20 → "+20", −10 → "−10", 0 → "0" */
export function formatSignedCoins(n: number): string {
  const v = Math.round(n);
  if (v === 0) return '0';
  return `${v > 0 ? '+' : MINUS}${Math.abs(v).toLocaleString('tr-TR')}`;
}

/** Sayı (ondalıklı, işaretli): −0.5 → "−0,5" */
export function formatSigned(n: number, digits = 2): string {
  const v = Math.round(n * 10 ** digits) / 10 ** digits;
  if (v === 0) return '0';
  return `${v > 0 ? '+' : MINUS}${Math.abs(v).toLocaleString('tr-TR', { maximumFractionDigits: digits })}`;
}

/** Tablo satırının sembolleri: 'three' → 3 sembol; 'pair' / 'none' → null (metinle anlatılır) */
export function comboSymbols(row: Pick<SlotPaytableRow, 'kind' | 'symbol'>): SlotSymbolId[] | null {
  return row.kind === 'three' && row.symbol ? [row.symbol, row.symbol, row.symbol] : null;
}

/** Tablo toplamları (Σ olasılık, Σ olasılık × çarpan = RTP) — gösterilen satırlardan yeniden hesaplanır. */
export function paytableTotals(rows: SlotPaytableRow[]): { probability_pct: number; rtp_pct: number } {
  let p = 0;
  let r = 0;
  for (const row of rows) {
    const prob = row.total_ways > 0 ? row.ways / row.total_ways : row.probability_pct / 100;
    p += prob;
    r += prob * row.multiplier;
  }
  return { probability_pct: Math.round(p * 1_000_000) / 10_000, rtp_pct: Math.round(r * 1_000_000) / 10_000 };
}

/** Çevirme başına beklenen net (jeton): bahis × (RTP − 100) / 100 */
export function expectedValuePerSpin(bet: number, rtpPct: number): number {
  return (bet * (rtpPct - 100)) / 100;
}

// ---------------------------------------------------------------------------
// Sonuç metni (kazanç gibi görünen kayıp YOK: net < 0 ise "Kayıp")
// ---------------------------------------------------------------------------

export type SlotOutcomeTone = 'win' | 'loss' | 'even';

export interface SlotOutcome {
  tone: SlotOutcomeTone;
  /** Kısa başlık: "Kazanç: +15 jeton" / "Kayıp: −10 jeton" */
  text: string;
  /** Ayrıntı: "3× Boğa · ×6 → 60 jeton geri" */
  detail: string;
  net: number;
}

export function outcomeOf(bet: number, win: number, comboLabel = ''): SlotOutcome {
  const net = win - bet;
  const tone: SlotOutcomeTone = net > 0 ? 'win' : net < 0 ? 'loss' : 'even';
  const text =
    tone === 'win' ? `Kazanç: +${net.toLocaleString('tr-TR')} jeton` : tone === 'loss' ? `Kayıp: ${MINUS}${Math.abs(net).toLocaleString('tr-TR')} jeton` : 'Berabere: 0 jeton';
  const back = win > 0 ? `${win.toLocaleString('tr-TR')} jeton geri` : 'eşleşme yok';
  const mult = bet > 0 && win > 0 ? ` · ×${(win / bet).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}` : '';
  const label = win > 0 && comboLabel ? `${comboLabel}${mult} → ` : '';
  return { tone, text, detail: `${label}${back} (bahis ${bet.toLocaleString('tr-TR')})`, net };
}

/**
 * Vurgulanacak makaralar: yalnızca GERÇEK kazançta eşleşen makaralar (üçlü → üçü, iki aynı → o ikisi).
 * Kazanç yoksa hiçbir makara vurgulanmaz (yakın kaçış vurgusu yok).
 */
export function winningReels(reels: readonly SlotSymbolId[], win: number): boolean[] {
  if (!(win > 0) || reels.length !== 3) return reels.map(() => false);
  const [a, b, c] = reels;
  if (a === b && b === c) return [true, true, true];
  return [a === b || a === c, a === b || b === c, a === c || b === c];
}

/** Konfeti yalnızca net kazanç ≥ multiple × bahis (varsayılan 5×) */
export function shouldCelebrate(bet: number, win: number, multiple = 5): boolean {
  return bet > 0 && win - bet >= multiple * bet;
}

/** Durum özeti metni: "25 çevirmede net −40 jeton. Teorik beklenti −31." */
export function realityCheckText(rc: Pick<SlotRealityCheck, 'spins' | 'net' | 'expected_net'>): string {
  return `${rc.spins} çevirmede net ${formatSignedCoins(rc.net)} jeton. Teorik beklenti ${formatSignedCoins(rc.expected_net)}.`;
}

// ---------------------------------------------------------------------------
// Makara animasyonu: soldan sağa, SONUÇTAN BAĞIMSIZ sabit duruş zamanları (beklenti yaratan yavaşlama yok)
// ---------------------------------------------------------------------------

export const REEL_TIMING = {
  firstStopMs: 700,
  gapMs: 300,
  reducedFirstStopMs: 120,
  reducedGapMs: 120,
} as const;

/** Her makaranın duruş anı (ms, çevirme başından). Yalnızca makara sayısına ve hareket tercihine bağlıdır. */
export function reelStopTimes(count = 3, reduced = false): number[] {
  const first = reduced ? REEL_TIMING.reducedFirstStopMs : REEL_TIMING.firstStopMs;
  const gap = reduced ? REEL_TIMING.reducedGapMs : REEL_TIMING.gapMs;
  return Array.from({ length: Math.max(0, count) }, (_, i) => first + i * gap);
}

/** Dolgu sembolü sayısı (sonraki makaralar daha uzun döner) */
export const STRIP_BASE = 10;
export const STRIP_STEP = 4;

/**
 * Bir makaranın bu çevirmedeki şeridi: [önceki, …dolgu…, sonuç]. Dolgu SABİT sırayla (SLOT_SYMBOL_ORDER) döner ve
 * yalnızca makara + çevirme sırasına bağlıdır — sonuç dolguyu ASLA etkilemez (tasarlanmış yakın kaçış yok).
 */
export function reelStrip(prev: SlotSymbolId, result: SlotSymbolId, reelIndex: number, spinIndex: number): SlotSymbolId[] {
  const len = STRIP_BASE + reelIndex * STRIP_STEP;
  const n = SLOT_SYMBOL_ORDER.length;
  const offset = (((spinIndex * 3 + reelIndex * 5) % n) + n) % n;
  const fillers = Array.from({ length: len }, (_, i) => SLOT_SYMBOL_ORDER[(offset + i) % n]);
  return [prev, ...fillers, result];
}

/** İki çevirme arasında kalan bekleme (ms) */
export function cooldownLeft(lastSpinAt: number | null, now: number, minIntervalMs: number): number {
  if (lastSpinAt === null) return 0;
  return Math.max(0, lastSpinAt + minIntervalMs - now);
}

export interface BetOption {
  bet: number;
  disabled: boolean;
  /** Neden kapalı (ekran okuyucu / ipucu) */
  reason: string | null;
}

export function betOptions(bets: number[], limits: Pick<SlotLimits, 'loss_remaining_today' | 'spins_left_today'>, coins: number): BetOption[] {
  return bets.map((bet) => {
    if (limits.spins_left_today <= 0) return { bet, disabled: true, reason: 'Bugünkü çevirme hakkın bitti' };
    if (bet > limits.loss_remaining_today) return { bet, disabled: true, reason: 'Günlük kayıp sınırını aşar' };
    if (bet > coins) return { bet, disabled: true, reason: 'Yeterli jetonun yok' };
    return { bet, disabled: false, reason: null };
  });
}

// ---------------------------------------------------------------------------
// Büyük sayılar yasası: kümülatif getiri serisi ve teorik güven bandı
// ---------------------------------------------------------------------------

export interface ReturnPoint {
  n: number;
  /** (toplam kazanç − toplam bahis) / toplam bahis × 100 */
  return_pct: number;
}

export function cumulativeReturnSeries(points: SlotHistoryPoint[]): ReturnPoint[] {
  return points
    .filter((p) => p.n > 0 && p.wagered > 0)
    .sort((a, b) => a.n - b.n)
    .map((p) => ({ n: p.n, return_pct: ((p.won - p.wagered) / p.wagered) * 100 }));
}

/** Yeni çevirmeden sonra (tüm zamanlar toplamıyla) geçmişe nokta ekler; zaten varsa değiştirmez. */
export function appendHistoryPoint(points: SlotHistoryPoint[], lifetime: Pick<SlotTotals, 'spins' | 'wagered' | 'won'>): SlotHistoryPoint[] {
  const last = points[points.length - 1];
  if (lifetime.spins <= 0 || (last && last.n >= lifetime.spins)) return points;
  return [...points, { n: lifetime.spins, wagered: lifetime.wagered, won: lifetime.won }];
}

/**
 * n çevirmeden sonra gerçekleşen getirinin yaklaşık %95 aralığı (eşit bahis varsayımı):
 * (RTP − 100) ± z · σ · 100 / √n. n büyüdükçe bant teorik çizgiye daralır.
 */
export function returnBand(n: number, rtpPct: number, stdev: number, z = 1.96): { lower: number; upper: number; expected: number } {
  const expected = rtpPct - 100;
  if (!(n > 0)) return { lower: expected, upper: expected, expected };
  const half = (z * stdev * 100) / Math.sqrt(n);
  return { lower: expected - half, upper: expected + half, expected };
}
