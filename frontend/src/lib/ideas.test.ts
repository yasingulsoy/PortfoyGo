import { describe, expect, it } from 'vitest';
import {
  compareHref,
  formatDay,
  formatQuote,
  levelHint,
  listQuery,
  parseCompareIds,
  parseLevel,
  parseTags,
  suggestedReviewDate,
  tagsError,
  textError,
  toIdeaCard,
  toIdeaChart,
  toIdeaDetail,
  toggleCompare,
} from './ideas';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';

describe('Ortak Akıl: normalleştiriciler', () => {
  it('kartı güvenle okur; izle duruşunda yön yok', () => {
    const c = toIdeaCard({
      id: A,
      author: { username: 'aylin', profile_public: false },
      asset_type: 'crypto',
      symbol: 'BTC',
      stance: 'izle',
      horizon: '3m',
      status: 'acik',
      scope: 'league',
      league: { id: B, name: 'Ofis' },
      tags: ['halving', 3],
      ref_price: '100.5',
      quote_currency: 'USD',
      price: 110,
      change_pct: 9.45,
      performance_pct: 9.45,
      directional: true,
      counts: { agree: 2, disagree: '1', comments: 0 },
    });
    expect(c).toMatchObject({
      symbol: 'BTC',
      stance: 'izle',
      directional: false,
      scope: 'league',
      league: { id: B, name: 'Ofis' },
      ref_price: 100.5,
      tags: ['halving', '3'],
      counts: { agree: 2, disagree: 1, comments: 0 },
      author: { username: 'aylin', profile_public: false, avatar_id: 'avatar-1' },
    });
    const bad = toIdeaCard({ stance: 'tut', horizon: '9y', asset_type: 'nft', status: 'x' });
    expect(bad).toMatchObject({ stance: 'izle', horizon: '1m', asset_type: 'stock', status: 'acik', price: null, outcome: null });
  });

  it('detay: yanıtlar iki sütun, yetkiler ve başarı kaydı', () => {
    const d = toIdeaDetail({
      id: A,
      stance: 'sat',
      responses: { agree: [{ id: 'r1', stance: 'katiliyorum', reason: 'Neden' }], disagree: [{ id: 'r2', stance: 'katilmiyorum', reason: 'Çünkü' }] },
      my_response: { id: 'r1', stance: 'katiliyorum', reason: 'Neden', is_me: true },
      updates: [{ id: 'u1', kind: 'target_hit', text: 'Hedef görüldü', price: '95' }],
      author_track_record: { published: 4, closed: 2, as_expected_pct: 50, avg_days_to_close: 12.5 },
      can: { respond: true, close: 'yes' },
    });
    expect(d.responses.agree).toHaveLength(1);
    expect(d.responses.disagree[0].stance).toBe('katilmiyorum');
    expect(d.my_response?.is_me).toBe(true);
    expect(d.updates[0]).toMatchObject({ kind: 'target_hit', price: 95 });
    expect(d.author_track_record).toMatchObject({ published: 4, as_expected_pct: 50, avg_days_to_close: 12.5 });
    expect(d.can).toEqual({ respond: true, comment: false, add_update: false, close: false, bookmark: false, report: false });
  });

  it('grafik noktalarında geçersiz değerleri atar', () => {
    const ch = toIdeaChart({ points: [{ t: 1, v: 10 }, { t: 'x', v: 1 }, { t: 3, v: 0 }, { t: 4, v: '12' }], ref_price: 10, quote_currency: 'TRY' });
    expect(ch.points).toEqual([
      { t: 1, v: 10 },
      { t: 4, v: 12 },
    ]);
    expect(ch.quote_currency).toBe('TRY');
  });
});

describe('Ortak Akıl: form yardımcıları', () => {
  it('seviye metni: Türkçe ve İngilizce ondalık', () => {
    expect(parseLevel('')).toBeNull();
    expect(parseLevel('1.234,5')).toBe(1234.5);
    expect(parseLevel('1,234.5')).toBe(1234.5);
    expect(parseLevel('41,25')).toBe(41.25);
    expect(parseLevel('abc')).toBeNaN();
    expect(parseLevel('-5')).toBeNaN();
  });

  it('seviye ipucu duruşa göre', () => {
    expect(levelHint('al', 100, 120, 90)).toBeNull();
    expect(levelHint('al', 100, 90, null)).toMatch(/üstünde/);
    expect(levelHint('sat', 100, 110, null)).toMatch(/altında/);
    expect(levelHint('sat', 100, 80, 90)).toMatch(/geçersizlik seviyesi güncel fiyatın üstünde/);
    expect(levelHint('izle', 100, 80, 80)).toMatch(/aynı olamaz/);
    expect(levelHint('al', null, 1, 2)).toBeNull();
    expect(levelHint('al', 100, NaN, null)).toMatch(/pozitif/);
  });

  it('metin ve etiket denetimi', () => {
    expect(textError('Gerekçe', 'kısa', 80, 2000)).toMatch(/en az 80 karakter/);
    expect(textError('Gerekçe', 'x'.repeat(80), 80, 2000)).toBeNull();
    expect(textError('Dersler', '', 1, 1000, false)).toBeNull();
    expect(parseTags('#Enflasyon, faiz , enflasyon\nİhracat')).toEqual(['enflasyon', 'faiz', 'ihracat']);
    expect(tagsError(['a'])).toMatch(/karakter/);
    expect(tagsError(['ok', 'ab', 'cd', 'ef', 'gh', 'ij'])).toMatch(/En fazla 5/);
    expect(tagsError(['<b>'])).toMatch(/yalnızca/);
  });

  it('önerilen değerlendirme tarihi ve gösterim', () => {
    const now = Date.parse('2026-10-16T20:30:00Z'); // İstanbul 16 Ekim 23:30
    expect(suggestedReviewDate('1w', now)).toBe('2026-10-23');
    expect(suggestedReviewDate('1y', now)).toBe('2027-10-16');
    expect(formatDay('2026-11-15')).toBe('15 Kasım 2026');
    expect(formatDay(null)).toBe('—');
    expect(formatQuote(1234.5, 'USD')).toBe('1.234,50 $');
    expect(formatQuote(41.2351, 'TRY')).toBe('41,2351 TL');
    expect(formatQuote(null, 'USD')).toBe('—');
  });
});

describe('Ortak Akıl: karşılaştırma ve liste sorgusu', () => {
  it('en fazla 3 seçim; tekrar tıklayınca çıkarır', () => {
    expect(toggleCompare([], A)).toEqual([A]);
    expect(toggleCompare([A], A)).toEqual([]);
    expect(toggleCompare([A, B, C], D)).toEqual([A, B, C]);
    expect(parseCompareIds(`${A},${A.toUpperCase()},bozuk,${B},${C},${D}`)).toEqual([A, B, C]);
    expect(compareHref([A, B])).toBe(`/ortak-akil/karsilastir?ids=${A},${B}`);
  });

  it('boş filtreleri atlar', () => {
    expect(listQuery({ view: 'newest', scope: 'all', limit: 12, offset: 0, q: '  ' })).toBe('view=newest&limit=12');
    expect(listQuery({ view: 'bookmarks', scope: 'leagues', league_id: B, asset_type: 'crypto', stance: 'al', limit: 12, offset: 24, q: 'btc' })).toBe(
      `view=bookmarks&scope=leagues&league_id=${B}&asset_type=crypto&stance=al&q=btc&limit=12&offset=24`,
    );
  });
});
