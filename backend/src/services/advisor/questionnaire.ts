import { AppError } from '../../utils/errors';
import { ASSET_CLASSES, AssetClass, CLASS_LABELS } from './universe';

/**
 * =============================================================================
 * RİSK PROFİLİ ANKETİ — TEK YAPILANDIRMA DOSYASI
 * =============================================================================
 * Soruları, seçenekleri, puanları, soru ağırlıklarını, profil eşiklerini ve profillerin
 * dağılım kısıtlarını BURADAN düzenleyin. Kodun geri kalanı bu yapıları okur.
 *
 * Puanlama:
 *   toplam puan = Σ (soru.weight × seçilen seçeneğin score'u)
 *   en yüksek puan = Σ (soru.weight × o sorudaki en yüksek score)
 *   oran = toplam / en yüksek  →  PROFILE_THRESHOLDS ile profil (1..5)
 *   Seçeneğin `cap` alanı varsa profil o seviyeyi AŞAMAZ (ör. vadesi 1 yıldan kısa olan
 *   kullanıcı en fazla "Temkinli" olur). Hepsi deterministik ve açıklanabilir.
 *
 * Kurallar:
 *   - score: 0 (en düşük risk) … 4 (en yüksek risk) önerilir; tamsayı olmalı.
 *   - weight: pozitif tamsayı (puan INTEGER olarak saklanır).
 *   - Soru veya seçenek id'si değişirse eski yanıtlar geçersiz olur → QUESTIONNAIRE_VERSION'ı artırın.
 *   - Kısıtlar (min/max) 0..1 arası ve tam yüzde (0.05 = %5) olmalı; her profilde Σmin ≤ 1 ≤ Σmax.
 * =============================================================================
 */

export const QUESTIONNAIRE_VERSION = 1;

export const PROFILE_IDS = ['muhafazakar', 'temkinli', 'dengeli', 'buyume', 'agresif'] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

export interface QuestionOption {
  id: string;
  label: string;
  /** Risk puanı (0 = en temkinli) */
  score: number;
  /** Bu seçenek seçilirse profil en fazla bu seviye olabilir */
  cap?: ProfileId;
}

export interface Question {
  id: string;
  text: string;
  help?: string;
  /** Soru ağırlığı (puan çarpanı) */
  weight: number;
  options: QuestionOption[];
}

export const QUESTIONS: Question[] = [
  {
    id: 'age',
    text: 'Yaş aralığın nedir?',
    help: 'Genç yatırımcıların kayıplarını telafi edecek daha uzun zamanı vardır.',
    weight: 1,
    options: [
      { id: '18_25', label: '18–25', score: 4 },
      { id: '26_35', label: '26–35', score: 3 },
      { id: '36_45', label: '36–45', score: 2 },
      { id: '46_55', label: '46–55', score: 1 },
      { id: '56_plus', label: '56 ve üzeri', score: 0 },
    ],
  },
  {
    id: 'horizon',
    text: 'Bu birikimi ne kadar süre yatırımda tutmayı planlıyorsun?',
    help: 'Vade uzadıkça kısa vadeli dalgalanmaların etkisi azalır.',
    weight: 2,
    options: [
      { id: 'lt_1y', label: '1 yıl veya daha kısa', score: 0, cap: 'temkinli' },
      { id: '1_3y', label: '1–3 yıl', score: 1 },
      { id: '3_5y', label: '3–5 yıl', score: 2 },
      { id: '5_10y', label: '5–10 yıl', score: 3 },
      { id: '10y_plus', label: '10 yıldan uzun', score: 4 },
    ],
  },
  {
    id: 'target_return',
    text: 'TL bazında yıllık hedef getirin hangisine daha yakın?',
    help: 'Daha yüksek getiri hedefi, daha fazla risk almayı ve daha büyük dalgalanmaları kabul etmeyi gerektirir.',
    weight: 1,
    options: [
      { id: 'r15_25', label: '%15–25', score: 0 },
      { id: 'r25_40', label: '%25–40', score: 1 },
      { id: 'r40_60', label: '%40–60', score: 3 },
      { id: 'r60_plus', label: '%60 ve üzeri', score: 4 },
    ],
  },
  {
    id: 'drawdown_reaction',
    text: 'Portföyün kısa sürede %20 değer kaybederse ne yaparsın?',
    help: 'Bu soru, düşüş anındaki gerçek risk toleransını ölçer.',
    weight: 2,
    options: [
      { id: 'sell_all', label: 'Hepsini satarım', score: 0, cap: 'temkinli' },
      { id: 'sell_some', label: 'Bir kısmını satarım', score: 1 },
      { id: 'hold', label: 'Hiçbir şey yapmam, beklerim', score: 2 },
      { id: 'buy_some', label: 'Biraz ekleme yaparım', score: 3 },
      { id: 'buy_more', label: 'Fırsat bilip ciddi alım yaparım', score: 4 },
    ],
  },
  {
    id: 'income_stability',
    text: 'Gelirin ne kadar düzenli?',
    weight: 1,
    options: [
      { id: 'none', label: 'Düzenli bir gelirim yok', score: 0 },
      { id: 'irregular', label: 'Düzensiz (serbest çalışma, dönemsel)', score: 1 },
      { id: 'regular_tight', label: 'Düzenli, ama ancak giderlerimi karşılıyor', score: 2 },
      { id: 'regular_saving', label: 'Düzenli ve her ay birikim yapabiliyorum', score: 3 },
      { id: 'multiple', label: 'Birden fazla düzenli gelir kaynağım var', score: 4 },
    ],
  },
  {
    id: 'experience',
    text: 'Yatırım deneyimin nedir?',
    weight: 1,
    options: [
      { id: 'none', label: 'Hiç yatırım yapmadım', score: 0 },
      { id: 'deposit_fx_gold', label: 'Mevduat, döviz veya altın', score: 1 },
      { id: 'funds', label: 'Yatırım fonları / BES', score: 2 },
      { id: 'stocks', label: 'Hisse senedi (1–3 yıl)', score: 3 },
      { id: 'advanced', label: 'Hisse, kripto ve türev ürünler (3 yıldan fazla)', score: 4 },
    ],
  },
  {
    id: 'savings_share',
    text: 'Toplam birikiminin ne kadarını bu portföye ayırırsın?',
    help: 'Birikiminin küçük bir kısmıyla yatırım yapmak, kayıpları taşımayı kolaylaştırır.',
    weight: 1,
    options: [
      { id: 'gt75', label: '%75’ten fazla', score: 0 },
      { id: '50_75', label: '%50–75', score: 1 },
      { id: '25_50', label: '%25–50', score: 2 },
      { id: '10_25', label: '%10–25', score: 3 },
      { id: 'lt10', label: '%10’dan az', score: 4 },
    ],
  },
  {
    id: 'asset_preference',
    text: 'Döviz/altın ile TL varlıklar arasında tercihin hangisi?',
    weight: 1,
    options: [
      { id: 'try_only', label: 'TL mevduat ve TL varlıklar', score: 0 },
      { id: 'mostly_try', label: 'Ağırlıklı TL, biraz döviz/altın', score: 1 },
      { id: 'fx_gold', label: 'Ağırlıklı döviz ve altın', score: 2 },
      { id: 'fx_gold_stocks', label: 'Döviz/altın ve hisse senedi karışık', score: 3 },
      { id: 'return_first', label: 'Fark etmez; getiri potansiyeline bakarım', score: 4 },
    ],
  },
];

/** Puan oranı (toplam / en yüksek) → profil. Oran ≤ maxRatio olan İLK eşik seçilir. */
export const PROFILE_THRESHOLDS: { profile: ProfileId; maxRatio: number }[] = [
  { profile: 'muhafazakar', maxRatio: 0.2 },
  { profile: 'temkinli', maxRatio: 0.4 },
  { profile: 'dengeli', maxRatio: 0.6 },
  { profile: 'buyume', maxRatio: 0.8 },
  { profile: 'agresif', maxRatio: 1 },
];

export interface ClassBounds {
  min: number;
  max: number;
}

export interface ProfileDefinition {
  id: ProfileId;
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  description: string;
  /** Hedef yıllık oynaklık bandı (TL bazında, ondalık: 0.05 = %5) */
  vol_band: [number, number];
  /** Varlık sınıfı başına en az / en fazla ağırlık */
  constraints: Record<AssetClass, ClassBounds>;
}

const b = (min: number, max: number): ClassBounds => ({ min, max });

export const PROFILES: Record<ProfileId, ProfileDefinition> = {
  muhafazakar: {
    id: 'muhafazakar',
    level: 1,
    label: 'Muhafazakâr',
    description: 'Önceliğin birikimini korumak. Getiri potansiyeli sınırlı ama dalgalanma çok düşük; ağırlık TL nakit ve güvenli liman varlıklarda.',
    vol_band: [0.0, 0.05],
    constraints: {
      cash_try: b(0.4, 0.9),
      usd: b(0, 0.3),
      eur: b(0, 0.2),
      gold: b(0.05, 0.3),
      us_stocks: b(0, 0.1),
      crypto: b(0, 0),
    },
  },
  temkinli: {
    id: 'temkinli',
    level: 2,
    label: 'Temkinli',
    description: 'Düşük riskle enflasyonun biraz üzerinde getiri arıyorsun. Küçük bir hisse payı ve sınırlı kripto ile dengelenmiş, nakit ağırlıklı bir portföy.',
    vol_band: [0.05, 0.09],
    constraints: {
      cash_try: b(0.2, 0.7),
      usd: b(0, 0.3),
      eur: b(0, 0.2),
      gold: b(0.05, 0.3),
      us_stocks: b(0, 0.3),
      crypto: b(0, 0.05),
    },
  },
  dengeli: {
    id: 'dengeli',
    level: 3,
    label: 'Dengeli',
    description: 'Büyüme ile güvenlik arasında denge kuruyorsun. Orta düzey dalgalanmayı kabul ederek hisse, altın ve döviz arasında çeşitlendirilmiş bir portföy.',
    vol_band: [0.09, 0.14],
    constraints: {
      cash_try: b(0.1, 0.5),
      usd: b(0, 0.25),
      eur: b(0, 0.2),
      gold: b(0.05, 0.3),
      us_stocks: b(0, 0.5),
      crypto: b(0, 0.1),
    },
  },
  buyume: {
    id: 'buyume',
    level: 4,
    label: 'Büyüme',
    description: 'Uzun vadede sermayeni büyütmek istiyorsun ve belirgin düşüşlere dayanabilirsin. Hisse ağırlıklı, kriptoya anlamlı pay ayıran bir portföy.',
    vol_band: [0.14, 0.2],
    constraints: {
      cash_try: b(0.05, 0.35),
      usd: b(0, 0.2),
      eur: b(0, 0.15),
      gold: b(0.05, 0.25),
      us_stocks: b(0.1, 0.7),
      crypto: b(0, 0.2),
    },
  },
  agresif: {
    id: 'agresif',
    level: 5,
    label: 'Agresif',
    description: 'En yüksek getiri potansiyelini hedefliyorsun ve büyük, uzun süreli düşüşleri kabul ediyorsun. Hisse ve kripto ağırlıklı, yüksek oynaklıklı bir portföy.',
    vol_band: [0.2, 0.35],
    constraints: {
      cash_try: b(0, 0.25),
      usd: b(0, 0.15),
      eur: b(0, 0.1),
      gold: b(0, 0.2),
      us_stocks: b(0.2, 0.8),
      crypto: b(0.05, 0.35),
    },
  },
};

// =============================================================================
// Puanlama (bu satırdan sonrası yapılandırma değil, mantık)
// =============================================================================

export type Answers = Record<string, string>;

export interface ScoreResult {
  score: number;
  max_score: number;
  ratio: number;
  /** Puana göre profil (sınırlamadan önce) */
  uncapped_profile: ProfileId;
  profile: ProfileId;
  /** Profili sınırlayan yanıtların açıklamaları */
  cap_reasons: string[];
}

export const MAX_SCORE = QUESTIONS.reduce((s, q) => s + q.weight * Math.max(...q.options.map((o) => o.score)), 0);

const levelOf = (id: ProfileId) => PROFILES[id].level;

export function profileForRatio(ratio: number): ProfileId {
  for (const t of PROFILE_THRESHOLDS) {
    if (ratio <= t.maxRatio + 1e-12) return t.profile;
  }
  return PROFILE_THRESHOLDS[PROFILE_THRESHOLDS.length - 1].profile;
}

/**
 * Yanıtları doğrular (her soru yanıtlanmalı, seçenek geçerli olmalı, bilinmeyen soru olmamalı)
 * ve puanlar. Hatalı yanıtta 400 (VALIDATION_ERROR) fırlatır.
 */
export function scoreAnswers(answers: Answers): ScoreResult {
  const known = new Set(QUESTIONS.map((q) => q.id));
  for (const key of Object.keys(answers)) {
    if (!known.has(key)) {
      throw new AppError(400, `Bilinmeyen soru: ${key}`, 'VALIDATION_ERROR');
    }
  }

  let score = 0;
  let capLevel = 5;
  let capProfile: ProfileId | null = null;
  const capReasons: string[] = [];
  for (const q of QUESTIONS) {
    const optionId = answers[q.id];
    if (optionId === undefined || optionId === null || optionId === '') {
      throw new AppError(400, `Lütfen tüm soruları yanıtla (eksik: "${q.text}")`, 'VALIDATION_ERROR');
    }
    const option = q.options.find((o) => o.id === optionId);
    if (!option) {
      throw new AppError(400, `Geçersiz seçenek: "${q.text}"`, 'VALIDATION_ERROR');
    }
    score += q.weight * option.score;
    if (option.cap) {
      capReasons.push(`"${q.text}" sorusuna "${option.label}" yanıtı verildiği için profil en fazla ${PROFILES[option.cap].label} olabilir.`);
      if (levelOf(option.cap) < capLevel) {
        capLevel = levelOf(option.cap);
        capProfile = option.cap;
      }
    }
  }

  const ratio = MAX_SCORE > 0 ? score / MAX_SCORE : 0;
  const uncapped = profileForRatio(ratio);
  const profile = capProfile && levelOf(uncapped) > capLevel ? capProfile : uncapped;
  return {
    score,
    max_score: MAX_SCORE,
    ratio,
    uncapped_profile: uncapped,
    profile,
    cap_reasons: profile !== uncapped ? capReasons : [],
  };
}

// =============================================================================
// İstemciye gösterilen biçimler
// =============================================================================

export interface PublicProfile {
  id: ProfileId;
  level: number;
  label: string;
  description: string;
  vol_band: [number, number];
}

export interface ProfileView extends PublicProfile {
  constraints: { class: AssetClass; label: string; min: number; max: number }[];
}

export function publicProfile(id: ProfileId): PublicProfile {
  const p = PROFILES[id];
  return { id: p.id, level: p.level, label: p.label, description: p.description, vol_band: [p.vol_band[0], p.vol_band[1]] };
}

export function profileView(id: ProfileId): ProfileView {
  const p = PROFILES[id];
  return {
    ...publicProfile(id),
    constraints: ASSET_CLASSES.map((c) => ({ class: c, label: CLASS_LABELS[c], min: p.constraints[c].min, max: p.constraints[c].max })),
  };
}

/** GET /api/advisor/questionnaire yanıtı (puanlar istemciye gönderilmez) */
export function questionnaireView() {
  return {
    version: QUESTIONNAIRE_VERSION,
    questions: QUESTIONS.map((q) => ({
      id: q.id,
      text: q.text,
      ...(q.help ? { help: q.help } : {}),
      options: q.options.map((o) => ({ id: o.id, label: o.label })),
    })),
    profiles: PROFILE_IDS.map((id) => publicProfile(id)),
  };
}

export const isProfileId = (v: unknown): v is ProfileId => typeof v === 'string' && (PROFILE_IDS as readonly string[]).includes(v);
