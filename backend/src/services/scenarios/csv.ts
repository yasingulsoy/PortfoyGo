/**
 * Tarihsel seri içe aktarma — SAF ayrıştırıcılar (veritabanına bağlanmaz; birim testli).
 *
 * Desteklenen girdiler:
 *  - rows: [[zaman, fiyat], ...]  (zaman: ISO metni veya epoch saniye/milisaniye; fiyat: sayı veya metin)
 *  - csv : metin. Başlık satırı isteğe bağlıdır. Ayırıcı ',' ';' veya sekme (ilk satırdan algılanır).
 *          Sütunlar: "tarih/zaman, fiyat" | "tarih, saat, fiyat" | "tarih, açılış, yüksek, düşük, kapanış[, hacim]"
 *          (OHLC'de KAPANIŞ kullanılır). Başlık varsa sütunlar adlarından bulunur (date/tarih/time/zaman,
 *          price/fiyat/close/kapanış/şimdi …).
 *  - Sayılar: "1234.56", "1,234.56", "1.234,56", "1234,56" (Türkçe ondalık virgül) — virgüllü ondalık için
 *    ';' ayırıcısı ya da tırnak ("95,5") kullanılmalıdır.
 *  - Zaman: ISO 8601 (saat dilimi yoksa UTC kabul edilir), "YYYY-MM-DD HH:MM[:SS]", "GG.AA.YYYY [SS:DD]",
 *    "GG/AA/YYYY", epoch saniye (< 1e11) veya milisaniye (≥ 1e11).
 *
 * Geçersiz satırlar reddedilir (sayılır, ilk birkaçı nedeniyle döner); aynı zaman damgası tekrar ederse
 * SON değer geçerlidir.
 */

export const MAX_IMPORT_ROWS = 100_000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const REJECT_SAMPLE_LIMIT = 20;

export interface ParsedPoint {
  /** unix milisaniye */
  ts: number;
  price: number;
}

export interface RejectedRow {
  /** 1 tabanlı satır (csv) veya dizi indeksi + 1 (rows) */
  line: number;
  reason: string;
}

export interface ParseResult {
  points: ParsedPoint[];
  /** Okunan veri satırı (başlık ve boş satırlar hariç) */
  total: number;
  rejected: number;
  rejected_samples: RejectedRow[];
  duplicates: number;
}

export class SeriesParseError extends Error {
  constructor(
    message: string,
    readonly code: 'TOO_MANY_ROWS' | 'NO_COLUMNS' | 'EMPTY'
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Sayı
// ---------------------------------------------------------------------------

/**
 * Yerel ayar bağımsız sayı ayrıştırma. Hem '.' hem ',' varsa SONDAKİ ondalık ayırıcıdır.
 * Yalnızca ',' varsa: tek virgül → ondalık (Türkçe), birden çok → binlik.
 * Yalnızca '.' varsa: tek nokta → ondalık, birden çok → binlik (Türkçe "1.234.567").
 */
export function parseLocaleNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/^"(.*)"$/s, '$1').trim();
  s = s.replace(/[\s\u00a0\u202f']/g, '');
  if (!s) return null;
  if (!/^[+-]?[\d.,]+(e[+-]?\d+)?$/i.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const commas = (s.match(/,/g) || []).length;
    s = commas === 1 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const dots = (s.match(/\./g) || []).length;
    if (dots > 1) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Zaman
// ---------------------------------------------------------------------------

function validYear(ms: number): boolean {
  const y = new Date(ms).getUTCFullYear();
  return Number.isFinite(ms) && y >= MIN_YEAR && y <= MAX_YEAR;
}

function utcFromParts(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, msPart = 0): number | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, Math.min(s, 59), msPart);
  const dt = new Date(ms);
  // 31.02 gibi takvimde olmayan günleri reddet
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return ms;
}

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
const SLASH_YMD_RE = /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const DAY_FIRST_RE = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/** Zaman damgası → unix ms (geçersizse null). Saat dilimi verilmemiş metinler UTC kabul edilir. */
export function parseTimestamp(raw: unknown): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const ms = raw >= 1e11 ? raw : raw * 1000;
    return validYear(ms) ? Math.round(ms) : null;
  }
  if (typeof raw !== 'string') return null;
  const s = raw.trim().replace(/^"(.*)"$/s, '$1').trim();
  if (!s) return null;

  if (/^\d+(\.\d+)?$/.test(s)) return parseTimestamp(Number(s));

  let m = ISO_RE.exec(s);
  if (m) {
    const frac = m[7] ? Math.round(Number(`0.${m[7]}`) * 1000) : 0;
    const base = utcFromParts(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0, frac);
    if (base === null) return null;
    let ms = base;
    const tz = m[8];
    if (tz && tz.toUpperCase() !== 'Z') {
      const sign = tz[0] === '-' ? -1 : 1;
      const digits = tz.slice(1).replace(':', '');
      const offMin = parseInt(digits.slice(0, 2), 10) * 60 + parseInt(digits.slice(2, 4), 10);
      if (offMin > 14 * 60) return null;
      ms -= sign * offMin * 60_000;
    }
    return validYear(ms) ? ms : null;
  }
  m = SLASH_YMD_RE.exec(s);
  if (m) {
    const ms = utcFromParts(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
    return ms !== null && validYear(ms) ? ms : null;
  }
  m = DAY_FIRST_RE.exec(s);
  if (m) {
    const ms = utcFromParts(+m[3], +m[2], +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
    return ms !== null && validYear(ms) ? ms : null;
  }
  return null;
}

const TIME_ONLY_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Tek CSV satırını böler (çift tırnaklı alanlar ayırıcı içerebilir; "" → ") */
export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === sep) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Ayırıcıyı ilk anlamlı satırdan algılar (tırnak dışındaki ';' > sekme > ',') */
export function detectSeparator(line: string): ';' | '\t' | ',' {
  const outside = line.replace(/"[^"]*"/g, '');
  if (outside.includes(';')) return ';';
  if (outside.includes('\t')) return '\t';
  return ',';
}

const normHeader = (h: string) =>
  h
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/\u0307/g, '')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');

const DATE_HEADERS = new Set(['date', 'tarih', 'datetime', 'timestamp', 'ts', 'zaman', 'zamandamgasi', 'day', 'gun', 'period']);
const TIME_HEADERS = new Set(['time', 'saat', 'hour']);
const CLOSE_HEADERS = ['close', 'kapanis', 'adjclose', 'closeprice', 'simdi', 'son', 'last', 'price', 'fiyat', 'value', 'deger', 'rate', 'kur'];
const OPEN_HEADERS = new Set(['open', 'acilis']);

interface ColumnMap {
  date: number;
  time: number | null;
  price: number;
}

/** Başlık satırından sütunları bulur; başlık değilse null */
export function columnsFromHeader(cells: string[]): ColumnMap | null {
  const norm = cells.map(normHeader);
  let date = -1;
  let time: number | null = null;
  norm.forEach((h, i) => {
    if (date < 0 && DATE_HEADERS.has(h)) date = i;
    else if (time === null && TIME_HEADERS.has(h)) time = i;
  });
  // "time" tek başına (tarih sütunu yoksa) tarih-zaman sütunudur
  if (date < 0 && time !== null) {
    date = time;
    time = null;
  }
  let price = -1;
  for (const key of CLOSE_HEADERS) {
    const idx = norm.indexOf(key);
    if (idx >= 0 && idx !== date && idx !== time) {
      price = idx;
      break;
    }
  }
  if (date < 0 || price < 0) return null;
  return { date, time, price };
}

/** Başlıksız satır için sütun düzeni (sütun sayısına göre) */
function columnsByShape(cells: string[]): ColumnMap | null {
  const n = cells.length;
  if (n === 2) return { date: 0, time: null, price: 1 };
  // tarih, saat, fiyat | tarih, fiyat, (hacim vb. yok sayılır)
  if (n === 3) return TIME_ONLY_RE.test(cells[1]) ? { date: 0, time: 1, price: 2 } : { date: 0, time: null, price: 1 };
  if (n === 4) return TIME_ONLY_RE.test(cells[1]) ? { date: 0, time: 1, price: 3 } : null;
  if (n >= 5) {
    // tarih, [saat,] açılış, yüksek, düşük, kapanış[, hacim]
    if (TIME_ONLY_RE.test(cells[1]) && n >= 6) return { date: 0, time: 1, price: 5 };
    return { date: 0, time: null, price: 4 };
  }
  return null;
}

function looksLikeHeader(cells: string[]): boolean {
  // İlk hücre zaman olarak ayrışmıyorsa ve hücrelerden en az biri harf içeriyorsa başlıktır
  return parseTimestamp(cells[0]) === null && cells.some((c) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(c));
}

function finish(map: Map<number, number>, total: number, rejected: RejectedRow[], rejectedCount: number, duplicates: number): ParseResult {
  const points = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([ts, price]) => ({ ts, price }));
  return { points, total, rejected: rejectedCount, rejected_samples: rejected.slice(0, REJECT_SAMPLE_LIMIT), duplicates };
}

function validPrice(p: number | null): p is number {
  return p !== null && Number.isFinite(p) && p > 0 && p < 1e13;
}

/** CSV metnini ayrıştırır. MAX_IMPORT_ROWS'tan fazla veri satırı → SeriesParseError(TOO_MANY_ROWS) */
export function parseSeriesCsv(text: string, maxRows: number = MAX_IMPORT_ROWS): ParseResult {
  const lines = String(text ?? '')
    .replace(/^\ufeff/, '')
    .split(/\r\n|\n|\r/);
  const firstIdx = lines.findIndex((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  if (firstIdx < 0) throw new SeriesParseError('CSV boş', 'EMPTY');
  const sep = detectSeparator(lines[firstIdx]);

  let cols: ColumnMap | null = null;
  let start = firstIdx;
  const firstCells = splitCsvLine(lines[firstIdx], sep);
  if (looksLikeHeader(firstCells)) {
    cols = columnsFromHeader(firstCells);
    if (!cols) {
      throw new SeriesParseError(
        'CSV başlığında tarih ve fiyat/kapanış sütunu bulunamadı (ör. "date,close" veya "tarih;fiyat")',
        'NO_COLUMNS'
      );
    }
    start = firstIdx + 1;
  }

  const map = new Map<number, number>();
  const rejected: RejectedRow[] = [];
  let rejectedCount = 0;
  let total = 0;
  let duplicates = 0;
  const reject = (line: number, reason: string) => {
    rejectedCount++;
    if (rejected.length < REJECT_SAMPLE_LIMIT) rejected.push({ line, reason });
  };

  for (let i = start; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith('#')) continue;
    total++;
    if (total > maxRows) throw new SeriesParseError(`En fazla ${maxRows.toLocaleString('tr-TR')} satır içe aktarılabilir`, 'TOO_MANY_ROWS');
    const cells = splitCsvLine(raw, sep);
    const c = cols ?? columnsByShape(cells);
    if (!c) {
      reject(i + 1, `Beklenmeyen sütun sayısı (${cells.length})`);
      continue;
    }
    const dateCell = cells[c.date] ?? '';
    const timeCell = c.time !== null ? cells[c.time] ?? '' : '';
    const ts = parseTimestamp(timeCell ? `${dateCell} ${timeCell}` : dateCell);
    if (ts === null) {
      reject(i + 1, 'Geçersiz tarih/zaman');
      continue;
    }
    const price = parseLocaleNumber(cells[c.price]);
    if (!validPrice(price)) {
      reject(i + 1, 'Geçersiz fiyat (pozitif sayı olmalı)');
      continue;
    }
    if (map.has(ts)) duplicates++;
    map.set(ts, price);
  }
  return finish(map, total, rejected, rejectedCount, duplicates);
}

/** rows: [[zaman, fiyat], ...] dizisini ayrıştırır */
export function parseSeriesRows(rows: unknown[], maxRows: number = MAX_IMPORT_ROWS): ParseResult {
  if (rows.length > maxRows) throw new SeriesParseError(`En fazla ${maxRows.toLocaleString('tr-TR')} satır içe aktarılabilir`, 'TOO_MANY_ROWS');
  const map = new Map<number, number>();
  const rejected: RejectedRow[] = [];
  let rejectedCount = 0;
  let duplicates = 0;
  const reject = (line: number, reason: string) => {
    rejectedCount++;
    if (rejected.length < REJECT_SAMPLE_LIMIT) rejected.push({ line, reason });
  };
  rows.forEach((row, i) => {
    if (!Array.isArray(row) || row.length < 2) {
      reject(i + 1, 'Satır [zaman, fiyat] biçiminde olmalı');
      return;
    }
    const ts = parseTimestamp(row[0]);
    if (ts === null) {
      reject(i + 1, 'Geçersiz tarih/zaman');
      return;
    }
    const price = parseLocaleNumber(row[1]);
    if (!validPrice(price)) {
      reject(i + 1, 'Geçersiz fiyat (pozitif sayı olmalı)');
      return;
    }
    if (map.has(ts)) duplicates++;
    map.set(ts, price);
  });
  return finish(map, rows.length, rejected, rejectedCount, duplicates);
}

// ---------------------------------------------------------------------------
// Senaryo penceresi kapsama doğrulaması
// ---------------------------------------------------------------------------

export const MIN_WINDOW_POINTS = 20;
/** Serinin ilk/son noktası pencere uçlarına en fazla pencere uzunluğunun bu oranı kadar uzak olabilir */
export const COVERAGE_EDGE_TOLERANCE = 0.1;

export interface SeriesWindowStats {
  /** pencere içindeki nokta sayısı */
  count: number;
  /** pencere içindeki ilk / son nokta (ms) */
  first: number | null;
  last: number | null;
}

/** Pencere kapsaması: null → uygun; aksi halde Türkçe neden */
export function coverageProblem(stats: SeriesWindowStats, fromMs: number, toMs: number, minPoints: number = MIN_WINDOW_POINTS): string | null {
  if (!(toMs > fromMs)) return 'Pencere bitişi başlangıçtan sonra olmalı';
  if (stats.count < minPoints || stats.first === null || stats.last === null) {
    return `pencerede en az ${minPoints} nokta olmalı (bulunan: ${stats.count})`;
  }
  const tol = (toMs - fromMs) * COVERAGE_EDGE_TOLERANCE;
  if (stats.first - fromMs > tol) return 'seri pencerenin başını kapsamıyor';
  if (toMs - stats.last > tol) return 'seri pencerenin sonunu kapsamıyor';
  return null;
}
