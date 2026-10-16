/**
 * Portföy Ligi — saf analiz fonksiyonları (veritabanına bağlanmaz; birim testleri: test/portfolioLeaguesUnit.test.ts).
 *
 *  - styleTags     : katılımcının DAVRANIŞINDAN türetilen basit stil etiketleri ("Yoğun işlem", "Al-tut" …)
 *  - periodReturns : değer serisinden haftalık / aylık dönem getirileri
 *  - normalizeSeries: grafik karşılaştırması için seriyi başlangıç = 100 olacak şekilde ölçekler
 *  - rankEntries   : getiriye göre sıralama (eşitlikte önce ölçümü başlayan, sonra kimlik)
 */

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export type StyleTagKey = 'active_trading' | 'buy_and_hold' | 'concentrated' | 'diversified' | 'cash_heavy';

export interface StyleTag {
  key: StyleTagKey;
  label: string;
  /** Etiketin neden verildiği (öğrenme amaçlı kısa açıklama) */
  reason: string;
}

export interface StyleInput {
  /** Ölçüm süresi (gün, kesirli olabilir) */
  days: number;
  /** Tüm işlemler (alış + satış) */
  tradesCount: number;
  /** İlk 24 saatteki kuruluş işlemleri DIŞINDAKİ işlemler (sonradan yapılan değişiklikler) */
  laterTrades: number;
  /** Dönem boyunca işlem hacmi / ortalama değer × 100 (bilinmiyorsa null) */
  turnoverPct: number | null;
  /** Nakit (USD) */
  cashUsd: number;
  /** Açık pozisyonların piyasa değerleri (USD) */
  positionValues: number[];
}

/**
 * Etiket kuralları (eşikler bilinçli olarak basit ve açıklanabilir tutuldu):
 *  - Nakit ağırlıklı    : değerin ≥ %50'si nakit.
 *  - Yoğun işlem        : haftada ortalama ≥ 10 işlem (dönem < 1 hafta ise 1 hafta sayılır) VEYA devir hızı ≥ %300.
 *  - Al-tut             : ölçüm en az 1 gün sürdü (ilk 24 saat kuruluş sayılır), Yoğun işlem DEĞİL, nakit < %50,
 *                         en az bir işlem var ve kuruluştan sonraki işlemler 30 günde en fazla 2 (en az 2 hak).
 *  - Yoğunlaşmış        : nakit < %50 ve (en büyük pozisyon değerin ≥ %40'ı VEYA pozisyonların etkin sayısı < 3).
 *  - Çeşitlendirilmiş   : nakit < %50, etkin pozisyon sayısı ≥ 5 ve en büyük pozisyon < %25.
 * Etkin pozisyon sayısı = 1 / Σ wᵢ² (wᵢ: pozisyonun yatırılan tutar içindeki payı; nakit hariç).
 * Yoğun işlem ↔ Al-tut ve Yoğunlaşmış ↔ Çeşitlendirilmiş birbirini dışlar.
 */
export function styleTags(input: StyleInput): StyleTag[] {
  const tags: StyleTag[] = [];
  const positions = input.positionValues.filter((v) => Number.isFinite(v) && v > 0);
  const invested = positions.reduce((s, v) => s + v, 0);
  const cash = Math.max(0, Number.isFinite(input.cashUsd) ? input.cashUsd : 0);
  const equity = invested + cash;
  if (!(equity > 0)) return tags;

  const cashPct = (cash / equity) * 100;
  const maxWeightPct = positions.length > 0 ? (Math.max(...positions) / equity) * 100 : 0;
  // 4 ondalığa yuvarlanır (5 eşit pozisyon = tam 5; kayan nokta 4,9999… vermesin)
  const effectiveN = invested > 0 ? round4(1 / positions.reduce((s, v) => s + (v / invested) ** 2, 0)) : 0;
  const weeks = Math.max(1, input.days / 7);
  const perWeek = input.tradesCount / weeks;
  const turnover = input.turnoverPct ?? 0;
  const fmt = (n: number, d = 0) => n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });

  const cashHeavy = cashPct >= 50;
  if (cashHeavy) {
    tags.push({ key: 'cash_heavy', label: 'Nakit ağırlıklı', reason: `Değerin %${fmt(cashPct)}'i nakitte` });
  }

  const active = perWeek >= 10 || turnover >= 300;
  if (active) {
    tags.push({
      key: 'active_trading',
      label: 'Yoğun işlem',
      reason: perWeek >= 10 ? `Haftada ortalama ${fmt(perWeek, 1)} işlem` : `Devir hızı %${fmt(turnover)}`,
    });
  } else if (!cashHeavy && input.tradesCount > 0 && input.days >= 1) {
    const allowance = Math.max(2, (2 * input.days) / 30);
    if (input.laterTrades <= allowance) {
      tags.push({
        key: 'buy_and_hold',
        label: 'Al-tut',
        reason: input.laterTrades === 0 ? 'Kuruluştan sonra hiç işlem yapılmadı' : `Kuruluştan sonra yalnızca ${input.laterTrades} işlem`,
      });
    }
  }

  if (!cashHeavy && positions.length > 0) {
    if (maxWeightPct >= 40 || effectiveN < 3) {
      tags.push({
        key: 'concentrated',
        label: 'Yoğunlaşmış',
        reason: maxWeightPct >= 40 ? `En büyük pozisyon değerin %${fmt(maxWeightPct)}'i` : `Etkin pozisyon sayısı ${fmt(effectiveN, 1)}`,
      });
    } else if (effectiveN >= 5 && maxWeightPct < 25) {
      tags.push({ key: 'diversified', label: 'Çeşitlendirilmiş', reason: `Etkin pozisyon sayısı ${fmt(effectiveN, 1)}` });
    }
  }
  return tags;
}

export interface ValuePoint {
  /** Unix ms */
  t: number;
  /** Değer (USD) */
  v: number;
}

export interface PeriodReturn {
  /** Dönem başlangıcı (ISO) */
  start: string;
  /** Dönem sonu (ISO; son dönem için ölçümün sonu / şimdi) */
  end: string;
  /** Dönem getirisi (%); dönem içinde veri yoksa null */
  return_pct: number | null;
}

/** Seride `t` anındaki (ya da öncesindeki son) değer; yoksa null */
function valueAt(points: ValuePoint[], t: number): number | null {
  let lo = 0;
  let hi = points.length - 1;
  let found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) {
      found = points[mid].v;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * Dönemsel getiriler: [start, end) aralığı `period` uzunluğundaki dilimlere bölünür (hafta = 7 gün,
 * ay = 30 gün; dilimler ölçüm başlangıcından sayılır, takvim haftası değildir — herkes için aynı).
 * Dilim getirisi = dilim sonundaki değer / dilim başındaki değer − 1. Dilim başında değer yoksa
 * `baseValue` (başlangıç sermayesi) kullanılır; ilk dilimde de öyle.
 */
export function periodReturns(
  rawPoints: ValuePoint[],
  opts: { start: number; end: number; period: 'week' | 'month'; baseValue: number }
): PeriodReturn[] {
  const span = opts.period === 'week' ? 7 * 86_400_000 : 30 * 86_400_000;
  const points = rawPoints.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0).sort((a, b) => a.t - b.t);
  const out: PeriodReturn[] = [];
  if (!(opts.end > opts.start)) return out;
  for (let s = opts.start; s < opts.end; s += span) {
    const e = Math.min(s + span, opts.end);
    const startValue = s === opts.start ? opts.baseValue : (valueAt(points, s) ?? opts.baseValue);
    const endValue = valueAt(points, e);
    const hasData = points.some((p) => p.t > s && p.t <= e);
    out.push({
      start: new Date(s).toISOString(),
      end: new Date(e).toISOString(),
      return_pct: hasData && endValue !== null && startValue > 0 ? round4((endValue / startValue - 1) * 100) : null,
    });
  }
  return out;
}

/** Seriyi başlangıç değeri 100 olacak şekilde ölçekler (base = başlangıç sermayesi) */
export function normalizeSeries(points: ValuePoint[], base: number): ValuePoint[] {
  if (!(base > 0)) return [];
  return points
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t)
    .map((p) => ({ t: p.t, v: Math.round((p.v / base) * 100 * 10_000) / 10_000 }));
}

export interface RankableEntry {
  id: string;
  return_pct: number | null;
  /** Ölçümün başladığı an (ms); eşitlikte önce başlayan önde */
  measured_from: number;
}

/** Getiri azalan; eşitlikte erken ölçüm, sonra kimlik. Getirisi olmayan (null) sıralanmaz. Kimlik → sıra */
export function rankEntries(entries: RankableEntry[]): Map<string, number> {
  const ranked = entries
    .filter((e) => e.return_pct !== null && Number.isFinite(e.return_pct))
    .sort((a, b) => (b.return_pct as number) - (a.return_pct as number) || a.measured_from - b.measured_from || a.id.localeCompare(b.id));
  return new Map(ranked.map((e, i) => [e.id, i + 1]));
}
