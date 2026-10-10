import { describe, expect, it } from 'vitest';
import {
  Answers,
  MAX_SCORE,
  PROFILE_IDS,
  PROFILE_THRESHOLDS,
  PROFILES,
  QUESTIONS,
  profileForRatio,
  questionnaireView,
  scoreAnswers,
} from '../src/services/advisor/questionnaire';
import { ASSET_CLASSES } from '../src/services/advisor/universe';
import { AppError } from '../src/utils/errors';

/** Seçenekler puana göre artan sırada (görüntüleme sırası farklı olabilir, ör. yaş) */
const byScore = (q: (typeof QUESTIONS)[number]) => [...q.options].sort((a, b) => a.score - b.score);

/** Her soru için (puana göre sıralı) seçenek indeksi → yanıtlar */
const answersFromIndexes = (idx: (q: (typeof QUESTIONS)[number], i: number) => number): Answers =>
  Object.fromEntries(
    QUESTIONS.map((q, i) => {
      const opts = byScore(q);
      return [q.id, opts[Math.min(opts.length - 1, Math.max(0, idx(q, i)))].id];
    })
  );

const lowest = () => answersFromIndexes(() => 0);
const highest = () => answersFromIndexes((q) => q.options.length - 1);

describe('advisor questionnaire config', () => {
  it('has 8 single-choice questions with 3–5 options, unique ids and integer scores/weights', () => {
    expect(QUESTIONS).toHaveLength(8);
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(8);
    for (const q of QUESTIONS) {
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      expect(q.options.length).toBeLessThanOrEqual(5);
      expect(new Set(q.options.map((o) => o.id)).size).toBe(q.options.length);
      expect(Number.isInteger(q.weight) && q.weight > 0).toBe(true);
      for (const o of q.options) expect(Number.isInteger(o.score) && o.score >= 0).toBe(true);
      // Puanlar 0'dan başlar ve seçenekler arasında tekrarlanmaz
      const scores = byScore(q).map((o) => o.score);
      expect(scores[0]).toBe(0);
      expect(new Set(scores).size).toBe(scores.length);
    }
    expect(MAX_SCORE).toBe(40);
  });

  it('profiles: 5 levels, ascending non-overlapping vol bands, feasible whole-percent constraints', () => {
    expect(PROFILE_IDS.map((id) => PROFILES[id].level)).toEqual([1, 2, 3, 4, 5]);
    let prevHi = -1;
    for (const id of PROFILE_IDS) {
      const p = PROFILES[id];
      expect(p.vol_band[0]).toBeLessThan(p.vol_band[1]);
      expect(p.vol_band[0]).toBeGreaterThanOrEqual(prevHi - 1e-12);
      prevHi = p.vol_band[1];
      let sMin = 0;
      let sMax = 0;
      for (const c of ASSET_CLASSES) {
        const { min, max } = p.constraints[c];
        expect(min).toBeGreaterThanOrEqual(0);
        expect(max).toBeLessThanOrEqual(1);
        expect(min).toBeLessThanOrEqual(max);
        expect(Math.abs(min * 100 - Math.round(min * 100))).toBeLessThan(1e-9);
        expect(Math.abs(max * 100 - Math.round(max * 100))).toBeLessThan(1e-9);
        sMin += min;
        sMax += max;
      }
      expect(sMin).toBeLessThanOrEqual(1 + 1e-9);
      expect(sMax).toBeGreaterThanOrEqual(1 - 1e-9);
    }
    // Örnek kısıtlar (toplantı): kripto en fazla 0/5/10/20/35, nakit en az 40/20/10/5/0, hisse en fazla 10/30/50/70/80
    expect(PROFILE_IDS.map((id) => PROFILES[id].constraints.crypto.max)).toEqual([0, 0.05, 0.1, 0.2, 0.35]);
    expect(PROFILE_IDS.map((id) => PROFILES[id].constraints.cash_try.min)).toEqual([0.4, 0.2, 0.1, 0.05, 0]);
    expect(PROFILE_IDS.map((id) => PROFILES[id].constraints.us_stocks.max)).toEqual([0.1, 0.3, 0.5, 0.7, 0.8]);
    expect(PROFILE_THRESHOLDS.map((t) => t.profile)).toEqual([...PROFILE_IDS]);
  });

  it('public view hides scores and weights', () => {
    const v = questionnaireView();
    expect(v.questions).toHaveLength(8);
    const json = JSON.stringify(v);
    expect(json).not.toContain('"score"');
    expect(json).not.toContain('"weight"');
    expect(json).not.toContain('"cap"');
    expect(v.profiles.map((p) => p.id)).toEqual([...PROFILE_IDS]);
  });
});

describe('advisor questionnaire scoring', () => {
  it('lowest answers → score 0, muhafazakar; highest → max score, agresif', () => {
    const lo = scoreAnswers(lowest());
    expect(lo.score).toBe(0);
    expect(lo.profile).toBe('muhafazakar');
    const hi = scoreAnswers(highest());
    expect(hi.score).toBe(MAX_SCORE);
    expect(hi.max_score).toBe(MAX_SCORE);
    expect(hi.profile).toBe('agresif');
    expect(hi.cap_reasons).toEqual([]);
  });

  it('profile boundaries are inclusive on the upper ratio', () => {
    expect(profileForRatio(0)).toBe('muhafazakar');
    expect(profileForRatio(0.2)).toBe('muhafazakar');
    expect(profileForRatio(0.2 + 1 / MAX_SCORE)).toBe('temkinli');
    expect(profileForRatio(0.4)).toBe('temkinli');
    expect(profileForRatio(0.41)).toBe('dengeli');
    expect(profileForRatio(0.6)).toBe('dengeli');
    expect(profileForRatio(0.61)).toBe('buyume');
    expect(profileForRatio(0.8)).toBe('buyume');
    expect(profileForRatio(0.81)).toBe('agresif');
    expect(profileForRatio(1)).toBe('agresif');
  });

  it('maps exact scores at the boundaries (8 → muhafazakar, 9 → temkinli, 32 → buyume, 33 → agresif)', () => {
    // age (ağırlık 1) ve income (ağırlık 1) ile ince ayar: hepsi 0 + seçilen puanlar
    const build = (scores: Record<string, number>): Answers =>
      Object.fromEntries(
        QUESTIONS.map((q) => {
          const target = scores[q.id] ?? 0;
          const opt = q.options.find((o) => o.score === target);
          if (!opt) throw new Error(`${q.id} için ${target} puanlı seçenek yok`);
          return [q.id, opt.id];
        })
      );
    // 8 = horizon 2×2 + drawdown 2×2 → muhafazakar
    expect(scoreAnswers(build({ horizon: 2, drawdown_reaction: 2 })).score).toBe(8);
    expect(scoreAnswers(build({ horizon: 2, drawdown_reaction: 2 })).profile).toBe('muhafazakar');
    // 9 → temkinli
    const nine = build({ horizon: 2, drawdown_reaction: 2, age: 1 });
    expect(scoreAnswers(nine).score).toBe(9);
    expect(scoreAnswers(nine).profile).toBe('temkinli');
    // 32 → buyume, 33 → agresif
    const s32 = build({ horizon: 4, drawdown_reaction: 4, age: 4, income_stability: 4, experience: 4, savings_share: 4, target_return: 0, asset_preference: 0 });
    expect(scoreAnswers(s32).score).toBe(32);
    expect(scoreAnswers(s32).profile).toBe('buyume');
    const s33 = build({ horizon: 4, drawdown_reaction: 4, age: 4, income_stability: 4, experience: 4, savings_share: 4, target_return: 0, asset_preference: 1 });
    expect(scoreAnswers(s33).score).toBe(33);
    expect(scoreAnswers(s33).profile).toBe('agresif');
  });

  it('caps: short horizon or "sell everything" limit the profile to temkinli', () => {
    const shortHorizon = { ...highest(), horizon: 'lt_1y' };
    const r = scoreAnswers(shortHorizon);
    expect(r.score).toBe(MAX_SCORE - 8);
    expect(r.uncapped_profile).toBe('buyume');
    expect(r.profile).toBe('temkinli');
    expect(r.cap_reasons.length).toBe(1);
    expect(r.cap_reasons[0]).toContain('Temkinli');

    const sellAll = { ...highest(), drawdown_reaction: 'sell_all' };
    expect(scoreAnswers(sellAll).profile).toBe('temkinli');

    // Sınır zaten altındaysa etkisi yok (ve gerekçe raporlanmaz)
    const low = { ...lowest(), horizon: 'lt_1y' };
    expect(scoreAnswers(low).profile).toBe('muhafazakar');
    expect(scoreAnswers(low).cap_reasons).toEqual([]);
  });

  it('is monotonic: choosing a riskier option never lowers the level', () => {
    const levels = (a: Answers) => PROFILES[scoreAnswers(a).profile].level;
    for (let base = 0; base < 5; base++) {
      const a = answersFromIndexes((_q, i) => (i + base) % 5);
      for (const q of QUESTIONS) {
        const opts = byScore(q);
        const idx = opts.findIndex((o) => o.id === a[q.id]);
        if (idx < opts.length - 1) {
          const riskier = { ...a, [q.id]: opts[idx + 1].id };
          // cap seçeneğinden çıkmak da seviyeyi düşürmez
          expect(levels(riskier)).toBeGreaterThanOrEqual(levels(a));
        }
      }
    }
  });

  it('rejects missing, invalid and unknown answers with 400', () => {
    const missing = lowest();
    delete (missing as Record<string, string>).age;
    const expect400 = (a: Answers, re: RegExp) => {
      try {
        scoreAnswers(a);
        throw new Error('fırlatmadı');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).status).toBe(400);
        expect((err as AppError).publicMessage).toMatch(re);
      }
    };
    expect400(missing, /tüm soruları/);
    expect400({ ...lowest(), age: 'nope' }, /Geçersiz seçenek/);
    expect400({ ...lowest(), extra: 'x' }, /Bilinmeyen soru/);
  });
});
