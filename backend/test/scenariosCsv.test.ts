import { describe, expect, it } from 'vitest';
import {
  SeriesParseError,
  columnsFromHeader,
  coverageProblem,
  detectSeparator,
  parseLocaleNumber,
  parseSeriesCsv,
  parseSeriesRows,
  parseTimestamp,
  splitCsvLine,
} from '../src/services/scenarios/csv';
import { downsampleEven, rowsToPoints } from '../src/services/scenarios/repository';
import { slugify } from '../src/services/scenarios/service';
import {
  CRASH_DRILL_FROM,
  CRASH_DRILL_HOURS,
  CRASH_DRILL_SERIES,
  CRASH_DRILL_TO,
  generateCrashDrillSeries,
} from '../src/services/scenarios/synthetic';

const D = (iso: string) => Date.parse(iso);

describe('parseLocaleNumber', () => {
  it('handles dot / comma decimals and thousands separators', () => {
    expect(parseLocaleNumber('1234.56')).toBe(1234.56);
    expect(parseLocaleNumber('1,234.56')).toBe(1234.56);
    expect(parseLocaleNumber('1.234,56')).toBe(1234.56); // Türkçe
    expect(parseLocaleNumber('1234,56')).toBe(1234.56); // Türkçe ondalık virgül
    expect(parseLocaleNumber('1.234.567')).toBe(1234567);
    expect(parseLocaleNumber('1,234,567')).toBe(1234567);
    expect(parseLocaleNumber('"95,5"')).toBe(95.5);
    expect(parseLocaleNumber(' 42 ')).toBe(42);
    expect(parseLocaleNumber('1 234,5')).toBe(1234.5);
    expect(parseLocaleNumber('1.5e3')).toBe(1500);
    expect(parseLocaleNumber(7)).toBe(7);
  });

  it('rejects garbage', () => {
    expect(parseLocaleNumber('abc')).toBeNull();
    expect(parseLocaleNumber('')).toBeNull();
    expect(parseLocaleNumber('12$')).toBeNull();
    expect(parseLocaleNumber(null)).toBeNull();
    expect(parseLocaleNumber(Number.NaN)).toBeNull();
  });
});

describe('parseTimestamp', () => {
  it('parses ISO dates (UTC when no zone) and offsets', () => {
    expect(parseTimestamp('2020-03-12')).toBe(D('2020-03-12T00:00:00Z'));
    expect(parseTimestamp('2020-03-12T14:30:00Z')).toBe(D('2020-03-12T14:30:00Z'));
    expect(parseTimestamp('2020-03-12 14:30')).toBe(D('2020-03-12T14:30:00Z'));
    expect(parseTimestamp('2020-03-12T14:30:00.250Z')).toBe(D('2020-03-12T14:30:00.250Z'));
    expect(parseTimestamp('2020-03-12T17:30:00+03:00')).toBe(D('2020-03-12T14:30:00Z'));
    expect(parseTimestamp('2020-03-12T09:30:00-0500')).toBe(D('2020-03-12T14:30:00Z'));
  });

  it('parses epoch seconds and milliseconds (numbers and strings)', () => {
    const ms = D('2008-09-15T00:00:00Z');
    expect(parseTimestamp(ms / 1000)).toBe(ms);
    expect(parseTimestamp(ms)).toBe(ms);
    expect(parseTimestamp(String(ms / 1000))).toBe(ms);
    expect(parseTimestamp(String(ms))).toBe(ms);
  });

  it('parses day-first Turkish dates and Y/M/D', () => {
    expect(parseTimestamp('15.09.2008')).toBe(D('2008-09-15T00:00:00Z'));
    expect(parseTimestamp('15/09/2008')).toBe(D('2008-09-15T00:00:00Z'));
    expect(parseTimestamp('15.09.2008 16:00')).toBe(D('2008-09-15T16:00:00Z'));
    expect(parseTimestamp('2008/09/15')).toBe(D('2008-09-15T00:00:00Z'));
  });

  it('rejects impossible or out-of-range dates', () => {
    expect(parseTimestamp('2020-02-31')).toBeNull();
    expect(parseTimestamp('31.02.2020')).toBeNull();
    expect(parseTimestamp('1850-01-01')).toBeNull();
    expect(parseTimestamp('not a date')).toBeNull();
    expect(parseTimestamp(-5)).toBeNull();
    expect(parseTimestamp('')).toBeNull();
  });
});

describe('CSV helpers', () => {
  it('splits quoted fields and detects separators', () => {
    expect(splitCsvLine('a,"b,c",d', ',')).toEqual(['a', 'b,c', 'd']);
    expect(splitCsvLine('"x ""y""";2', ';')).toEqual(['x "y"', '2']);
    expect(detectSeparator('date;close')).toBe(';');
    expect(detectSeparator('date\tclose')).toBe('\t');
    expect(detectSeparator('date,close')).toBe(',');
    expect(detectSeparator('"1,5",2')).toBe(',');
  });

  it('finds columns from English / Turkish headers', () => {
    expect(columnsFromHeader(['Date', 'Open', 'High', 'Low', 'Close', 'Volume'])).toEqual({ date: 0, time: null, price: 4 });
    expect(columnsFromHeader(['Tarih', 'Şimdi', 'Açılış', 'Yüksek', 'Düşük', 'Hac.', 'Fark %'])).toEqual({ date: 0, time: null, price: 1 });
    expect(columnsFromHeader(['tarih', 'saat', 'fiyat'])).toEqual({ date: 0, time: 1, price: 2 });
    expect(columnsFromHeader(['time', 'price'])).toEqual({ date: 0, time: null, price: 1 });
    expect(columnsFromHeader(['KAPANIŞ', 'TARİH'])).toEqual({ date: 1, time: null, price: 0 });
    expect(columnsFromHeader(['foo', 'bar'])).toBeNull();
  });
});

describe('parseSeriesCsv', () => {
  it('comma separated with header (date,price)', () => {
    const r = parseSeriesCsv('date,price\n2020-03-02,100.5\n2020-03-03,101\n');
    expect(r.points).toEqual([
      { ts: D('2020-03-02T00:00:00Z'), price: 100.5 },
      { ts: D('2020-03-03T00:00:00Z'), price: 101 },
    ]);
    expect(r.total).toBe(2);
    expect(r.rejected).toBe(0);
  });

  it('semicolon separated with Turkish decimals and day-first dates, no header', () => {
    const r = parseSeriesCsv('02.03.2020;1.234,50\r\n03.03.2020;1.240,25\r\n');
    expect(r.points.map((p) => p.price)).toEqual([1234.5, 1240.25]);
    expect(r.points[0].ts).toBe(D('2020-03-02T00:00:00Z'));
  });

  it('OHLC with header uses close; OHLC without header uses 5th column', () => {
    const withHeader = parseSeriesCsv('Date,Open,High,Low,Close,Volume\n2020-03-02,10,12,9,11,1000\n2020-03-03,11,13,10,12.5,900');
    expect(withHeader.points.map((p) => p.price)).toEqual([11, 12.5]);
    const noHeader = parseSeriesCsv('2020-03-02,10,12,9,11\n2020-03-03,11,13,10,12.5');
    expect(noHeader.points.map((p) => p.price)).toEqual([11, 12.5]);
    const tr = parseSeriesCsv('Tarih;Açılış;Yüksek;Düşük;Kapanış\n02.03.2020;10,1;12;9;11,7\n');
    expect(tr.points.map((p) => p.price)).toEqual([11.7]);
  });

  it('epoch seconds and milliseconds; date + time columns', () => {
    const s = D('2020-03-02T10:00:00Z') / 1000;
    const r = parseSeriesCsv(`${s},5\n${(s + 3600) * 1000},6`);
    expect(r.points).toEqual([
      { ts: s * 1000, price: 5 },
      { ts: (s + 3600) * 1000, price: 6 },
    ]);
    const dt = parseSeriesCsv('2020-03-02,10:00,5\n2020-03-02,11:00,6');
    expect(dt.points.map((p) => p.ts)).toEqual([D('2020-03-02T10:00:00Z'), D('2020-03-02T11:00:00Z')]);
  });

  it('sorts ascending, last duplicate wins, skips blanks/comments, counts rejects with samples', () => {
    const csv = [
      '# yorum',
      'date,price',
      '2020-03-05,3',
      '',
      '2020-03-04,2',
      'bad-date,1',
      '2020-03-06,-4',
      '2020-03-06,abc',
      '2020-03-04,2.5',
    ].join('\n');
    const r = parseSeriesCsv(csv);
    expect(r.points).toEqual([
      { ts: D('2020-03-04T00:00:00Z'), price: 2.5 },
      { ts: D('2020-03-05T00:00:00Z'), price: 3 },
    ]);
    expect(r.total).toBe(6);
    expect(r.rejected).toBe(3);
    expect(r.duplicates).toBe(1);
    expect(r.rejected_samples.map((x) => x.line)).toEqual([6, 7, 8]);
    expect(r.rejected_samples[0].reason).toMatch(/tarih/i);
    expect(r.rejected_samples[1].reason).toMatch(/fiyat/i);
  });

  it('header without a usable price column → NO_COLUMNS; empty → EMPTY; too many rows → TOO_MANY_ROWS', () => {
    expect(() => parseSeriesCsv('foo,bar\n1,2')).toThrowError(SeriesParseError);
    try {
      parseSeriesCsv('foo,bar\n1,2');
    } catch (e) {
      expect((e as SeriesParseError).code).toBe('NO_COLUMNS');
    }
    expect(() => parseSeriesCsv('\n\n')).toThrowError(/boş/);
    const big = Array.from({ length: 11 }, (_, i) => `${1_600_000_000 + i * 60},1`).join('\n');
    expect(() => parseSeriesCsv(big, 10)).toThrowError(/En fazla/);
  });
});

describe('parseSeriesRows', () => {
  it('accepts [ts, price] pairs with ISO / epoch / string prices and rejects malformed rows', () => {
    const ms = D('2020-03-02T00:00:00Z');
    const r = parseSeriesRows([
      ['2020-03-03T00:00:00Z', 2],
      [ms / 1000, '1,5'],
      [ms + 7_200_000, 3],
      ['x', 1],
      [ms, 0],
      'nope',
      [ms],
    ]);
    expect(r.points).toEqual([
      { ts: ms, price: 1.5 },
      { ts: ms + 7_200_000, price: 3 },
      { ts: D('2020-03-03T00:00:00Z'), price: 2 },
    ]);
    expect(r.rejected).toBe(4);
    expect(r.rejected_samples.map((x) => x.line)).toEqual([4, 5, 6, 7]);
    expect(() => parseSeriesRows(new Array(11).fill([ms, 1]), 10)).toThrowError(/En fazla/);
  });
});

describe('coverageProblem', () => {
  const from = D('2020-01-01T00:00:00Z');
  const to = D('2020-01-11T00:00:00Z'); // 10 gün → %10 = 1 gün tolerans
  it('accepts a well covered window', () => {
    expect(coverageProblem({ count: 20, first: from, last: to }, from, to)).toBeNull();
    expect(coverageProblem({ count: 25, first: from + 20 * 3_600_000, last: to - 20 * 3_600_000 }, from, to)).toBeNull();
  });
  it('rejects too few points, late start, early end and inverted windows', () => {
    expect(coverageProblem({ count: 19, first: from, last: to }, from, to)).toMatch(/en az 20/);
    expect(coverageProblem({ count: 0, first: null, last: null }, from, to)).toMatch(/en az 20/);
    expect(coverageProblem({ count: 30, first: from + 2 * 86_400_000, last: to }, from, to)).toMatch(/başını/);
    expect(coverageProblem({ count: 30, first: from, last: to - 2 * 86_400_000 }, from, to)).toMatch(/sonunu/);
    expect(coverageProblem({ count: 30, first: from, last: to }, to, from)).toMatch(/sonra/);
  });
});

describe('repository helpers', () => {
  it('downsampleEven keeps ≤ max points, first/last, ascending order', () => {
    const pts = Array.from({ length: 5000 }, (_, i) => ({ t: 1_000_000 + i * 60, p: 100 + i }));
    const ds = downsampleEven(pts, 400);
    expect(ds.length).toBeLessThanOrEqual(400);
    expect(ds.length).toBeGreaterThan(390);
    expect(ds[0]).toEqual(pts[0]);
    expect(ds[ds.length - 1]).toEqual(pts[pts.length - 1]);
    for (let i = 1; i < ds.length; i++) expect(ds[i].t).toBeGreaterThan(ds[i - 1].t);
    expect(downsampleEven(pts.slice(0, 10), 400)).toEqual(pts.slice(0, 10));
  });

  it('rowsToPoints → unix seconds, ascending, positive only, deduplicated', () => {
    const pts = rowsToPoints([
      { ts: new Date('2020-01-02T00:00:00Z'), price: '2.5' },
      { ts: '2020-01-01T00:00:00Z', price: 1 },
      { ts: '2020-01-03T00:00:00Z', price: '0' },
    ]);
    expect(pts).toEqual([
      { t: D('2020-01-01T00:00:00Z') / 1000, p: 1 },
      { t: D('2020-01-02T00:00:00Z') / 1000, p: 2.5 },
    ]);
  });

  it('slugify transliterates Turkish', () => {
    expect(slugify('Ani Çöküş Tatbikatı (sentetik veri)')).toBe('ani-cokus-tatbikati-sentetik-veri');
    expect(slugify('2008 Krizi: İğne & Şişe')).toBe('2008-krizi-igne-sise');
    expect(slugify('!!!')).toBe('senaryo');
  });
});

describe('synthetic crash drill series', () => {
  it('is deterministic, covers the window, drops sharply then partially recovers', () => {
    for (const spec of CRASH_DRILL_SERIES) {
      const a = generateCrashDrillSeries(spec);
      expect(generateCrashDrillSeries(spec)).toEqual(a);
      expect(a.length).toBe(CRASH_DRILL_HOURS + 1);
      expect(a[0].ts).toBe(CRASH_DRILL_FROM.getTime());
      expect(a[a.length - 1].ts).toBe(CRASH_DRILL_TO.getTime());
      expect(a.every((p) => p.price > 0)).toBe(true);
      const first = a[0].price;
      const last = a[a.length - 1].price;
      const min = Math.min(...a.map((p) => p.price));
      if (spec.safeHaven) {
        expect(last).toBeGreaterThan(first); // güvenli liman
      } else {
        expect(min / first).toBeLessThan(0.86); // sert düşüş
        expect(last).toBeGreaterThan(min * 1.05); // kısmi toparlanma
        expect(last).toBeLessThan(first); // ama başa dönmedi
      }
    }
  });
});
