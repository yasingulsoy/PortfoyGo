// Arena: sözleşme normalleştiricileri ve saf yardımcılar (React içermez; birim testli).

import type {
  ArenaChallenge,
  ArenaChallengeStatus,
  ArenaCloseReason,
  ArenaFinal,
  ArenaHistoryItem,
  ArenaHistoryPage,
  ArenaInstrument,
  ArenaLeader,
  ArenaLeadersPage,
  ArenaLeaderboardRow,
  ArenaMe,
  ArenaPosition,
  ArenaQuote,
  ArenaReveal,
  ArenaRound,
  ArenaRoundInstrument,
  ArenaRoundKind,
  ArenaRoundState,
  ArenaSide,
  ArenaHostMessage,
  ArenaRoundDuel,
  ArenaRoundScenario,
  AssetType,
} from '@/types';
import { hasAssetLogo } from '@portfoygo/shared/assetLogos';
import { toRoundDuel, toRoundScenario } from '@/components/game/model';

/** Arena başlangıç sermayesi (USD, sanal). */
export const ARENA_START_CASH = 10_000;
/** Bir turdaki en fazla enstrüman */
export const MAX_ROUND_INSTRUMENTS = 4;
/** Hızlı tur süreleri (saniye) */
export const ARENA_DURATIONS = [60, 180, 300, 600] as const;
export type ArenaDuration = (typeof ARENA_DURATIONS)[number];
/** İşlem tutarı hazır seçenekleri (USD) */
export const AMOUNT_PRESETS = [250, 500, 1000, 2500] as const;
/** Zarar durdur / kâr al uzaklığı hazır seçenekleri (yüzde) */
export const STOP_PRESETS = [0.5, 1, 2] as const;
/** Kotasyon akışında tutulan en fazla satır */
export const FEED_MAX = 40;
/** Grafik serisinde tutulan en fazla nokta (enstrüman başına) */
export const SERIES_MAX = 5000;

export const CLOSE_REASON_LABELS: Record<ArenaCloseReason, string> = {
  manual: 'Elle kapatıldı',
  sl: 'Zarar durdur',
  tp: 'Kâr al',
  liquidated: 'Tasfiye',
  round_end: 'Tur sonu',
};

export const SIDE_LABELS: Record<ArenaSide, string> = { long: 'Al', short: 'Sat' };

/* ------------------------------------------------------------------ */
/* Normalleştiriciler (backend yanıtını güvenle okur)                    */
/* ------------------------------------------------------------------ */

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : v == null ? fallback : String(v));
const num = (v: unknown, fallback = 0) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const numOrNull = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const strOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

export function toArenaInstrument(raw: any): ArenaInstrument {
  return {
    code: str(raw?.code),
    label: str(raw?.label, str(raw?.code)),
    decimals: Math.max(0, Math.min(8, Math.round(num(raw?.decimals, 2)))),
    spread_display: str(raw?.spread_display),
    available: raw?.available !== false,
  };
}

/**
 * Arena enstrümanının logosu için temsil ettiği varlık (backend services/arena/instruments.ts ile aynı eşleme;
 * EUR/USD paritesi için Euro bayrağı). Logosu olmayan / bilinmeyen kodlarda (ör. sentetik senaryo serileri) null.
 */
const ARENA_INSTRUMENT_ASSETS: Readonly<Record<string, { type: AssetType; symbol: string }>> = {
  EURUSD: { type: 'currency', symbol: 'EUR' },
  XAUUSD: { type: 'commodity', symbol: 'XAUUSD' },
  XAGUSD: { type: 'commodity', symbol: 'XAGUSD' },
  BRENT: { type: 'commodity', symbol: 'BRENT' },
  BTCUSD: { type: 'crypto', symbol: 'BTC' },
};

export function arenaInstrumentAsset(code: string): { type: AssetType; symbol: string } | null {
  const key = code.trim().toUpperCase();
  const asset = Object.prototype.hasOwnProperty.call(ARENA_INSTRUMENT_ASSETS, key) ? ARENA_INSTRUMENT_ASSETS[key] : null;
  return asset && hasAssetLogo(asset.type, asset.symbol) ? asset : null;
}

export function toArenaInstruments(raw: any): ArenaInstrument[] {
  return arr(raw).map(toArenaInstrument).filter((i) => i.code);
}

function toRoundInstrument(raw: any): ArenaRoundInstrument {
  const { code, label, decimals } = toArenaInstrument(raw);
  return { code, label, decimals };
}

export function toQuote(raw: any): ArenaQuote {
  const bid = num(raw?.bid);
  const ask = num(raw?.ask, bid);
  return { bid, ask, mid: num(raw?.mid, (bid + ask) / 2), change_pct_since_start: num(raw?.change_pct_since_start) };
}

export function toQuotes(raw: any): Record<string, ArenaQuote> {
  const out: Record<string, ArenaQuote> = {};
  if (raw && typeof raw === 'object') for (const [code, q] of Object.entries(raw)) out[code] = toQuote(q);
  return out;
}

const CLOSE_REASONS: ArenaCloseReason[] = ['manual', 'sl', 'tp', 'liquidated', 'round_end'];

export function toPosition(raw: any): ArenaPosition {
  return {
    id: str(raw?.id),
    instrument: str(raw?.instrument),
    side: raw?.side === 'short' ? 'short' : 'long',
    qty: num(raw?.qty),
    amount: num(raw?.amount),
    entry_price: num(raw?.entry_price),
    stop_loss: numOrNull(raw?.stop_loss),
    take_profit: numOrNull(raw?.take_profit),
    status: raw?.status === 'closed' ? 'closed' : 'open',
    current_price: numOrNull(raw?.current_price),
    pnl: num(raw?.pnl),
    pnl_pct: num(raw?.pnl_pct),
    close_price: numOrNull(raw?.close_price),
    close_reason: CLOSE_REASONS.includes(raw?.close_reason) ? raw.close_reason : null,
    opened_at: str(raw?.opened_at, new Date(0).toISOString()),
    closed_at: strOrNull(raw?.closed_at),
  };
}

export function toMe(raw: any): ArenaMe {
  return {
    joined: raw?.joined !== false,
    cash: num(raw?.cash, ARENA_START_CASH),
    equity: num(raw?.equity, ARENA_START_CASH),
    return_pct: num(raw?.return_pct),
    rank: numOrNull(raw?.rank),
    trades_count: num(raw?.trades_count),
  };
}

export function toReveal(raw: any): ArenaReveal | null {
  const from = strOrNull(raw?.from);
  const to = strOrNull(raw?.to);
  if (!from || !to) return null;
  const instruments: Record<string, { from: string; to: string }> = {};
  if (raw?.instruments && typeof raw.instruments === 'object') {
    for (const [code, w] of Object.entries<any>(raw.instruments)) {
      const a = strOrNull(w?.from);
      const b = strOrNull(w?.to);
      if (a && b) instruments[code] = { from: a, to: b };
    }
  }
  return Object.keys(instruments).length ? { from, to, instruments } : { from, to };
}

export function toRound(raw: any): ArenaRound {
  const cancelled = raw?.status === 'cancelled';
  const status = cancelled ? 'finished' : raw?.status === 'scheduled' || raw?.status === 'finished' ? raw.status : 'running';
  const c = raw?.challenge;
  return {
    id: str(raw?.id),
    kind: toRoundKind(raw?.kind),
    status,
    starts_at: str(raw?.starts_at),
    ends_at: str(raw?.ends_at),
    duration_s: num(raw?.duration_s, 60),
    server_now: str(raw?.server_now, new Date().toISOString()),
    tick: num(raw?.tick),
    ticks_total: Math.max(1, num(raw?.ticks_total, 1)),
    instruments: arr(raw?.instruments).map(toRoundInstrument).filter((i) => i.code),
    challenge: c && typeof c === 'object' ? { id: str(c.id), title: str(c.title), sponsor: strOrNull(c.sponsor), prize_text: strOrNull(c.prize_text) } : null,
    reveal: toReveal(raw?.reveal),
    ...(cancelled ? { cancelled: true } : {}),
    ...(strOrNull(raw?.reveal?.debrief ?? raw?.debrief) ? { debrief: strOrNull(raw?.reveal?.debrief ?? raw?.debrief) } : {}),
  };
}

export function toLeaderboardRows(raw: any): ArenaLeaderboardRow[] {
  return arr(raw?.items ?? raw).map((r, i) => ({
    rank: num(r?.rank, i + 1),
    username: str(r?.username, '—'),
    return_pct: num(r?.return_pct),
    equity: numOrNull(r?.equity),
    is_me: r?.is_me === true,
  }));
}

export function toRoundState(raw: any): ArenaRoundState {
  const history: Record<string, number[]> = {};
  if (raw?.history && typeof raw.history === 'object') {
    for (const [code, values] of Object.entries(raw.history)) history[code] = arr(values).map((v) => num(v, NaN)).filter(Number.isFinite);
  }
  const ticks = arr(raw?.history_ticks).map((t) => num(t, NaN));
  return {
    round: toRound(raw?.round),
    me: toMe(raw?.me),
    quotes: toQuotes(raw?.quotes),
    history,
    history_ticks: ticks.length && ticks.every(Number.isFinite) ? ticks : undefined,
    positions: { open: arr(raw?.positions?.open).map(toPosition), closed: arr(raw?.positions?.closed).map(toPosition) },
    leaderboard: raw?.leaderboard ? toLeaderboardRows(raw.leaderboard) : undefined,
    // Düello / senaryo turları (yalnızca varsa)
    ...(raw?.duel && typeof raw.duel === 'object' ? { duel: toRoundDuel(raw.duel) } : {}),
    ...(raw?.scenario && typeof raw.scenario === 'object' ? { scenario: toRoundScenario(raw.scenario) } : {}),
  };
}

export function toFinal(raw: any, fallback?: ArenaMe): ArenaFinal {
  return {
    equity: num(raw?.equity ?? raw?.equity_final, fallback?.equity ?? ARENA_START_CASH),
    return_pct: num(raw?.return_pct, fallback?.return_pct ?? 0),
    rank: numOrNull(raw?.rank) ?? fallback?.rank ?? null,
    participants: numOrNull(raw?.participants),
    trades_count: num(raw?.trades_count, fallback?.trades_count ?? 0),
  };
}

const ROUND_KINDS: readonly ArenaRoundKind[] = ['solo', 'challenge', 'duel', 'scenario'];
/** Bilinmeyen tür → 'solo' (eski sunucularla uyum). */
export function toRoundKind(v: unknown): ArenaRoundKind {
  return ROUND_KINDS.includes(v as ArenaRoundKind) ? (v as ArenaRoundKind) : 'solo';
}

/** Geçmiş satırının açılacağı sayfa: senaryo turları "Ne oldu?" ekranına, diğerleri oyun tur ekranına. */
export function historyHref(item: Pick<ArenaHistoryItem, 'kind' | 'round_id'>): string {
  const id = encodeURIComponent(item.round_id);
  return item.kind === 'scenario' ? `/oyun/senaryolar/tur/${id}` : `/oyun/tur/${id}`;
}

/** Geçmiş satırının başlığı. */
export function historyTitle(item: Pick<ArenaHistoryItem, 'kind' | 'challenge_title' | 'duration_s'>): string {
  if (item.kind === 'challenge') return item.challenge_title ?? 'Meydan okuma';
  if (item.kind === 'duel') return `Düello · ${durationLabel(item.duration_s)}`;
  if (item.kind === 'scenario') return `Senaryo · ${durationLabel(item.duration_s)}`;
  return `Hızlı tur · ${durationLabel(item.duration_s)}`;
}

export function toHistoryItem(raw: any): ArenaHistoryItem {
  return {
    round_id: str(raw?.round_id ?? raw?.id),
    kind: toRoundKind(raw?.kind),
    challenge_title: strOrNull(raw?.challenge_title),
    duration_s: num(raw?.duration_s, 60),
    return_pct: num(raw?.return_pct),
    equity_final: num(raw?.equity_final, ARENA_START_CASH),
    rank: numOrNull(raw?.rank),
    trades_count: num(raw?.trades_count),
    finished_at: str(raw?.finished_at),
  };
}

export function toHistoryPage(raw: any): ArenaHistoryPage {
  const items = arr(raw?.items).map(toHistoryItem);
  return {
    items,
    total: num(raw?.total, items.length),
    limit: num(raw?.limit, items.length || 10),
    offset: num(raw?.offset),
    stats: {
      rounds: num(raw?.stats?.rounds, num(raw?.total, items.length)),
      best_return_pct: numOrNull(raw?.stats?.best_return_pct),
      avg_return_pct: numOrNull(raw?.stats?.avg_return_pct),
      win_rate: numOrNull(raw?.stats?.win_rate),
    },
  };
}

function toLeader(raw: any, i = 0): ArenaLeader {
  return {
    rank: num(raw?.rank, i + 1),
    username: str(raw?.username, '—'),
    return_pct: num(raw?.return_pct),
    rounds: num(raw?.rounds),
    is_me: raw?.is_me === true,
  };
}

export function toLeadersPage(raw: any): ArenaLeadersPage {
  return { items: arr(raw?.items ?? raw).map(toLeader), me: raw?.me && typeof raw.me === 'object' ? toLeader(raw.me) : null };
}

const CHALLENGE_STATUSES: ArenaChallengeStatus[] = ['upcoming', 'live', 'finished'];

/** Sözleşme durumları + backend'in tur durumları (scheduled / running / cancelled). */
export function toChallengeStatus(raw: unknown): ArenaChallengeStatus {
  if (CHALLENGE_STATUSES.includes(raw as ArenaChallengeStatus)) return raw as ArenaChallengeStatus;
  if (raw === 'running') return 'live';
  if (raw === 'finished' || raw === 'cancelled') return 'finished';
  return 'upcoming';
}

export function toChallenge(raw: any): ArenaChallenge {
  return {
    id: str(raw?.id),
    title: str(raw?.title, 'Meydan okuma'),
    description: strOrNull(raw?.description),
    sponsor: strOrNull(raw?.sponsor),
    prize_text: strOrNull(raw?.prize_text),
    starts_at: str(raw?.starts_at),
    duration_s: num(raw?.duration_s, 300),
    instruments: arr(raw?.instruments).map((i) => (typeof i === 'string' ? i : str(i?.label ?? i?.code))).filter(Boolean),
    status: toChallengeStatus(raw?.status),
    participants: num(raw?.participants),
    joined: raw?.joined === true,
    round_id: strOrNull(raw?.round_id),
    starting_cash: num(raw?.starting_cash, ARENA_START_CASH),
  };
}

export function toChallenges(raw: any): ArenaChallenge[] {
  return arr(raw?.items ?? raw).map(toChallenge).filter((c) => c.id);
}

/* ------------------------------------------------------------------ */
/* Biçimlendirme                                                        */
/* ------------------------------------------------------------------ */

/** Kalan süre → "m:ss" (1 saatten uzunsa "s:mm:ss"). Yukarı yuvarlanır: 0,2 sn kala "0:01". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Uzun geri sayım: "2 gün 4 sa", "3 sa 12 dk", 1 saatten kısa ise saat biçimi. */
export function formatCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return formatClock(ms);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return hours > 0 ? `${days} gün ${hours} sa` : `${days} gün`;
  const mins = minutes % 60;
  return mins > 0 ? `${hours} sa ${mins} dk` : `${hours} sa`;
}

/** Süre etiketi: 60 → "1 dk", 90 → "1,5 dk" */
export function durationLabel(seconds: number): string {
  const m = seconds / 60;
  return `${m.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} dk`;
}

/** Enstrüman ondalığıyla fiyat (tr-TR). */
export function formatPrice(value: number | null | undefined, decimals: number): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const roundTo = (value: number, decimals: number) => {
  const k = 10 ** decimals;
  return Math.round(value * k) / k;
};

/**
 * Zarar durdur / kâr al fiyatı: giriş referansından yüzde uzaklık.
 * Alış (long): SL aşağıda, TP yukarıda. Satış (short): SL yukarıda, TP aşağıda.
 */
export function stopPrice(side: ArenaSide, kind: 'sl' | 'tp', ref: number, pct: number, decimals: number): number {
  const below = (side === 'long') === (kind === 'sl');
  return roundTo(ref * (1 + ((below ? -1 : 1) * pct) / 100), decimals);
}

/** Bir zarar durdur / kâr al fiyatının pozisyon yönüne göre geçerli tarafta olup olmadığı. */
export function stopIsValid(side: ArenaSide, kind: 'sl' | 'tp', price: number, ref: number): boolean {
  if (!Number.isFinite(price) || price <= 0) return false;
  const below = (side === 'long') === (kind === 'sl');
  return below ? price < ref : price > ref;
}

/** Pozisyonun kapanış fiyatı (alış → bid, satış → ask) ve anlık kâr/zararı. */
export function livePnl(p: Pick<ArenaPosition, 'side' | 'qty' | 'amount' | 'entry_price'>, quote: ArenaQuote | undefined) {
  if (!quote) return null;
  const price = p.side === 'long' ? quote.bid : quote.ask;
  const qty = p.qty > 0 ? p.qty : p.entry_price > 0 ? p.amount / p.entry_price : 0;
  // Zarar yatırılan tutarla sınırlıdır (tasfiye)
  const pnl = Math.max((p.side === 'long' ? price - p.entry_price : p.entry_price - price) * qty, -p.amount);
  return { current_price: price, pnl, pnl_pct: p.amount > 0 ? (pnl / p.amount) * 100 : 0 };
}

/** Açık pozisyonlarla yerel özsermaye (sunucu `me` olayı gelene kadar ara değer). */
export function localEquity(cash: number, open: ArenaPosition[]): number {
  return open.reduce((sum, p) => sum + p.amount + p.pnl, cash);
}

const fmtDay = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString('tr-TR', { timeZone: 'UTC', ...opts });

/** Gerçek veri penceresi: "12–13 Eylül 2026", "30 Ağustos – 2 Eylül 2026", "12 Eylül 2026". */
export function formatRevealRange(reveal: ArenaReveal): string {
  const a = new Date(reveal.from);
  const b = new Date(reveal.to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const sameMonth = sameYear && a.getUTCMonth() === b.getUTCMonth();
  if (sameMonth && a.getUTCDate() === b.getUTCDate()) return fmtDay(a, { day: 'numeric', month: 'long', year: 'numeric' });
  if (sameMonth) return `${a.getUTCDate()}–${fmtDay(b, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  if (sameYear) return `${fmtDay(a, { day: 'numeric', month: 'long' })} – ${fmtDay(b, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  return `${fmtDay(a, { day: 'numeric', month: 'long', year: 'numeric' })} – ${fmtDay(b, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

/** "A, B ve C" */
export function joinTr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ve ${items[items.length - 1]}`;
}

/** Tur sonu açıklaması: hangi gerçek dönemin hızlandırılmış tekrarı oynandı. */
export function revealSentence(reveal: ArenaReveal | null | undefined, labels: string[]): string | null {
  if (!reveal) return null;
  const range = formatRevealRange(reveal);
  if (!range) return null;
  const what = labels.length ? `${joinTr(labels)} ` : '';
  // Tek günlük pencere: "12 Eylül 2026 tarihindeki"; aralık: "12–13 Eylül 2026 arasındaki"
  const when = range.includes('–') ? 'arasındaki' : 'tarihindeki';
  return `Bu tur, ${range} ${when} gerçek ${what}hareketinin hızlandırılmış tekrarıydı.`;
}

/** Kapanan pozisyonlar içinde en iyi ve en kötü işlem (kâr/zarar tutarına göre). */
export function bestWorst(closed: ArenaPosition[]): { best: ArenaPosition | null; worst: ArenaPosition | null } {
  if (!closed.length) return { best: null, worst: null };
  let best = closed[0];
  let worst = closed[0];
  for (const p of closed) {
    if (p.pnl > best.pnl) best = p;
    if (p.pnl < worst.pnl) worst = p;
  }
  return { best, worst: closed.length > 1 ? worst : null };
}

/* ------------------------------------------------------------------ */
/* Tick ↔ zaman                                                         */
/* ------------------------------------------------------------------ */

/** Son tick'in numarası (tick'ler 0'dan başlar; `ticks_total` başlangıç tick'ini de sayar). */
export const lastTickOf = (round: Pick<ArenaRound, 'ticks_total'>) => Math.max(1, round.ticks_total - 1);

/** Bir tick'in tur içindeki geçen süresi (ms). */
export function tickToElapsedMs(tick: number, round: Pick<ArenaRound, 'duration_s' | 'ticks_total'>): number {
  return (tick / lastTickOf(round)) * round.duration_s * 1000;
}

/** Bir anın (ISO) yaklaşık tick'i — grafik işaretleri için. */
export function timeToTick(iso: string, round: Pick<ArenaRound, 'starts_at' | 'duration_s' | 'ticks_total'>): number {
  const t = Date.parse(iso);
  const start = Date.parse(round.starts_at);
  if (!Number.isFinite(t) || !Number.isFinite(start)) return 0;
  const ratio = (t - start) / (round.duration_s * 1000);
  const last = lastTickOf(round);
  return Math.max(0, Math.min(last, Math.round(ratio * last)));
}

/* ------------------------------------------------------------------ */
/* Kotasyon akışı                                                       */
/* ------------------------------------------------------------------ */

export interface FeedItem {
  id: string;
  tick: number;
  /** İstemci saati (ms) */
  at: number;
  code: string;
  bid: number;
  ask: number;
  dir: 'up' | 'down' | 'flat';
}

/**
 * Yeni tick'in kotasyonlarını akışın başına ekler: yalnızca orta fiyatı değişen enstrümanlar
 * (önceki kotasyon yoksa hepsi) satır olur. Akış en fazla `max` satır tutar; değişiklik yoksa aynı dizi döner.
 */
export function pushFeed(
  feed: FeedItem[],
  prev: Record<string, ArenaQuote>,
  next: Record<string, ArenaQuote>,
  tick: number,
  at: number,
  order: string[] = Object.keys(next),
  max = FEED_MAX,
): FeedItem[] {
  const rows: FeedItem[] = [];
  for (const code of order) {
    const q = next[code];
    if (!q) continue;
    const before = prev[code];
    if (before && before.mid === q.mid && before.bid === q.bid) continue;
    const dir = !before || q.mid === before.mid ? 'flat' : q.mid > before.mid ? 'up' : 'down';
    rows.push({ id: `${tick}:${code}`, tick, at, code, bid: q.bid, ask: q.ask, dir });
  }
  if (!rows.length) return feed;
  return [...rows, ...feed].slice(0, max);
}

/* ------------------------------------------------------------------ */
/* Canlı tur durumu (SSE olayları + REST anlık görüntüsü)               */
/* ------------------------------------------------------------------ */

export interface SeriesPoint {
  /** tick numarası (grafikte zaman ekseni) */
  t: number;
  v: number;
}

export interface RoundModel {
  round: ArenaRound;
  me: ArenaMe;
  quotes: Record<string, ArenaQuote>;
  series: Record<string, SeriesPoint[]>;
  open: ArenaPosition[];
  closed: ArenaPosition[];
  leaderboard: ArenaLeaderboardRow[];
  feed: FeedItem[];
  /** sunucu saati − istemci saati (ms) */
  clockOffset: number;
  /** Geri sayım olayıyla bildirilen başlangıç (istemci saati, ms) */
  countdownUntil: number | null;
  final: ArenaFinal | null;
  /** Getiri yüzdesinin hesaplandığı başlangıç özsermayesi */
  baseEquity: number;
  /** Tur başındaki orta fiyatlar (tick olaylarında "başlangıçtan beri değişim" için) */
  startMids: Record<string, number>;
  /** Düello turunda rakibin canlı durumu */
  duel?: ArenaRoundDuel | null;
  /** Senaryo turu */
  scenario?: ArenaRoundScenario | null;
  /** Meydan okuma sunucusunun son mesajı */
  hostMessage?: ArenaHostMessage | null;
}

export interface RoundStore {
  model: RoundModel | null;
  error: unknown;
  /** Yerel değişikliklerin sırası (ör. işlem sonrası animasyon) */
  version: number;
}

export type RoundAction =
  | { type: 'snapshot'; state: ArenaRoundState; now: number }
  | { type: 'error'; error: unknown }
  | { type: 'tick'; tick: number; server_now?: string; quotes: Record<string, ArenaQuote>; now: number }
  | { type: 'me'; me: Partial<ArenaMe> }
  | { type: 'position'; position: ArenaPosition }
  | { type: 'positions'; positions: ArenaPosition[] }
  | { type: 'leaderboard'; rows: ArenaLeaderboardRow[] }
  | { type: 'countdown'; starts_in_ms: number; now: number }
  | { type: 'opponent'; equity: number | null; return_pct: number | null }
  | { type: 'host_message'; message: ArenaHostMessage }
  | {
      type: 'end';
      final: ArenaFinal | null;
      reveal: ArenaReveal | null;
      leaderboard?: ArenaLeaderboardRow[];
      cancelled?: boolean;
      duel?: ArenaRoundDuel | null;
      debrief?: string | null;
    };

export const INITIAL_STORE: RoundStore = { model: null, error: null, version: 0 };

function baseFrom(me: Pick<ArenaMe, 'equity' | 'return_pct'>): number {
  const base = me.equity / (1 + me.return_pct / 100);
  return Number.isFinite(base) && base > 0 ? base : ARENA_START_CASH;
}

/** Anlık görüntüdeki geçmişi grafik serisine çevirir. */
export function seriesFromHistory(state: ArenaRoundState): Record<string, SeriesPoint[]> {
  const out: Record<string, SeriesPoint[]> = {};
  for (const [code, values] of Object.entries(state.history)) {
    const ticks = state.history_ticks && state.history_ticks.length === values.length ? state.history_ticks : null;
    const last = state.round.tick;
    const points: SeriesPoint[] = [];
    values.forEach((v, i) => {
      const t = ticks ? ticks[i] : last - (values.length - 1) + i;
      // Zaman ekseni kesin artan olmalı
      if (!points.length || t > points[points.length - 1].t) points.push({ t, v });
    });
    out[code] = points;
  }
  return out;
}

/** Tur başı orta fiyatları: tick 0 noktası varsa ondan, yoksa kotasyondaki değişim yüzdesinden. */
export function startMidsFrom(state: ArenaRoundState, series: Record<string, SeriesPoint[]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, q] of Object.entries(state.quotes)) {
    const first = series[code]?.[0];
    const fromChange = q.mid / (1 + q.change_pct_since_start / 100);
    const start = first && first.t <= 0 ? first.v : fromChange;
    if (Number.isFinite(start) && start > 0) out[code] = start;
  }
  return out;
}

/** Tick kotasyonlarına başlangıçtan beri değişimi ekler (akış olayında bu alan gelmez). */
function withChange(quotes: Record<string, ArenaQuote>, startMids: Record<string, number>): Record<string, ArenaQuote> {
  const out: Record<string, ArenaQuote> = {};
  for (const [code, q] of Object.entries(quotes)) {
    const start = startMids[code];
    out[code] = start ? { ...q, change_pct_since_start: ((q.mid - start) / start) * 100 } : q;
  }
  return out;
}

function withLivePnl(open: ArenaPosition[], quotes: Record<string, ArenaQuote>): ArenaPosition[] {
  return open.map((p) => {
    const live = livePnl(p, quotes[p.instrument]);
    return live ? { ...p, ...live } : p;
  });
}

function upsert(list: ArenaPosition[], p: ArenaPosition, prepend = false): ArenaPosition[] {
  const i = list.findIndex((x) => x.id === p.id);
  if (i === -1) return prepend ? [p, ...list] : [...list, p];
  const copy = list.slice();
  copy[i] = p;
  return copy;
}

function applyPosition(m: RoundModel, p: ArenaPosition): RoundModel {
  if (p.status === 'closed') {
    return { ...m, open: m.open.filter((x) => x.id !== p.id), closed: upsert(m.closed, p, true) };
  }
  // Kapatılmış bir pozisyonun gecikmiş "açık" olayı geri getirmesin
  if (m.closed.some((x) => x.id === p.id)) return m;
  const live = livePnl(p, m.quotes[p.instrument]);
  return { ...m, open: upsert(m.open, live ? { ...p, ...live } : p) };
}

export function roundReducer(store: RoundStore, action: RoundAction): RoundStore {
  const m = store.model;
  switch (action.type) {
    case 'snapshot': {
      const s = action.state;
      const serverNow = Date.parse(s.round.server_now);
      const series = seriesFromHistory(s);
      const model: RoundModel = {
        round: s.round,
        me: s.me,
        quotes: s.quotes,
        series,
        startMids: startMidsFrom(s, series),
        open: withLivePnl(s.positions.open, s.quotes),
        closed: s.positions.closed,
        leaderboard: s.leaderboard ?? m?.leaderboard ?? [],
        feed: m?.feed ?? [],
        clockOffset: Number.isFinite(serverNow) ? serverNow - action.now : (m?.clockOffset ?? 0),
        countdownUntil: s.round.status === 'scheduled' ? (m?.countdownUntil ?? null) : null,
        final: s.round.status === 'finished' ? (m?.final ?? toFinal(null, s.me)) : null,
        baseEquity: baseFrom(s.me),
        duel: s.duel ? { ...s.duel, result: s.duel.result ?? m?.duel?.result ?? null } : (m?.duel ?? null),
        scenario: s.scenario ?? m?.scenario ?? null,
        hostMessage: m?.hostMessage ?? null,
      };
      return { model, error: null, version: store.version + 1 };
    }
    case 'error':
      return { ...store, error: action.error };
    case 'tick': {
      if (!m || m.round.status === 'finished') return store;
      if (action.tick <= m.round.tick && Object.keys(m.series).length) return store;
      // Başlamadan önce kotasyon gelmez (meydan okuma): başlangıç fiyatı ilk tick'ten alınır
      let startMids = m.startMids;
      for (const [code, q] of Object.entries(action.quotes)) {
        if (!(startMids[code] > 0) && q.mid > 0) startMids = { ...startMids, [code]: q.mid };
      }
      const incoming = withChange(action.quotes, startMids);
      const quotes = { ...m.quotes, ...incoming };
      const series = { ...m.series };
      for (const [code, q] of Object.entries(incoming)) {
        const list = series[code] ?? [];
        const last = list[list.length - 1];
        if (last && last.t >= action.tick) continue;
        const next = [...list, { t: action.tick, v: q.mid }];
        series[code] = next.length > SERIES_MAX ? next.slice(next.length - SERIES_MAX) : next;
      }
      const open = withLivePnl(m.open, quotes);
      const equity = localEquity(m.me.cash, open);
      const serverNow = action.server_now ? Date.parse(action.server_now) : NaN;
      return {
        ...store,
        model: {
          ...m,
          round: { ...m.round, tick: action.tick, status: 'running', server_now: action.server_now ?? m.round.server_now },
          quotes,
          series,
          startMids,
          open,
          me: open.length || m.open.length ? { ...m.me, equity, return_pct: (equity / m.baseEquity - 1) * 100 } : m.me,
          feed: pushFeed(m.feed, m.quotes, action.quotes, action.tick, action.now, m.round.instruments.map((i) => i.code)),
          clockOffset: Number.isFinite(serverNow) ? serverNow - action.now : m.clockOffset,
          countdownUntil: null,
        },
      };
    }
    case 'me': {
      if (!m) return store;
      const me = { ...m.me, ...Object.fromEntries(Object.entries(action.me).filter(([, v]) => v !== undefined)) } as ArenaMe;
      return { ...store, model: { ...m, me, baseEquity: baseFrom(me) } };
    }
    case 'position':
      return m ? { ...store, model: applyPosition(m, action.position), version: store.version + 1 } : store;
    case 'positions':
      return m ? { ...store, model: action.positions.reduce(applyPosition, m), version: store.version + 1 } : store;
    case 'leaderboard':
      return m ? { ...store, model: { ...m, leaderboard: action.rows } } : store;
    case 'countdown':
      return m && m.round.status === 'scheduled' ? { ...store, model: { ...m, countdownUntil: action.now + Math.max(0, action.starts_in_ms) } } : store;
    case 'opponent': {
      if (!m?.duel || m.round.status === 'finished') return store;
      return {
        ...store,
        model: {
          ...m,
          duel: {
            ...m.duel,
            opponent_equity: action.equity ?? m.duel.opponent_equity,
            opponent_return_pct: action.return_pct ?? m.duel.opponent_return_pct,
          },
        },
      };
    }
    case 'host_message':
      return m ? { ...store, model: { ...m, hostMessage: action.message } } : store;
    case 'end': {
      if (!m) return store;
      return {
        ...store,
        model: {
          ...m,
          round: {
            ...m.round,
            status: 'finished',
            reveal: action.reveal ?? m.round.reveal ?? null,
            ...(action.cancelled ? { cancelled: true } : {}),
            ...(action.debrief ? { debrief: action.debrief } : {}),
          },
          final: action.final ?? toFinal(null, m.me),
          leaderboard: action.leaderboard ?? m.leaderboard,
          countdownUntil: null,
          duel: action.duel ? { ...(m.duel ?? {}), ...action.duel, result: action.duel.result ?? m.duel?.result ?? null } : m.duel,
        },
        version: store.version + 1,
      };
    }
    default:
      return store;
  }
}

/* ------------------------------------------------------------------ */
/* Paylaşım                                                             */
/* ------------------------------------------------------------------ */

export function shareText(opts: { returnPct: number; durationS: number; rank?: number | null; participants?: number | null; challenge?: string | null; url?: string }): string {
  const pct = `${opts.returnPct >= 0 ? '+' : ''}${opts.returnPct.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  const where = opts.challenge ? `“${opts.challenge}” meydan okumasında` : `${durationLabel(opts.durationS)}lık PortfoyGo Arena turunda`;
  const rank = opts.rank ? ` ${opts.rank}.${opts.participants ? ` / ${opts.participants}` : ''} oldum,` : '';
  return `${where}${rank} getirim ${pct} (sanal para).${opts.url ? ` ${opts.url}` : ''}`;
}
