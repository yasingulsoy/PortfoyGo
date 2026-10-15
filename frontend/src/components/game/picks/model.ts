// Haftalık Seçim (Kitlelerin Bilgeliği): sözleşme normalleştiricileri ve saf yardımcılar (React içermez; birim testli).

import type {
  AssetType,
  PickDirection,
  PicksAsset,
  PicksComment,
  PicksCommentPage,
  PicksCrowd,
  PicksCrowdAsset,
  PicksCurrent,
  PicksPhase,
  PicksRewardTier,
  PicksWeek,
  PicksWeekPage,
  PicksWeekSummary,
  WeeklyPick,
} from '@/types';

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : v == null ? fallback : String(v));
const strOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown, fallback = 0) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const numOrNull = (v: unknown) => {
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : null;
};
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const PICKS_PATH = '/oyun/haftalik-secim';
export const PICKS_HISTORY_PATH = `${PICKS_PATH}/gecmis`;
export const pickWeekPath = (weekId: string) => `${PICKS_HISTORY_PATH}/${encodeURIComponent(weekId)}`;

/** Not ve yorum sınırları (backend ile aynı) */
export const PICK_NOTE_MAX = 280;
export const PICK_COMMENT_MAX = 500;

export const PICKS_PHASES: readonly PicksPhase[] = ['upcoming', 'submit', 'revealed', 'live', 'settling', 'finished'];
const ASSET_TYPES: readonly AssetType[] = ['stock', 'crypto', 'currency', 'commodity'];

/** Varlık türü çipleri (arama filtresi) */
export const ASSET_TYPE_CHIPS: { value: AssetType; label: string }[] = [
  { value: 'stock', label: 'Hisse' },
  { value: 'crypto', label: 'Kripto' },
  { value: 'currency', label: 'Döviz' },
  { value: 'commodity', label: 'Emtia' },
];

export const PHASE_LABELS: Record<PicksPhase, string> = {
  upcoming: 'Yakında',
  submit: 'Seçim açık',
  revealed: 'Açıklandı',
  live: 'Canlı',
  settling: 'Hesaplanıyor',
  finished: 'Bitti',
};

export const DIRECTION_LABELS: Record<PickDirection, string> = { up: 'Yükselir', down: 'Düşer' };

export function toPicksPhase(v: unknown): PicksPhase {
  return PICKS_PHASES.includes(v as PicksPhase) ? (v as PicksPhase) : 'upcoming';
}

/** Seçimler açıldı mı (başkalarının seçimleri artık görülebilir) */
export function isRevealedPhase(phase: PicksPhase): boolean {
  return phase === 'revealed' || phase === 'live' || phase === 'settling' || phase === 'finished';
}

/** Hafta bitti / sonuç hesaplanıyor */
export function isResultPhase(phase: PicksPhase): boolean {
  return phase === 'settling' || phase === 'finished';
}

function toAssetType(v: unknown): AssetType {
  return ASSET_TYPES.includes(v as AssetType) ? (v as AssetType) : 'stock';
}

function toCurrency(v: unknown): string {
  const c = str(v).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : 'TRY';
}

/* ------------------------------------------------------------------ */
/* Normalleştiriciler                                                   */
/* ------------------------------------------------------------------ */

export function toWeeklyPick(raw: any, forceMe = false): WeeklyPick {
  const username = str(raw?.username, '—');
  return {
    id: str(raw?.id),
    username,
    avatar_id: strOrNull(raw?.avatar_id),
    frame_id: strOrNull(raw?.frame_id),
    asset_type: toAssetType(raw?.asset_type),
    symbol: str(raw?.symbol).toUpperCase(),
    name: str(raw?.name, str(raw?.symbol)),
    direction: raw?.direction === 'down' ? 'down' : 'up',
    note: raw?.note_hidden === true ? null : (strOrNull(raw?.note)?.trim() ?? null),
    note_hidden: raw?.note_hidden === true,
    submitted_at: str(raw?.submitted_at),
    entry_price: numOrNull(raw?.entry_price),
    current_price: numOrNull(raw?.current_price),
    exit_price: numOrNull(raw?.exit_price),
    quote_currency: toCurrency(raw?.quote_currency),
    return_pct: numOrNull(raw?.return_pct),
    rank: raw?.rank == null ? null : Math.max(1, Math.floor(num(raw.rank, 1))),
    status: raw?.status === 'void' ? 'void' : 'active',
    void_reason: raw?.status === 'void' && (raw?.void_reason === 'no_entry_price' || raw?.void_reason === 'no_exit_price') ? raw.void_reason : null,
    is_me: forceMe || raw?.is_me === true,
  };
}

function toCrowdAsset(raw: any): PicksCrowdAsset {
  const up = Math.max(0, Math.floor(num(raw?.up)));
  const down = Math.max(0, Math.floor(num(raw?.down)));
  return {
    asset_type: toAssetType(raw?.asset_type),
    symbol: str(raw?.symbol).toUpperCase(),
    name: str(raw?.name, str(raw?.symbol)),
    picks: Math.max(up + down, Math.floor(num(raw?.picks))),
    up,
    down,
    avg_return_pct: numOrNull(raw?.avg_return_pct),
    change_pct: numOrNull(raw?.change_pct),
  };
}

export function toPicksCrowd(raw: any): PicksCrowd | null {
  if (!raw || typeof raw !== 'object') return null;
  const bullish = numOrNull(raw.bullish_pct);
  const beat = numOrNull(raw.beat_pct);
  return {
    participants: Math.max(0, Math.floor(num(raw.participants))),
    bullish_pct: bullish == null ? null : clamp(bullish, 0, 100),
    crowd_return_pct: numOrNull(raw.crowd_return_pct),
    beat_pct: beat == null ? null : clamp(beat, 0, 100),
    top_assets: arr(raw.top_assets).map(toCrowdAsset).filter((a) => a.symbol),
  };
}

function toRewardTier(raw: any): PicksRewardTier {
  return { rank: Math.max(1, Math.floor(num(raw?.rank, 1))), coins: Math.max(0, Math.round(num(raw?.coins))), xp: Math.max(0, Math.round(num(raw?.xp))) };
}

/**
 * Hafta görünümü. Savunmacı gizlilik: açılıştan önce (upcoming / submit) sunucu yanlışlıkla
 * başkalarının seçimlerini ya da kitle özetini gönderse bile atılır; yalnızca kendi seçimim kalır.
 */
export function toPicksWeek(raw: any): PicksWeek {
  const phase = toPicksPhase(raw?.phase);
  const revealed = isRevealedPhase(phase);
  const myRaw = raw?.my_pick && typeof raw.my_pick === 'object' ? raw.my_pick : null;
  const picks = revealed && Array.isArray(raw?.picks) ? raw.picks.map((p: any) => toWeeklyPick(p)).filter((p: WeeklyPick) => p.id || p.symbol) : null;
  return {
    week_id: str(raw?.week_id ?? raw?.id),
    phase,
    opens_at: str(raw?.opens_at),
    reveal_at: str(raw?.reveal_at),
    starts_at: str(raw?.starts_at),
    ends_at: str(raw?.ends_at),
    participants: Math.max(0, Math.floor(num(raw?.participants))),
    my_pick: myRaw ? toWeeklyPick(myRaw, true) : null,
    picks,
    crowd: revealed ? toPicksCrowd(raw?.crowd) : null,
    standings_updated_at: strOrNull(raw?.standings_updated_at),
    my_rank: raw?.my_rank == null ? null : Math.max(1, Math.floor(num(raw.my_rank, 1))),
    rewards: {
      top: arr(raw?.rewards?.top)
        .map(toRewardTier)
        .sort((a, b) => a.rank - b.rank),
      participation_xp: Math.max(0, Math.round(num(raw?.rewards?.participation_xp))),
    },
    comments_count: revealed && raw?.comments_count != null ? Math.max(0, Math.floor(num(raw.comments_count))) : null,
  };
}

/** GET /picks/current; `receivedAt` (istemci saati) ile sunucu saat farkı hesaplanır. */
export function toPicksCurrent(raw: any, receivedAt: number = Date.now()): PicksCurrent {
  const serverNow = strOrNull(raw?.server_now);
  const parsed = serverNow ? Date.parse(serverNow) : NaN;
  return {
    server_now: serverNow ?? new Date(receivedAt).toISOString(),
    clock_offset_ms: Number.isFinite(parsed) ? parsed - receivedAt : 0,
    active: toPicksWeek(raw?.active),
    previous: raw?.previous && typeof raw.previous === 'object' ? toPicksWeek(raw.previous) : null,
  };
}

export function toPicksWeekSummary(raw: any): PicksWeekSummary {
  const w = raw?.winner;
  const my = raw?.my;
  return {
    week_id: str(raw?.week_id ?? raw?.id),
    starts_at: str(raw?.starts_at),
    ends_at: str(raw?.ends_at),
    phase: toPicksPhase(raw?.phase),
    participants: Math.max(0, Math.floor(num(raw?.participants))),
    winner: w && typeof w === 'object' && w.username ? { username: str(w.username), avatar_id: strOrNull(w.avatar_id), return_pct: numOrNull(w.return_pct) } : null,
    crowd_return_pct: numOrNull(raw?.crowd_return_pct),
    my:
      my && typeof my === 'object'
        ? { return_pct: numOrNull(my.return_pct), rank: my.rank == null ? null : Math.max(1, Math.floor(num(my.rank, 1))), status: str(my.status, 'active') }
        : null,
  };
}

export function toPicksWeekPage(raw: any): PicksWeekPage {
  const items = arr(raw?.items ?? raw).map(toPicksWeekSummary).filter((w) => w.week_id);
  return { items, total: Math.max(items.length, Math.floor(num(raw?.total, items.length))) };
}

export function toPicksAsset(raw: any): PicksAsset {
  return {
    asset_type: toAssetType(raw?.asset_type ?? raw?.type),
    symbol: str(raw?.symbol).toUpperCase(),
    name: str(raw?.name, str(raw?.symbol)),
    price: numOrNull(raw?.price),
    quote_currency: toCurrency(raw?.quote_currency),
    change_24h_pct: numOrNull(raw?.change_24h_pct),
  };
}

export function toPicksAssets(raw: any): PicksAsset[] {
  return arr(raw?.items ?? raw)
    .map(toPicksAsset)
    .filter((a) => a.symbol);
}

export function toPicksComment(raw: any): PicksComment {
  return {
    id: str(raw?.id),
    username: str(raw?.username, '—'),
    avatar_id: strOrNull(raw?.avatar_id),
    text: str(raw?.text),
    created_at: str(raw?.created_at),
    is_me: raw?.is_me === true,
  };
}

export function toPicksCommentPage(raw: any): PicksCommentPage {
  const items = arr(raw?.items ?? raw)
    .map(toPicksComment)
    .filter((c) => c.id);
  return { items: sortComments(items), has_more: raw?.has_more === true };
}

/* ------------------------------------------------------------------ */
/* Zaman                                                                */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');

/** Geri sayım: "1 g 04:12:33"; bir günden azsa "04:12:33". Negatif / geçersiz → 00:00:00. */
export function formatPicksCountdown(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const days = Math.floor(total / 86_400);
  const clock = `${pad(Math.floor((total % 86_400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return days > 0 ? `${days} g ${clock}` : clock;
}

export interface PhaseDeadline {
  /** ISO; evre sonu yoksa null */
  at: string | null;
  /** "Açılışa", "Yarışın başlamasına" … */
  label: string;
}

/** Evrenin bir sonraki dönüm noktası (geri sayım hedefi). */
export function phaseDeadline(week: Pick<PicksWeek, 'phase' | 'opens_at' | 'reveal_at' | 'starts_at' | 'ends_at'>): PhaseDeadline {
  switch (week.phase) {
    case 'upcoming':
      return { at: week.opens_at || null, label: 'Seçimlerin açılmasına' };
    case 'submit':
      return { at: week.reveal_at || null, label: 'Açılışa' };
    case 'revealed':
      return { at: week.starts_at || null, label: 'Yarışın başlamasına' };
    case 'live':
      return { at: week.ends_at || null, label: 'Haftanın bitmesine' };
    default:
      return { at: null, label: '' };
  }
}

const TZ = 'Europe/Istanbul';

function validDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Pazar 15:00" (İstanbul saati) */
export function formatDayTime(iso: string | null | undefined): string {
  const d = validDate(iso);
  if (!d) return '—';
  const day = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, weekday: 'long' }).format(d);
  return `${day} ${formatClock(iso)}`;
}

/** "15:00" (İstanbul saati) */
export function formatClock(iso: string | null | undefined): string {
  const d = validDate(iso);
  if (!d) return '—';
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

/** "Paz 15:00" (kısa gün + saat, İstanbul saati) */
export function formatShortDayTime(iso: string | null | undefined): string {
  const d = validDate(iso);
  if (!d) return '—';
  return `${formatShortDay(iso)} ${formatClock(iso)}`;
}

/** "Pzt" (kısa gün, İstanbul saati); `offsetMs` ile bir an öncesi / sonrası */
export function formatShortDay(iso: string | null | undefined, offsetMs = 0): string {
  const d = validDate(iso);
  if (!d) return '—';
  return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, weekday: 'short' }).format(new Date(d.getTime() + offsetMs));
}

/** "12 Eki 14:22" (İstanbul saati) */
export function formatShortDateTime(iso: string | null | undefined): string {
  const d = validDate(iso);
  if (!d) return '—';
  const day = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short' }).format(d);
  return `${day} ${formatClock(iso)}`;
}

/**
 * Yarış haftasının etiketi (Pazartesi – Cuma): "13–17 Ekim", ay değişirse "29 Eylül – 3 Ekim".
 * `ends_at` Cumartesi 00:00 olduğundan bitiş günü bir an öncesidir.
 */
export function weekRangeLabel(startsAt: string, endsAt: string, withYear = false): string {
  const s = validDate(startsAt);
  const e0 = validDate(endsAt);
  if (!s || !e0) return 'Haftalık seçim';
  const e = new Date(e0.getTime() - 1);
  const part = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, ...o }).format(d);
  const sDay = part(s, { day: 'numeric' });
  const eDay = part(e, { day: 'numeric' });
  const sMonth = part(s, { month: 'long' });
  const eMonth = part(e, { month: 'long' });
  const year = withYear ? ` ${part(e, { year: 'numeric' })}` : '';
  return sMonth === eMonth ? `${sDay}–${eDay} ${eMonth}${year}` : `${sDay} ${sMonth} – ${eDay} ${eMonth}${year}`;
}

/* ------------------------------------------------------------------ */
/* Türkçe ekler (sayılar)                                               */
/* ------------------------------------------------------------------ */

const ONES = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
const BACK = 'aıou';
const VOWELS = 'aeıioöuü';

/** Sayının okunuşundaki son kelime (ekin uyumu buna göre seçilir). */
function lastSpokenWord(n: number): string {
  const v = Math.abs(Math.round(n));
  if (v === 0) return 'sıfır';
  if (v % 10 !== 0) return ONES[v % 10];
  if (v % 100 !== 0) return TENS[(v % 100) / 10];
  if (v % 1000 !== 0) return 'yüz';
  return 'bin';
}

function lastVowel(word: string): string {
  for (let i = word.length - 1; i >= 0; i--) if (VOWELS.includes(word[i])) return word[i];
  return 'e';
}

/** Dört yönlü ünlü uyumu (ı / i / u / ü) */
function harmonyI(word: string): string {
  const v = lastVowel(word);
  return v === 'a' || v === 'ı' ? 'ı' : v === 'e' || v === 'i' ? 'i' : v === 'o' || v === 'u' ? 'u' : 'ü';
}

/** İki yönlü ünlü uyumu (a / e) */
function harmonyA(word: string): string {
  return BACK.includes(lastVowel(word)) ? 'a' : 'e';
}

/** "%62'sinden", "%40'ından", "%30'undan", "%100'ünden" için ek: sinden / ından / undan / ünden */
export function trAblativeSuffix(n: number): string {
  const w = lastSpokenWord(n);
  const endsWithVowel = VOWELS.includes(w[w.length - 1]);
  return `${endsWithVowel ? 's' : ''}${harmonyI(w)}nd${harmonyA(w)}n`;
}

/** "15:00'te", "14:30'da", "12:00'de" için bulunma eki: te / ta / de / da */
export function trLocativeSuffix(n: number): string {
  const w = lastSpokenWord(n);
  const hard = 'fstkçşhp'.includes(w[w.length - 1]);
  return `${hard ? 't' : 'd'}${harmonyA(w)}`;
}

/** "Pazar 15:00'te" (İstanbul saati, doğru ekle) */
export function atDayTime(iso: string | null | undefined): string {
  const clock = formatClock(iso);
  if (clock === '—') return 'açılış saatinde';
  const [h, m] = clock.split(':').map(Number);
  return `${formatDayTime(iso)}'${trLocativeSuffix(m === 0 ? h : m)}`;
}

/* ------------------------------------------------------------------ */
/* Merkez rozeti ve düzenleme                                           */
/* ------------------------------------------------------------------ */

/**
 * Oyun Merkezi'ndeki "Haftalık Seçim" kutusunun rozeti:
 * seçim açık ve henüz seçim yapmadım → "Seçim açık"; yarış sürüyor → "Canlı";
 * bitmiş bir haftada yer aldıysam (yeni yarış başlayana dek) → "Sonuçlar".
 */
export function picksHubBadge(current: Pick<PicksCurrent, 'active' | 'previous'> | null | undefined): string | null {
  if (!current) return null;
  const { active, previous } = current;
  if (active.phase === 'submit' && !active.my_pick) return 'Seçim açık';
  if (active.phase === 'live') return 'Canlı';
  if (active.phase === 'finished' && active.my_pick) return 'Sonuçlar';
  if (previous?.phase === 'finished' && previous.my_pick && (active.phase === 'upcoming' || active.phase === 'submit' || active.phase === 'revealed')) return 'Sonuçlar';
  return null;
}

/** Seçim yapılabilir / düzenlenebilir mi (sunucu saatine göre açılıştan önce). */
export function canEditPick(week: Pick<PicksWeek, 'phase' | 'reveal_at'>, serverNowMs: number): boolean {
  if (week.phase !== 'submit') return false;
  const reveal = Date.parse(week.reveal_at);
  return !Number.isFinite(reveal) || serverNowMs < reveal;
}

/** Not / yorum doğrulaması: hata metni ya da null. */
export function validateText(text: string, max: number, required: boolean): string | null {
  const t = text.trim();
  if (required && !t) return 'Boş gönderilemez.';
  if (t.length > max) return `En fazla ${max} karakter yazabilirsin.`;
  return null;
}

/* ------------------------------------------------------------------ */
/* Kitle                                                                */
/* ------------------------------------------------------------------ */

/**
 * Yükselir / düşer bölünmüş çubuğun genişlikleri (toplam 100). Sıfır olmayan taraf en az `minPct`
 * kadar görünür kalır; ikisi de sıfırsa {0, 0}.
 */
export function splitWidths(up: number, down: number, minPct = 6): { up: number; down: number } {
  const u = Math.max(0, Number.isFinite(up) ? up : 0);
  const d = Math.max(0, Number.isFinite(down) ? down : 0);
  const total = u + d;
  if (total <= 0) return { up: 0, down: 0 };
  let upW = (u / total) * 100;
  if (u > 0 && d > 0) upW = clamp(upW, minPct, 100 - minPct);
  upW = Math.round(upW * 10) / 10;
  return { up: upW, down: Math.round((100 - upW) * 10) / 10 };
}

/** Seçimlerden kitle özeti (sunucu özeti yoksa yedek): en çok seçilenler önce. */
export function crowdFromPicks(picks: WeeklyPick[] | null | undefined): PicksCrowdAsset[] {
  const map = new Map<string, PicksCrowdAsset & { sum: number; n: number }>();
  for (const p of picks ?? []) {
    if (p.status === 'void') continue;
    const key = `${p.asset_type}:${p.symbol}`;
    const cur = map.get(key) ?? { asset_type: p.asset_type, symbol: p.symbol, name: p.name, picks: 0, up: 0, down: 0, avg_return_pct: null, change_pct: null, sum: 0, n: 0 };
    cur.picks += 1;
    if (p.direction === 'up') cur.up += 1;
    else cur.down += 1;
    if (p.return_pct != null) {
      cur.sum += p.return_pct;
      cur.n += 1;
    }
    map.set(key, cur);
  }
  return [...map.values()]
    .map(({ sum, n, ...a }) => ({ ...a, avg_return_pct: n ? sum / n : null }))
    .sort((a, b) => b.picks - a.picks || a.symbol.localeCompare(b.symbol, 'tr'));
}

/** Kitlenin en çok seçtiği varlıklar (sunucu özeti, yoksa seçimlerden). */
export function crowdTopAssets(week: Pick<PicksWeek, 'crowd' | 'picks'>, limit = 5): PicksCrowdAsset[] {
  const list = week.crowd?.top_assets.length ? week.crowd.top_assets : crowdFromPicks(week.picks);
  return list.slice(0, limit);
}

/** Yükselir diyenlerin yüzdesi (sunucu, yoksa seçimlerden). */
export function bullishPct(week: Pick<PicksWeek, 'crowd' | 'picks'>): number | null {
  const active = (week.picks ?? []).filter((p) => p.status !== 'void');
  // Katılımcı yoksa sunucunun 0'ı "herkes düşer dedi" anlamına gelmez
  if (week.crowd?.bullish_pct != null && (week.crowd.participants > 0 || active.length > 0)) return week.crowd.bullish_pct;
  if (!active.length) return null;
  return (active.filter((p) => p.direction === 'up').length / active.length) * 100;
}

/** "Kitle portföyü katılımcıların %62'sinden daha iyi yaptı." */
export function beatText(beatPct: number | null | undefined): string | null {
  if (beatPct == null || !Number.isFinite(beatPct)) return null;
  const v = Math.round(clamp(beatPct, 0, 100));
  return `Kitle portföyü katılımcıların %${v}'${trAblativeSuffix(v)} daha iyi yaptı.`;
}

/* ------------------------------------------------------------------ */
/* Sıralama ve karşılaştırma                                            */
/* ------------------------------------------------------------------ */

/** Sıralama: geçerli seçimler önce; sıra (küçük önce, yoksa sonda), sonra getiri (büyük önce). */
export function sortStandings(picks: WeeklyPick[] | null | undefined): WeeklyPick[] {
  return [...(picks ?? [])].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'void' ? 1 : -1;
    if (a.rank != null || b.rank != null) {
      if (a.rank == null) return 1;
      if (b.rank == null) return -1;
      if (a.rank !== b.rank) return a.rank - b.rank;
    }
    const ra = a.return_pct ?? -Infinity;
    const rb = b.return_pct ?? -Infinity;
    if (ra !== rb) return rb - ra;
    return a.username.localeCompare(b.username, 'tr');
  });
}

/** Sıralamada görünen yer: sunucu sırası, yoksa liste sırası. */
export function displayRank(pick: WeeklyPick, index: number): number | null {
  if (pick.status === 'void') return null;
  return pick.rank ?? index + 1;
}

/** Kürsü: ilk üç (2 · 1 · 3 sırasıyla, ortada birinci). */
export function podiumPicks(picks: WeeklyPick[] | null | undefined): WeeklyPick[] {
  const top = sortStandings(picks)
    .filter((p) => p.status !== 'void')
    .slice(0, 3)
    .map((p, i) => ({ ...p, rank: p.rank ?? i + 1 }));
  return [top[1], top[0], top[2]].filter(Boolean) as WeeklyPick[];
}

export interface CompareBar {
  key: string;
  label: string;
  value: number | null;
  /** Sıfır çizgisinden itibaren genişlik (yarım izin yüzdesi, 0..100) */
  width: number;
  tone: 'up' | 'down' | 'flat';
}

/** "Kitle portföyü / Sen / Lider" karşılaştırması: sıfır merkezli, en büyük mutlak değere göre ölçekli. */
export function compareBars(items: { key: string; label: string; value: number | null | undefined }[]): CompareBar[] {
  const vals = items.map((i) => (i.value != null && Number.isFinite(i.value) ? i.value : null));
  const maxAbs = Math.max(0, ...vals.map((v) => (v == null ? 0 : Math.abs(v))));
  return items.map((i, idx) => {
    const v = vals[idx];
    const width = v == null || maxAbs === 0 ? 0 : Math.round((Math.abs(v) / maxAbs) * 1000) / 10;
    const r = v == null ? 0 : Math.round(v * 100);
    return { key: i.key, label: i.label, value: v, width, tone: r > 0 ? 'up' : r < 0 ? 'down' : 'flat' };
  });
}

/* ------------------------------------------------------------------ */
/* Ödüller                                                              */
/* ------------------------------------------------------------------ */

export function rewardForRank(week: Pick<PicksWeek, 'rewards'>, rank: number | null | undefined): PicksRewardTier | null {
  if (rank == null) return null;
  return week.rewards.top.find((t) => t.rank === rank) ?? null;
}

/** Hafta bitti, seçimim geçerli ve ilk üçteyim → ödül penceresi gösterilebilir. */
export function placedInWeek(week: PicksWeek): boolean {
  if (week.phase !== 'finished' || !week.my_pick || week.my_pick.status === 'void') return false;
  const rank = week.my_rank ?? week.my_pick.rank;
  return rank != null && rank <= 3;
}

export interface PicksRewardItem {
  kind: 'coins' | 'xp';
  amount: number;
  label: string;
}

/** Ödül penceresinin kalemleri (sıra ödülü + katılım XP). */
export function weekRewardItems(week: PicksWeek): PicksRewardItem[] {
  const rank = week.my_rank ?? week.my_pick?.rank ?? null;
  const tier = rewardForRank(week, rank);
  const out: PicksRewardItem[] = [];
  if (tier?.coins) out.push({ kind: 'coins', amount: tier.coins, label: 'Jeton' });
  if (tier?.xp) out.push({ kind: 'xp', amount: tier.xp, label: 'XP' });
  if (week.my_pick && week.my_pick.status !== 'void' && week.rewards.participation_xp > 0) {
    out.push({ kind: 'xp', amount: week.rewards.participation_xp, label: 'Katılım XP' });
  }
  return out;
}

/** localStorage anahtarları (bir kez gösterilecek anlar) */
export const rewardSeenKey = (weekId: string) => `pg:picks:reward-seen:${weekId}`;
export const revealSeenKey = (weekId: string) => `pg:picks:reveal-seen:${weekId}`;

/* ------------------------------------------------------------------ */
/* Biçim ve yorumlar                                                    */
/* ------------------------------------------------------------------ */

function priceDigits(value: number, assetType?: AssetType): number {
  const abs = Math.abs(value);
  if (abs === 0) return 2;
  if (abs < 0.01) return 6;
  if (abs < 1) return 4;
  if (assetType === 'currency' && abs < 1000) return 4;
  return 2;
}

/** Fiyat, kendi para biriminde tr-TR biçimiyle: "₺312,50", "$1.234,56". */
export function formatQuote(value: number | null | undefined, currency: string, assetType?: AssetType): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const digits = priceDigits(value, assetType);
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  } catch {
    return `${value.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${currency}`;
  }
}

/** Kronolojik (eskiden yeniye) — tartışmada en yeni en altta. */
export function sortComments(items: PicksComment[]): PicksComment[] {
  return [...items].sort((a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0) || a.id.localeCompare(b.id));
}

/** İki yorum listesini kimliğe göre birleştirir (sonraki kazanır), kronolojik sıralar; silinenleri atar. */
export function mergeComments(a: PicksComment[], b: PicksComment[], removed: ReadonlySet<string> = new Set()): PicksComment[] {
  const map = new Map<string, PicksComment>();
  for (const c of [...a, ...b]) if (!removed.has(c.id)) map.set(c.id, c);
  return sortComments([...map.values()]);
}

/** Pick / yorum hata kodları → oyun dilinde mesaj (`retryAfter` saniye) */
export function picksErrorText(code: string | null | undefined, fallback?: string | null, retryAfter?: number | null): string {
  const wait = retryAfter && retryAfter > 0 ? (retryAfter >= 120 ? ` ${Math.ceil(retryAfter / 60)} dakika sonra` : ` ${Math.ceil(retryAfter)} saniye sonra`) : ' biraz sonra';
  if (code === 'PICKS_CLOSED') return 'Seçim süresi doldu: zarflar mühürlendi, artık değişiklik yapılamaz.';
  if (code === 'ASSET_UNAVAILABLE') return 'Bu varlık şu an seçilemiyor. Başka bir varlık dene.';
  if (code === 'PICKS_HIDDEN') return 'Tartışma seçimler açıldığında başlar.';
  if (code === 'RATE_LIMITED') return `Biraz hızlı gittin.${wait} tekrar dene.`;
  if (code === 'COMMENT_DAILY_LIMIT') return `Bugünkü yorum sınırına ulaştın.${wait} yeniden yazabilirsin.`;
  if (code === 'COMMENT_NOT_FOUND') return 'Bu yorum artık yok.';
  if (code === 'WEEK_NOT_FOUND') return 'Bu hafta bulunamadı.';
  if (code === 'FORBIDDEN') return 'Bu işlem için yetkin yok.';
  return fallback?.trim() || 'Bir şeyler ters gitti. Lütfen tekrar dene.';
}

/** Geçersiz seçim açıklaması (fiyat verisi yok → sıralama dışı) */
export function voidText(pick: Pick<WeeklyPick, 'void_reason'>): string {
  if (pick.void_reason === 'no_entry_price') return 'Fiyat verisi yok — sıralama dışı (giriş fiyatı alınamadı).';
  if (pick.void_reason === 'no_exit_price') return 'Fiyat verisi yok — sıralama dışı (kapanış fiyatı alınamadı).';
  return 'Fiyat verisi yok — sıralama dışı.';
}

export const NOTE_HIDDEN_TEXT = 'Not yönetici tarafından gizlendi';
