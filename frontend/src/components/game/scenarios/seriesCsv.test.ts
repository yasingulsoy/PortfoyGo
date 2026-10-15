// Yönetim panelindeki tarihsel seri CSV önizleme ayrıştırıcısının testleri.
// (Panelde test koşucusu yok; saf ve bağımlılıksız modül burada test edilir.)
import { describe, expect, it } from 'vitest';
import {
  detectSeparator,
  downsample,
  parseLocaleNumber,
  parseTimestamp,
  previewSeriesCsv,
  splitCsvLine,
  toSeriesCode,
} from '../../../../../admin/src/lib/seriesCsv';

const utc = (s: string) => Date.parse(s);

describe('parseLocaleNumber', () => {
  it('nokta / virgül ondalıklarını ve binlik ayırıcıları çözer', () => {
    expect(parseLocaleNumber('1234.56')).toBe(1234.56);
    expect(parseLocaleNumber('1,234.56')).toBe(1234.56);
    expect(parseLocaleNumber('1.234,56')).toBe(1234.56);
    expect(parseLocaleNumber('95,5')).toBe(95.5);
    expect(parseLocaleNumber('1.234.567')).toBe(1234567);
    expect(parseLocaleNumber('"42"')).toBe(42);
    expect(parseLocaleNumber('abc')).toBeNull();
    expect(parseLocaleNumber('')).toBeNull();
  });
});

describe('parseTimestamp', () => {
  it('ISO, gün-önce ve epoch biçimleri (UTC)', () => {
    expect(parseTimestamp('2020-03-12')).toBe(utc('2020-03-12T00:00:00Z'));
    expect(parseTimestamp('2020-03-12 14:30')).toBe(utc('2020-03-12T14:30:00Z'));
    expect(parseTimestamp('2020-03-12T14:30:00+03:00')).toBe(utc('2020-03-12T11:30:00Z'));
    expect(parseTimestamp('12.03.2020 09:15')).toBe(utc('2020-03-12T09:15:00Z'));
    expect(parseTimestamp('1584000000')).toBe(1584000000_000);
    expect(parseTimestamp(1584000000_000)).toBe(1584000000_000);
  });

  it('geçersiz tarihleri reddeder', () => {
    expect(parseTimestamp('31.02.2020')).toBeNull();
    expect(parseTimestamp('dün')).toBeNull();
    expect(parseTimestamp('1800-01-01')).toBeNull();
  });
});

describe('CSV satırı', () => {
  it('ayırıcıyı algılar ve tırnaklı alanları korur', () => {
    expect(detectSeparator('tarih;fiyat')).toBe(';');
    expect(detectSeparator('date\tclose')).toBe('\t');
    expect(detectSeparator('"1,5",2')).toBe(',');
    expect(splitCsvLine('"2020-01-01","1,5"', ',')).toEqual(['2020-01-01', '1,5']);
    expect(splitCsvLine('a;"b ""c""";d', ';')).toEqual(['a', 'b "c"', 'd']);
  });
});

describe('previewSeriesCsv', () => {
  it('başlıklı virgüllü CSV: sıralar, aralığı ve min/max değerini verir', () => {
    const csv = ['date,close', '2020-03-13,5600', '2020-03-12,4970.5', '2020-03-14,5200'].join('\n');
    const p = previewSeriesCsv(csv);
    expect(p.ok).toBe(true);
    expect(p.separator).toBe(',');
    expect(p.header).toEqual(['date', 'close']);
    expect(p.points.map((x) => x.price)).toEqual([4970.5, 5600, 5200]);
    expect(p.from).toBe(utc('2020-03-12T00:00:00Z'));
    expect(p.to).toBe(utc('2020-03-14T00:00:00Z'));
    expect(p.min).toBe(4970.5);
    expect(p.max).toBe(5600);
    expect(p.total).toBe(3);
    expect(p.rows).toHaveLength(3);
  });

  it('Türkçe noktalı virgüllü OHLC: kapanışı alır, hatalı satırları sayar', () => {
    const csv = [
      'Tarih;Açılış;Yüksek;Düşük;Kapanış',
      '12.03.2020;10,5;11;9,8;10,2',
      '13.03.2020;10,2;10,9;10;—',
      'bozuk;satır',
      '14.03.2020;10,6;11,2;10,1;11,05',
    ].join('\r\n');
    const p = previewSeriesCsv(csv);
    expect(p.separator).toBe(';');
    expect(p.columns).toEqual({ date: 0, time: null, price: 4 });
    expect(p.points.map((x) => x.price)).toEqual([10.2, 11.05]);
    expect(p.rejected).toBe(2);
    expect(p.rejected_samples[0]).toEqual({ line: 3, reason: 'Geçersiz fiyat (pozitif sayı olmalı)' });
    expect(p.rows[2].error).toBe('Geçersiz tarih/zaman');
  });

  it('başlıksız iki sütun, yinelenen zaman (son değer geçerli), yorum ve BOM', () => {
    const csv = '﻿# kaynak: deneme\n2021-01-01 10:00,100\n2021-01-01 10:00,101\n2021-01-01 10:01,102\n';
    const p = previewSeriesCsv(csv);
    expect(p.header).toBeNull();
    expect(p.duplicates).toBe(1);
    expect(p.points).toEqual([
      { ts: utc('2021-01-01T10:00:00Z'), price: 101 },
      { ts: utc('2021-01-01T10:01:00Z'), price: 102 },
    ]);
  });

  it('boş, sütunsuz başlık ve satır sınırı', () => {
    expect(previewSeriesCsv('').error).toBe('CSV boş');
    expect(previewSeriesCsv('isim,yaş\nAli,3').error).toMatch(/tarih ve fiyat/);
    const big = ['date,close', ...Array.from({ length: 6 }, (_, i) => `2020-01-0${i + 1},1`)].join('\n');
    expect(previewSeriesCsv(big, { maxRows: 5 }).ok).toBe(false);
    expect(previewSeriesCsv(big, { previewRows: 2 }).rows).toHaveLength(2);
  });
});

describe('yardımcılar', () => {
  it('seyreltme ilk ve son noktayı korur', () => {
    const pts = Array.from({ length: 1000 }, (_, i) => i);
    const d = downsample(pts, 10);
    expect(d).toHaveLength(10);
    expect(d[0]).toBe(0);
    expect(d[9]).toBe(999);
  });

  it('seri kodu üretir', () => {
    expect(toSeriesCode('btc 2020 covid')).toBe('BTC_2020_COVID');
    expect(toSeriesCode('Altın-çöküşü!')).toBe('ALTIN_COKUSU');
  });
});
