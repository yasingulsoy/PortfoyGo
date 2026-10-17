/**
 * Kriz Simülatörü — ayarlar (tek düzenlenebilir yer). Migration 029.
 *
 * Oyun: 100.000 TL sanal portföy, 12–20 tur (hafta / ay). Her turda oyuncu gündemi okur, dağılımı değiştirir,
 * onaylar; sunucu turun TL bazlı getirilerini açar ve uygular. Geri dönüş yok.
 */

export const CRISIS_ASSET_KEYS = ['hisse', 'tahvil', 'altin', 'nakit', 'usd', 'kripto'] as const;
export type CrisisAssetKey = (typeof CRISIS_ASSET_KEYS)[number];

/** Her senaryoda bulunması gereken sınıflar (60/40, tamamı hisse, tamamı nakit karşılaştırmaları için) */
export const REQUIRED_ASSETS: readonly CrisisAssetKey[] = ['hisse', 'tahvil', 'nakit'];

export const DEFAULT_ASSET_LABELS: Record<CrisisAssetKey, string> = {
  hisse: 'Hisse senedi (küresel)',
  tahvil: 'Tahvil',
  altin: 'Altın',
  nakit: 'Nakit / mevduat (TL)',
  usd: 'USD (döviz)',
  kripto: 'Kripto (Bitcoin)',
};

export const CRISIS_DIFFICULTIES = ['kolay', 'orta', 'zor'] as const;
export type CrisisDifficulty = (typeof CRISIS_DIFFICULTIES)[number];

export const CRISIS = {
  startValue: 100_000,
  /** İşlem maliyeti: işlem tutarının (alınan + satılan) %0,1'i. Başlangıç dağılımı (1. tur) ücretsiz. */
  tradeCostRate: 0.001,
  minTurns: 12,
  maxTurns: 20,
  /** Bir turun getirisi bu aralıkta olmalı (%) */
  returnBounds: { min: -95, max: 500 },
  /** Skor = toplam getiri (%) − drawdownPenalty × en büyük düşüş (%) */
  drawdownPenalty: 0.5,
  /** Büyük dağılım değişikliği: portföyün en az bu kadarı (yüzde puan, tek yönlü devir) el değiştirdi */
  bigSwingPct: 30,
  /** Panik anı: büyük düşüşten hemen sonra portföyün çoğunu nakde çekip toparlanmayı kaçırmak */
  panic: {
    /** Önceki turda portföy bu kadar (%) ya da daha fazla düştüyse … */
    turnDropPct: -5,
    /** … ya da zirveden düşüş bu kadar (%) ya da fazlaysa "büyük düşüş" sayılır */
    drawdownPct: 10,
    /** Karar sonrası nakit payı en az (%) */
    cashPct: 60,
    /** Nakit payı en az bu kadar (yüzde puan) arttı */
    cashIncreasePp: 30,
    /** Sonraki kaç turda toparlanmaya bakılır (karar turu dahil) */
    lookahead: 3,
    /** Eski dağılım bu kadar (yüzde puan) fazla kazandırdıysa "toparlanma kaçırıldı" */
    missedPp: 3,
  },
  /** Yükseleni kovalamak: bir turda sert yükselen varlığın ağırlığını hemen büyük ölçüde artırmak */
  chase: { risePct: 10, increasePp: 25, lookahead: 3, fallPct: -5 },
  /** Düşüşte dengeleme (ucuzlayanı almak) */
  dip: { dropPct: -5, increasePp: 10, lookahead: 3, risePct: 5 },
  /** Başlatma sınırı (İstanbul günü başına) ve ödül verilen tamamlama sınırı */
  maxStartsPerDay: 30,
  rewardedPerDay: 5,
  rewards: {
    base: { xp: 30, coins: 15 },
    grade: {
      A: { xp: 40, coins: 35 },
      B: { xp: 25, coins: 20 },
      C: { xp: 10, coins: 10 },
      D: { xp: 5, coins: 0 },
      F: { xp: 0, coins: 0 },
    },
  },
  /** game_ledger: reason (≤ 32), ref_type (≤ 24); ref_id = deneme kimliği → deneme başına bir kez */
  ledger: { reason: 'crisis_complete', refType: 'crisis' },
  questKey: 'crisis_complete',
  leaderboardLimit: 20,
  stylizedLabel: 'Stilize, yaklaşık — eğitim amaçlı',
  scoreExplanation:
    'Skor = toplam getiri (%) − 0,5 × en büyük düşüş (%). Aynı getiriyi daha küçük bir düşüşle elde eden daha yüksek skor alır; ' +
    'sıralama her oyuncunun bu senaryodaki en iyi skoruna göredir.',
} as const;

export type CrisisGrade = 'A' | 'B' | 'C' | 'D' | 'F';
