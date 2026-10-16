import { AppError } from '../utils/errors';
import type { AssetType } from '../types';

/**
 * ABD hisse piyasası (NYSE/NASDAQ) seans takvimi.
 *
 * - Normal seans 09:30–16:00 America/New_York; yaz saati (DST) geçişleri Intl ile çözülür
 *   (TSİ karşılığı yazın 16:30–23:00, kışın 17:30–00:00).
 * - Hafta sonları ve NYSE tatilleri kapalı; erken kapanış günlerinde seans 13:00'te biter.
 *   Takvim 2026–2027 için sabit kodludur (kaynak: NYSE "Holidays & Trading Hours"); listede olmayan
 *   yıllarda yalnızca hafta sonları kapalı sayılır → her yıl NYSE_HOLIDAYS / NYSE_EARLY_CLOSES güncellenmeli.
 * - Saf fonksiyonlar (getUsEquitySession) verilen ana bakar; uygulama saati `marketClock` üzerinden
 *   alınır ve testlerde / yerel geliştirmede kaydırılabilir.
 * - Uygulama: US_MARKET_HOURS=off → hisseler 7/24 açık sayılır (backend testleri böyle çalışır).
 *
 * Kripto 7/24; döviz ve emtia bu modülden etkilenmez (mevcut davranış).
 */

export const NYSE_TIMEZONE = 'America/New_York';
/** Gün başından dakika (New York yerel saati) */
export const NYSE_OPEN_MINUTES = 9 * 60 + 30;
export const NYSE_CLOSE_MINUTES = 16 * 60;
export const NYSE_EARLY_CLOSE_MINUTES = 13 * 60;

/** NYSE tam gün tatilleri (New York takvim günü → ad) */
export const NYSE_HOLIDAYS: Readonly<Record<string, string>> = {
  '2026-01-01': 'Yılbaşı',
  '2026-01-19': 'Martin Luther King Jr. Günü',
  '2026-02-16': 'Başkanlar Günü',
  '2026-04-03': 'Kutsal Cuma',
  '2026-05-25': 'Anma Günü',
  '2026-06-19': 'Juneteenth',
  '2026-07-03': 'Bağımsızlık Günü (gözlemlenen)',
  '2026-09-07': 'İşçi Bayramı',
  '2026-11-26': 'Şükran Günü',
  '2026-12-25': 'Noel',
  '2027-01-01': 'Yılbaşı',
  '2027-01-18': 'Martin Luther King Jr. Günü',
  '2027-02-15': 'Başkanlar Günü',
  '2027-03-26': 'Kutsal Cuma',
  '2027-05-31': 'Anma Günü',
  '2027-06-18': 'Juneteenth (gözlemlenen)',
  '2027-07-05': 'Bağımsızlık Günü (gözlemlenen)',
  '2027-09-06': 'İşçi Bayramı',
  '2027-11-25': 'Şükran Günü',
  '2027-12-24': 'Noel (gözlemlenen)',
};

/** Erken kapanış (13:00 New York) günleri */
export const NYSE_EARLY_CLOSES: Readonly<Record<string, string>> = {
  '2026-11-27': 'Şükran Günü ertesi',
  '2026-12-24': 'Noel arifesi',
  '2027-11-26': 'Şükran Günü ertesi',
};

/** Takvimin kapsadığı son yıl (sonrası için yalnızca hafta sonu kuralı) */
export const NYSE_CALENDAR_LAST_YEAR = 2027;

export type UsSessionClosedReason = 'weekend' | 'holiday' | 'pre_open' | 'after_close';

export interface UsEquitySession {
  /** Şu an normal seans içinde mi */
  open: boolean;
  /** Kapalıysa nedeni */
  reason: UsSessionClosedReason | null;
  /** Bugün (New York takvim günü) tatilse adı */
  holiday: string | null;
  /** Bugünün seansı erken kapanıyorsa true */
  early_close: boolean;
  /** Bugünün (New York) seansı — işlem günü değilse null */
  session_open_at: Date | null;
  session_close_at: Date | null;
  /** Bir sonraki açılış (açıksa: bir sonraki işlem gününün açılışı) */
  next_open_at: Date;
  /** Açıksa bugünkü kapanış; kapalıysa next_open_at seansının kapanışı */
  next_close_at: Date;
  /** next_open_at seansı erken mi kapanıyor */
  next_early_close: boolean;
}

// ---------------------------------------------------------------------------
// Saat dilimi yardımcıları (Intl; DST otomatik)
// ---------------------------------------------------------------------------

interface YMD {
  y: number;
  m: number;
  d: number;
}

const nyFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: NYSE_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function nyParts(at: Date): YMD & { hh: number; mm: number; ss: number } {
  const p: Record<string, number> = {};
  for (const part of nyFormatter.formatToParts(at)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { y: p.year, m: p.month, d: p.day, hh: p.hour === 24 ? 0 : p.hour, mm: p.minute, ss: p.second };
}

/** New York yerel saatinin UTC'den farkı (ms; ör. EDT → −4 sa) */
function nyOffsetMs(at: Date): number {
  const p = nyParts(at);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** New York duvar saatini (gün + dakika) UTC anına çevirir. 09:30/13:00/16:00 DST boşluğuna denk gelmez. */
export function nyWallTimeToUtc(day: YMD, minutes: number): Date {
  const guess = Date.UTC(day.y, day.m - 1, day.d, 0, minutes);
  const first = guess - nyOffsetMs(new Date(guess));
  const second = guess - nyOffsetMs(new Date(first));
  return new Date(second);
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (day: YMD) => `${day.y}-${pad(day.m)}-${pad(day.d)}`;

function addDays(day: YMD, n: number): YMD {
  const t = new Date(Date.UTC(day.y, day.m - 1, day.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

const weekday = (day: YMD) => new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay();

/** İşlem günü mü (hafta içi ve tatil değil) */
export function isNyseTradingDay(day: YMD): boolean {
  const wd = weekday(day);
  return wd >= 1 && wd <= 5 && !NYSE_HOLIDAYS[dayKey(day)];
}

function sessionBounds(day: YMD): { openAt: Date; closeAt: Date; early: boolean } {
  const early = !!NYSE_EARLY_CLOSES[dayKey(day)];
  return {
    openAt: nyWallTimeToUtc(day, NYSE_OPEN_MINUTES),
    closeAt: nyWallTimeToUtc(day, early ? NYSE_EARLY_CLOSE_MINUTES : NYSE_CLOSE_MINUTES),
    early,
  };
}

function nextTradingDay(after: YMD): YMD {
  let day = addDays(after, 1);
  // En uzun kapalı aralık birkaç gündür; 30 gün güvenlik sınırı
  for (let i = 0; i < 30 && !isNyseTradingDay(day); i++) day = addDays(day, 1);
  return day;
}

/** Verilen anda ABD hisse seansının durumu (saf fonksiyon). */
export function getUsEquitySession(now: Date): UsEquitySession {
  const p = nyParts(now);
  const today: YMD = { y: p.y, m: p.m, d: p.d };
  const holiday = NYSE_HOLIDAYS[dayKey(today)] ?? null;
  const trading = isNyseTradingDay(today);
  const t = now.getTime();

  if (trading) {
    const s = sessionBounds(today);
    if (t >= s.openAt.getTime() && t < s.closeAt.getTime()) {
      const next = sessionBounds(nextTradingDay(today));
      return {
        open: true,
        reason: null,
        holiday: null,
        early_close: s.early,
        session_open_at: s.openAt,
        session_close_at: s.closeAt,
        next_open_at: next.openAt,
        next_close_at: s.closeAt,
        next_early_close: next.early,
      };
    }
    if (t < s.openAt.getTime()) {
      return {
        open: false,
        reason: 'pre_open',
        holiday: null,
        early_close: s.early,
        session_open_at: s.openAt,
        session_close_at: s.closeAt,
        next_open_at: s.openAt,
        next_close_at: s.closeAt,
        next_early_close: s.early,
      };
    }
    const next = sessionBounds(nextTradingDay(today));
    return {
      open: false,
      reason: 'after_close',
      holiday: null,
      early_close: s.early,
      session_open_at: s.openAt,
      session_close_at: s.closeAt,
      next_open_at: next.openAt,
      next_close_at: next.closeAt,
      next_early_close: next.early,
    };
  }

  const next = sessionBounds(nextTradingDay(today));
  const wd = weekday(today);
  return {
    open: false,
    reason: wd === 0 || wd === 6 ? 'weekend' : 'holiday',
    holiday,
    early_close: false,
    session_open_at: null,
    session_close_at: null,
    next_open_at: next.openAt,
    next_close_at: next.closeAt,
    next_early_close: next.early,
  };
}

// ---------------------------------------------------------------------------
// Uygulama saati (testlerde / yerel geliştirmede kaydırılabilir)
// ---------------------------------------------------------------------------

let offsetMs: number | null = null;

export const marketClock = {
  now(): Date {
    return new Date(Date.now() + (offsetMs ?? 0));
  },
  /** Saati verilen ana kaydır (null → gerçek saat) */
  set(at: Date | null): void {
    offsetMs = at === null ? null : at.getTime() - Date.now();
  },
  reset(): void {
    offsetMs = null;
  },
  isOverridden(): boolean {
    return offsetMs !== null;
  },
};

/** US_MARKET_HOURS=off → seans kuralı uygulanmaz (hisseler 7/24 işlem görür). Varsayılan: uygulanır. */
export function usMarketHoursEnforced(): boolean {
  return (process.env.US_MARKET_HOURS ?? '').trim().toLowerCase() !== 'off';
}

/** Hisse işlemleri için etkin durum: kural kapalıysa her zaman açık. */
export function stockMarketState(now: Date = marketClock.now()): { open: boolean; enforced: boolean; session: UsEquitySession } {
  const session = getUsEquitySession(now);
  const enforced = usMarketHoursEnforced();
  return { open: enforced ? session.open : true, enforced, session };
}

const trFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: 'numeric',
  month: 'long',
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

/** "16 Ekim Cuma 16:30" (TSİ) */
export function formatTrDateTime(at: Date): string {
  return trFormatter.format(at);
}

/** 409 MARKET_CLOSED: ABD borsası kapalıyken hisse piyasa emri. Yanıtta next_open_at (ISO) bulunur. */
export class MarketClosedError extends AppError {
  readonly nextOpenAt: Date;
  constructor(session: UsEquitySession) {
    super(
      409,
      `ABD borsası şu an kapalı. Açılış: ${formatTrDateTime(session.next_open_at)} (TSİ). Emrinizi açılışta gerçekleştirebilirsiniz.`,
      'MARKET_CLOSED',
      { next_open_at: session.next_open_at.toISOString(), next_close_at: session.next_close_at.toISOString() }
    );
    this.nextOpenAt = session.next_open_at;
  }
}

/** Hisse ise ve seans kapalıysa MarketClosedError fırlatır (kripto/döviz/emtia etkilenmez). */
export function assertMarketOpenFor(assetType: AssetType | undefined, now: Date = marketClock.now()): void {
  if (assetType !== 'stock') return;
  const state = stockMarketState(now);
  if (!state.open) throw new MarketClosedError(state.session);
}

/** JSON yanıtı (GET /api/market/session) */
export function serializeSession(now: Date = marketClock.now()) {
  const { open, enforced, session } = stockMarketState(now);
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    exchange: 'NYSE',
    timezone: NYSE_TIMEZONE,
    open,
    enforced,
    reason: open ? null : session.reason,
    holiday: session.holiday,
    early_close: session.early_close,
    session_open_at: iso(session.session_open_at),
    session_close_at: iso(session.session_close_at),
    next_open_at: session.next_open_at.toISOString(),
    next_close_at: session.next_close_at.toISOString(),
    next_early_close: session.next_early_close,
    server_time: now.toISOString(),
  };
}
