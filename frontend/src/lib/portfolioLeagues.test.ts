import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  durationLabel,
  fairnessItems,
  fmtDrawdown,
  fmtSignedPct,
  formatCapital,
  formatCommission,
  isPortfolioLeague,
  periodColumnLabel,
  periodError,
  seriesColors,
  styleTone,
} from './portfolioLeagues';
import { toLeague, toPublicLeaguePage } from './competition';

describe('Portföy Ligi yardımcıları', () => {
  it('kural biçimlendirme', () => {
    expect(formatCapital(100_000)).toBe('100.000 USD');
    expect(formatCapital(1_000_000)).toBe('1.000.000 USD');
    expect(formatCommission(25)).toBe('%0,25');
    expect(formatCommission(10)).toBe('%0,10');
    expect(formatCommission(0)).toBe('%0,00');
  });

  it('dönem doğrulaması (backend ile aynı sınırlar)', () => {
    const now = Date.UTC(2026, 9, 16, 12);
    expect(periodError(now, now + DAY_MS, now)).toBeNull();
    expect(periodError(now, now + DAY_MS - 1, now)).toMatch(/en az 1 gün/);
    expect(periodError(now, now + 367 * DAY_MS, now)).toMatch(/en fazla 1 yıl/);
    expect(periodError(now - 5 * 60_000, now + 2 * DAY_MS, now)).toMatch(/geçmişte/);
    expect(periodError(now + 31 * DAY_MS, now + 40 * DAY_MS, now)).toMatch(/30 gün/);
    expect(periodError(NaN, now, now)).toMatch(/seç/);
  });

  it('süre metni ve adillik maddeleri', () => {
    expect(durationLabel('2026-10-01T00:00:00Z', '2026-10-08T00:00:00Z')).toBe('7 gün');
    expect(durationLabel('2026-10-01T00:00:00Z', '2026-10-02T06:00:00Z')).toBe('1 gün 6 saat');
    const items = fairnessItems(
      {
        starting_capital_usd: 100_000,
        commission_bps: 25,
        starts_at: '2026-10-01T00:00:00Z',
        ends_at: '2026-10-08T00:00:00Z',
        participation: 'team',
        team_size: 3,
        max_teams: 6,
        late_join_until: '2026-10-02T09:36:00Z',
      },
      () => 'T',
    );
    expect(items.map((i) => i.label)).toEqual(['Başlangıç sermayesi', 'İşlem maliyeti', 'Ölçüm dönemi', 'Katılım', 'Geç katılım']);
    expect(items[0].value).toBe('100.000 USD');
    expect(items[1].value).toContain('%0,25');
    expect(items[3].value).toBe('Takım · en fazla 3 kişi, 6 takım');
  });

  it('yüzde ve düşüş biçimleri', () => {
    expect(fmtSignedPct(4.2153)).toBe('+%4,22');
    expect(fmtSignedPct(-1.5)).toBe('−%1,50');
    expect(fmtSignedPct(0.001)).toBe('%0,00');
    expect(fmtSignedPct(null)).toBe('—');
    expect(fmtDrawdown(12.34)).toBe('−%12,3');
    expect(fmtDrawdown(0)).toBe('%0,0');
    expect(fmtDrawdown(null)).toBe('—');
    expect(periodColumnLabel(0, 'week')).toBe('1. hafta');
    expect(periodColumnLabel(1, 'month')).toBe('2. ay');
  });

  it('grafik renkleri: ben marka rengi, diğerleri farklı token', () => {
    const c = seriesColors([
      { entry_id: 'a', is_me: false },
      { entry_id: 'me', is_me: true },
      { entry_id: 'b', is_me: false },
    ]);
    expect(c.get('me')).toBe('--brand');
    expect(c.get('a')).not.toBe('--brand');
    expect(c.get('a')).not.toBe(c.get('b'));
  });

  it('stil etiketi tonları ve mod algılama', () => {
    expect(styleTone('active_trading')).toBe('gold');
    expect(styleTone('buy_and_hold')).toBe('up');
    expect(styleTone('bilinmeyen')).toBe('neutral');
    expect(isPortfolioLeague({ mode: 'portfolio' })).toBe(true);
    expect(isPortfolioLeague({ mode: 'main' })).toBe(false);
    expect(isPortfolioLeague(null)).toBe(false);
  });

  it('lig normalleştiricileri modu taşır; eski yanıtlar ana lig sayılır', () => {
    expect(toLeague({ id: '1', mode: 'portfolio' }).mode).toBe('portfolio');
    expect(toLeague({ id: '1' }).mode).toBe('main');
    const page = toPublicLeaguePage({
      items: [
        { id: 'p', mode: 'portfolio', portfolio: { starting_capital_usd: '10000', commission_bps: 50, participation: 'team' } },
        { id: 'm' },
      ],
      total: 2,
    });
    expect(page.items[0].portfolio).toEqual({ starting_capital_usd: 10_000, commission_bps: 50, participation: 'team' });
    expect(page.items[1].mode).toBe('main');
    expect(page.items[1].portfolio).toBeNull();
  });
});
