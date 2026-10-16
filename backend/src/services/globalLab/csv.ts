import { detectSeparator } from '../scenarios/csv';
import { LIMITS } from './config';
import { foldKey, instrumentInputSchema, symbolField, type InstrumentInput } from './validation';

/**
 * Global Portföy Lab CSV içe / dışa aktarma — SAF (veritabanına bağlanmaz; birim testli).
 *
 * Katalog sütunları (başlık satırı ZORUNLU; sıra serbest, Türkçe başlıklar da kabul edilir):
 *   symbol, name, vehicle, asset_class, sub_class, region, country, currency, risk_level, expense_ratio_pct,
 *   description_tr, data_source, license_note, provider_symbol, active
 * Not sütunları: symbol, title, body
 *
 * - Ayırıcı ilk satırdan algılanır (';' > sekme > ','). Excel'in Türkçe ayarı ';' ve ondalık virgül kullanır.
 * - Çift tırnaklı alanlar ayırıcı, "" (kaçış) ve satır sonu içerebilir (RFC 4180).
 * - Dışa aktarmada formül enjeksiyonuna karşı =, +, -, @ ile başlayan METİN hücrelerinin başına ' eklenir;
 *   içe aktarmada bu önek geri alınır.
 * - Aynı sembol dosyada birden çok kez geçerse SON satır geçerlidir (duplicates sayılır).
 */

export const INSTRUMENT_CSV_COLUMNS = [
  'symbol',
  'name',
  'vehicle',
  'asset_class',
  'sub_class',
  'region',
  'country',
  'currency',
  'risk_level',
  'expense_ratio_pct',
  'description_tr',
  'data_source',
  'license_note',
  'provider_symbol',
  'active',
] as const;

export const NOTE_CSV_COLUMNS = ['symbol', 'title', 'body'] as const;

const ALIASES: Record<string, string> = {
  sembol: 'symbol',
  kod: 'symbol',
  ad: 'name',
  isim: 'name',
  arac: 'vehicle',
  aracturu: 'vehicle',
  tur: 'vehicle',
  varliksinifi: 'asset_class',
  sinif: 'asset_class',
  altsinif: 'sub_class',
  bolge: 'region',
  ulke: 'country',
  parabirimi: 'currency',
  doviz: 'currency',
  risk: 'risk_level',
  riskseviyesi: 'risk_level',
  giderorani: 'expense_ratio_pct',
  giderorani_: 'expense_ratio_pct',
  aciklama: 'description_tr',
  veri: 'data_source',
  verikaynagi: 'data_source',
  kaynak: 'data_source',
  lisans: 'license_note',
  lisansnotu: 'license_note',
  fiyatbaglantisi: 'provider_symbol',
  baglanti: 'provider_symbol',
  aktif: 'active',
  baslik: 'title',
  not: 'body',
  metin: 'body',
};

function headerName(cell: string, allowed: readonly string[]): string | null {
  const raw = cell.replace(/^﻿/, '').trim();
  const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
  if (allowed.includes(lower)) return lower;
  const folded = foldKey(raw);
  const direct = allowed.find((a) => foldKey(a) === folded);
  if (direct) return direct;
  const alias = ALIASES[folded];
  return alias && allowed.includes(alias) ? alias : null;
}

/** RFC 4180 benzeri kayıt ayrıştırıcı: tırnak içi ayırıcı / satır sonu / "" desteklenir. Boş satırlar atlanır. */
export function parseCsvRecords(text: string, sep?: string): { line: number; cells: string[] }[] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const delim = sep ?? detectSeparator(firstLine);
  const out: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cur = '';
  let inQ = false;
  let line = 1;
  let startLine = 1;
  const pushRecord = () => {
    cells.push(cur);
    if (cells.some((c) => c.trim().length > 0)) out.push({ line: startLine, cells: cells.map((c) => c.trim()) });
    cells = [];
    cur = '';
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else {
        if (ch === '\n') line++;
        cur += ch;
      }
      continue;
    }
    if (ch === '"') inQ = true;
    else if (ch === delim) {
      cells.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      pushRecord();
      line++;
      startLine = line;
    } else cur += ch;
  }
  if (cur.length > 0 || cells.length > 0) pushRecord();
  return out;
}

/** Dışa aktarmada eklenen formül koruma önekini geri alır */
const unguard = (s: string) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s);

export interface CsvRowError {
  line: number;
  symbol: string | null;
  message: string;
}

export interface CsvParseResult<T> {
  rows: T[];
  errors: CsvRowError[];
  /** Okunan veri satırı (başlık hariç) */
  total: number;
  duplicates: number;
}

export class CsvFormatError extends Error {
  constructor(message: string, readonly code: 'EMPTY' | 'NO_HEADER' | 'TOO_MANY_ROWS') {
    super(message);
  }
}

function mapHeader(records: { line: number; cells: string[] }[], allowed: readonly string[], required: readonly string[]): Map<string, number> {
  if (records.length === 0) throw new CsvFormatError('Dosya boş', 'EMPTY');
  const header = records[0].cells;
  const map = new Map<string, number>();
  header.forEach((cell, i) => {
    const name = headerName(cell, allowed);
    if (name && !map.has(name)) map.set(name, i);
  });
  const missing = required.filter((r) => !map.has(r));
  if (missing.length > 0) {
    throw new CsvFormatError(`Başlık satırında zorunlu sütunlar eksik: ${missing.join(', ')}`, 'NO_HEADER');
  }
  return map;
}

function issueMessage(err: { issues: { message: string; path: PropertyKey[] }[] }): string {
  const first = err.issues[0];
  if (!first) return 'Geçersiz satır';
  const field = first.path.length ? String(first.path[0]) : '';
  const msg = first.message && !first.message.startsWith('Invalid') && !first.message.startsWith('Expected') ? first.message : 'geçersiz değer';
  return field && !msg.toLowerCase().includes(field) ? `${field}: ${msg}` : msg;
}

export function parseInstrumentCsv(text: string, maxRows: number = LIMITS.importMaxRows): CsvParseResult<InstrumentInput> {
  const records = parseCsvRecords(text);
  const map = mapHeader(records, INSTRUMENT_CSV_COLUMNS, ['symbol', 'name', 'vehicle', 'asset_class', 'region', 'currency', 'risk_level', 'data_source', 'license_note']);
  const data = records.slice(1);
  if (data.length > maxRows) throw new CsvFormatError(`En fazla ${maxRows} satır içe aktarılabilir`, 'TOO_MANY_ROWS');
  const bySymbol = new Map<string, InstrumentInput>();
  const errors: CsvRowError[] = [];
  let duplicates = 0;
  for (const rec of data) {
    const obj: Record<string, string> = {};
    for (const col of INSTRUMENT_CSV_COLUMNS) {
      const i = map.get(col);
      if (i !== undefined) obj[col] = unguard(rec.cells[i] ?? '');
    }
    const parsed = instrumentInputSchema.safeParse(obj);
    if (!parsed.success) {
      const sym = symbolField.safeParse(obj.symbol ?? '');
      errors.push({ line: rec.line, symbol: sym.success ? sym.data : obj.symbol || null, message: issueMessage(parsed.error) });
      continue;
    }
    if (bySymbol.has(parsed.data.symbol)) duplicates++;
    bySymbol.set(parsed.data.symbol, parsed.data);
  }
  return { rows: [...bySymbol.values()], errors, total: data.length, duplicates };
}

export interface NoteCsvRow {
  symbol: string;
  title: string;
  body: string;
}

export function parseNotesCsv(text: string, maxRows: number = LIMITS.importMaxRows): CsvParseResult<NoteCsvRow> {
  const records = parseCsvRecords(text);
  const map = mapHeader(records, NOTE_CSV_COLUMNS, NOTE_CSV_COLUMNS);
  const data = records.slice(1);
  if (data.length > maxRows) throw new CsvFormatError(`En fazla ${maxRows} satır içe aktarılabilir`, 'TOO_MANY_ROWS');
  const out = new Map<string, NoteCsvRow>();
  const errors: CsvRowError[] = [];
  let duplicates = 0;
  for (const rec of data) {
    const get = (c: string) => unguard(rec.cells[map.get(c)!] ?? '').trim();
    const sym = symbolField.safeParse(get('symbol'));
    const title = get('title');
    const body = get('body');
    if (!sym.success) {
      errors.push({ line: rec.line, symbol: get('symbol') || null, message: 'symbol: geçersiz sembol' });
      continue;
    }
    if (title.length < 3 || title.length > 140) {
      errors.push({ line: rec.line, symbol: sym.data, message: 'title: başlık 3–140 karakter olmalı' });
      continue;
    }
    if (body.length < 1 || body.length > 4000) {
      errors.push({ line: rec.line, symbol: sym.data, message: 'body: not metni 1–4000 karakter olmalı' });
      continue;
    }
    const k = `${sym.data}\u0000${title.toLocaleLowerCase('tr-TR')}`;
    if (out.has(k)) duplicates++;
    out.set(k, { symbol: sym.data, title, body });
  }
  return { rows: [...out.values()], errors, total: data.length, duplicates };
}

// ---------------------------------------------------------------------------
// Dışa aktarma
// ---------------------------------------------------------------------------

export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  let s = String(value).replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
  return /[",;\t]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: CsvValue[][]): string {
  return [header.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
}

export function instrumentsToCsv(rows: Array<Record<string, unknown>>): string {
  return toCsv(
    INSTRUMENT_CSV_COLUMNS,
    rows.map((r) =>
      INSTRUMENT_CSV_COLUMNS.map((c) => {
        const v = r[c];
        if (c === 'expense_ratio_pct' || c === 'risk_level') return v === null || v === undefined ? null : Number(v);
        return v as CsvValue;
      })
    )
  );
}

export function notesToCsv(rows: { symbol: string; title: string; body: string; author?: string | null; created_at?: string | Date | null }[]): string {
  return toCsv(
    [...NOTE_CSV_COLUMNS, 'author', 'created_at'],
    rows.map((r) => [r.symbol, r.title, r.body, r.author ?? null, r.created_at ? new Date(r.created_at).toISOString() : null])
  );
}
