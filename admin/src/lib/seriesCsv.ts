// Tarihsel seri CSV önizlemesi: tarayıcıda, yüklemeden ÖNCE dosyayı okur ve ilk satırları gösterir.
// Kurallar backend'deki ayrıştırıcıyla (backend/src/services/scenarios/csv.ts) aynıdır; asıl doğrulamayı
// sunucu yapar. Bu dosya bağımlılıksızdır (frontend birim testleri de içe aktarır; '@/' yolu kullanmayın).

export const MAX_IMPORT_ROWS = 100_000;
/** Önizleme tablosunda gösterilen satır */
export const PREVIEW_ROWS = 8;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const REJECT_SAMPLE_LIMIT = 20;

export interface CsvPoint {
  /** unix milisaniye */
  ts: number;
  price: number;
}

export interface CsvRejected {
  /** 1 tabanlı satır numarası */
  line: number;
  reason: string;
}

export interface CsvPreviewRow {
  line: number;
  cells: string[];
  ts: number | null;
  price: number | null;
  error: string | null;
}

export interface CsvPreview {
  ok: boolean;
  /** Ayrıştırma tamamen başarısızsa nedeni */
  error: string | null;
  separator: ',' | ';' | '\t' | null;
  /** Başlık satırı (yoksa null) */
  header: string[] | null;
  /** Kullanılan sütunlar (0 tabanlı) */
  columns: { date: number; time: number | null; price: number } | null;
  /** Zaman sırasına göre tekil noktalar (aynı zamanda SON değer geçerli) */
  points: CsvPoint[];
  /** Okunan veri satırı (başlık / boş / # yorum hariç) */
  total: number;
  rejected: number;
  rejected_samples: CsvRejected[];
  duplicates: number;
  /** İlk birkaç veri satırı (tablo önizlemesi) */
  rows: CsvPreviewRow[];
  from: number | null;
  to: number | null;
  min: number | null;
  max: number | null;
}

/* ------------------------------------------------------------------ */
/* Sayı                                                               */
/* ------------------------------------------------------------------ */

/** "1234.56", "1,234.56", "1.234,56", "1234,56" → sayı (yerel ayardan bağımsız) */
export function parseLocaleNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/^"(.*)"$/s, '$1').trim();
  s = s.replace(/[\s  ']/g, '');
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

/* ------------------------------------------------------------------ */
/* Zaman                                                              */
/* ------------------------------------------------------------------ */

function validYear(ms: number): boolean {
  const y = new Date(ms).getUTCFullYear();
  return Number.isFinite(ms) && y >= MIN_YEAR && y <= MAX_YEAR;
}

function utcFromParts(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, msPart = 0): number | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, Math.min(s, 59), msPart);
  const dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return ms;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
const SLASH_YMD_RE = /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const DAY_FIRST_RE = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const TIME_ONLY_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;

/** Zaman damgası → unix ms. Saat dilimi verilmemiş metinler UTC kabul edilir; epoch sn (< 1e11) veya ms. */
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

/* ------------------------------------------------------------------ */
/* CSV                                                                */
/* ------------------------------------------------------------------ */

/** Tek satırı böler (çift tırnaklı alan ayırıcı içerebilir; "" → ") */
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
    } else if (ch === '"') inQ = true;
    else if (ch === sep) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Ayırıcı: tırnak dışındaki ';' > sekme > ',' */
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
    .replace(/̇/g, '')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');

const DATE_HEADERS = new Set(['date', 'tarih', 'datetime', 'timestamp', 'ts', 'zaman', 'zamandamgasi', 'day', 'gun', 'period']);
const TIME_HEADERS = new Set(['time', 'saat', 'hour']);
const CLOSE_HEADERS = ['close', 'kapanis', 'adjclose', 'closeprice', 'simdi', 'son', 'last', 'price', 'fiyat', 'value', 'deger', 'rate', 'kur'];

type Columns = { date: number; time: number | null; price: number };

export function columnsFromHeader(cells: string[]): Columns | null {
  const norm = cells.map(normHeader);
  let date = -1;
  let time: number | null = null;
  norm.forEach((h, i) => {
    if (date < 0 && DATE_HEADERS.has(h)) date = i;
    else if (time === null && TIME_HEADERS.has(h)) time = i;
  });
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

function columnsByShape(cells: string[]): Columns | null {
  const n = cells.length;
  if (n === 2) return { date: 0, time: null, price: 1 };
  if (n === 3) return TIME_ONLY_RE.test(cells[1]) ? { date: 0, time: 1, price: 2 } : { date: 0, time: null, price: 1 };
  if (n === 4) return TIME_ONLY_RE.test(cells[1]) ? { date: 0, time: 1, price: 3 } : null;
  if (n >= 5) {
    if (TIME_ONLY_RE.test(cells[1]) && n >= 6) return { date: 0, time: 1, price: 5 };
    return { date: 0, time: null, price: 4 };
  }
  return null;
}

function looksLikeHeader(cells: string[]): boolean {
  return parseTimestamp(cells[0]) === null && cells.some((c) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(c));
}

const validPrice = (p: number | null): p is number => p !== null && Number.isFinite(p) && p > 0 && p < 1e13;

const empty = (error: string): CsvPreview => ({
  ok: false,
  error,
  separator: null,
  header: null,
  columns: null,
  points: [],
  total: 0,
  rejected: 0,
  rejected_samples: [],
  duplicates: 0,
  rows: [],
  from: null,
  to: null,
  min: null,
  max: null,
});

/** CSV metnini önizleme için ayrıştırır (hata fırlatmaz). */
export function previewSeriesCsv(text: string, opts: { maxRows?: number; previewRows?: number } = {}): CsvPreview {
  const maxRows = opts.maxRows ?? MAX_IMPORT_ROWS;
  const previewRows = opts.previewRows ?? PREVIEW_ROWS;
  const lines = String(text ?? '')
    .replace(/^﻿/, '')
    .split(/\r\n|\n|\r/);
  const firstIdx = lines.findIndex((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  if (firstIdx < 0) return empty('CSV boş');
  const sep = detectSeparator(lines[firstIdx]);

  let cols: Columns | null = null;
  let header: string[] | null = null;
  let start = firstIdx;
  const firstCells = splitCsvLine(lines[firstIdx], sep);
  if (looksLikeHeader(firstCells)) {
    header = firstCells;
    cols = columnsFromHeader(firstCells);
    if (!cols) {
      return { ...empty('Başlıkta tarih ve fiyat/kapanış sütunu bulunamadı (ör. "date,close" veya "tarih;fiyat")'), separator: sep, header };
    }
    start = firstIdx + 1;
  }

  const map = new Map<number, number>();
  const samples: CsvRejected[] = [];
  const rows: CsvPreviewRow[] = [];
  let rejected = 0;
  let total = 0;
  let duplicates = 0;
  let usedCols: Columns | null = cols;

  for (let i = start; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith('#')) continue;
    total++;
    if (total > maxRows) {
      return { ...empty(`En fazla ${maxRows.toLocaleString('tr-TR')} satır içe aktarılabilir`), separator: sep, header, total };
    }
    const cells = splitCsvLine(raw, sep);
    const c = cols ?? columnsByShape(cells);
    let error: string | null = null;
    let ts: number | null = null;
    let price: number | null = null;
    if (!c) error = `Beklenmeyen sütun sayısı (${cells.length})`;
    else {
      usedCols ??= c;
      const dateCell = cells[c.date] ?? '';
      const timeCell = c.time !== null ? (cells[c.time] ?? '') : '';
      ts = parseTimestamp(timeCell ? `${dateCell} ${timeCell}` : dateCell);
      if (ts === null) error = 'Geçersiz tarih/zaman';
      else {
        price = parseLocaleNumber(cells[c.price]);
        if (!validPrice(price)) error = 'Geçersiz fiyat (pozitif sayı olmalı)';
      }
    }
    if (rows.length < previewRows) rows.push({ line: i + 1, cells, ts, price: error ? null : price, error });
    if (error) {
      rejected++;
      if (samples.length < REJECT_SAMPLE_LIMIT) samples.push({ line: i + 1, reason: error });
      continue;
    }
    if (map.has(ts!)) duplicates++;
    map.set(ts!, price!);
  }

  const points = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([t, p]) => ({ ts: t, price: p }));
  let min: number | null = null;
  let max: number | null = null;
  for (const p of points) {
    if (min === null || p.price < min) min = p.price;
    if (max === null || p.price > max) max = p.price;
  }
  return {
    ok: points.length > 0,
    error: points.length > 0 ? null : total === 0 ? 'Veri satırı bulunamadı' : 'Geçerli satır bulunamadı',
    separator: sep,
    header,
    columns: usedCols,
    points,
    total,
    rejected,
    rejected_samples: samples,
    duplicates,
    rows,
    from: points[0]?.ts ?? null,
    to: points[points.length - 1]?.ts ?? null,
    min,
    max,
  };
}

/** Grafikte çizilecek en fazla nokta: eşit aralıklı seyreltme (ilk ve son korunur). */
export function downsample<T>(points: readonly T[], max = 400): T[] {
  const n = points.length;
  const m = Math.max(2, Math.floor(max));
  if (n <= m) return [...points];
  const out: T[] = [];
  let last = -1;
  for (let k = 0; k < m; k++) {
    const i = Math.round((k * (n - 1)) / (m - 1));
    if (i !== last) {
      out.push(points[i]);
      last = i;
    }
  }
  return out;
}

/** Seri kodu: büyük harf, rakam, alt çizgi (3–40) */
export const SERIES_CODE_RE = /^[A-Z0-9_]{3,40}$/;

/** Serbest metni seri koduna çevirir: "btc 2020 covid" → "BTC_2020_COVID" */
export function toSeriesCode(v: string): string {
  return v
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}
