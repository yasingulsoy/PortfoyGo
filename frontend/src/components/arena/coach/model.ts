// Arena koçu: sözleşme normalleştiricisi ve saf yardımcılar (React içermez; birim testli).

import type { CoachBreakdown, CoachGrade, CoachInsight, CoachInsightType, CoachReportData, CoachStats, CoachTradeRef } from '@/types';

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : v == null ? fallback : String(v));
const num = (v: unknown, fallback = 0) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

const GRADES: CoachGrade[] = ['A', 'B', 'C', 'D', 'E'];
const INSIGHT_TYPES: CoachInsightType[] = ['good', 'tip', 'warning'];

/** Puandan not (sunucu notu yoksa yedek). */
export function gradeFromScore(score: number): CoachGrade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'E';
}

function toTradeRef(raw: any): CoachTradeRef | null {
  if (raw == null) return null;
  if (typeof raw === 'number' || typeof raw === 'string') {
    const pnl = num(raw, NaN);
    return Number.isFinite(pnl) ? { id: null, instrument: null, side: null, pnl, return_pct: null } : null;
  }
  if (typeof raw !== 'object') return null;
  const pnl = num(raw.pnl ?? raw.realized_pnl ?? raw.value, NaN);
  if (!Number.isFinite(pnl)) return null;
  const pct = num(raw.return_pct ?? raw.pnl_pct, NaN);
  return {
    id: raw.id ? str(raw.id) : null,
    instrument: raw.instrument_label || raw.label || raw.instrument ? str(raw.instrument_label ?? raw.label ?? raw.instrument) : null,
    side: raw.side ? str(raw.side) : null,
    pnl,
    return_pct: Number.isFinite(pct) ? pct : null,
  };
}

function toStats(raw: any): CoachStats {
  const s = raw && typeof raw === 'object' ? raw : {};
  const trades = Math.max(0, Math.round(num(s.trades)));
  const wins = Math.max(0, Math.round(num(s.wins)));
  const losses = Math.max(0, Math.round(num(s.losses)));
  let winRate = num(s.win_rate, trades ? (wins / trades) * 100 : 0);
  // Kesir olarak gelirse (0..1) yüzdeye çevir
  if (winRate > 0 && winRate <= 1 && wins > 0 && trades > 1) winRate *= 100;
  return {
    trades,
    wins,
    losses,
    win_rate: Math.max(0, Math.min(100, winRate)),
    avg_hold_s: Math.max(0, num(s.avg_hold_s)),
    sl_usage_pct: Math.max(0, Math.min(100, num(s.sl_usage_pct))),
    tp_usage_pct: Math.max(0, Math.min(100, num(s.tp_usage_pct))),
    best_trade: toTradeRef(s.best_trade),
    worst_trade: toTradeRef(s.worst_trade),
    max_drawdown_pct: Math.abs(num(s.max_drawdown_pct)),
    trades_per_min: Math.max(0, num(s.trades_per_min)),
    instruments_used: arr(s.instruments_used).map((i) => (typeof i === 'object' && i ? str(i.code ?? i.label) : str(i))).filter(Boolean),
    total_pnl: Number.isFinite(num(s.total_pnl, NaN)) ? num(s.total_pnl) : null,
    return_pct: Number.isFinite(num(s.return_pct, NaN)) ? num(s.return_pct) : null,
  };
}

function toInsight(raw: any): CoachInsight | null {
  if (!raw || typeof raw !== 'object') return null;
  const title = str(raw.title).trim();
  if (!title) return null;
  const type = INSIGHT_TYPES.includes(raw.type) ? (raw.type as CoachInsightType) : 'tip';
  return {
    type,
    code: str(raw.code, type),
    title,
    detail: str(raw.detail).trim(),
    why: str(raw.why).trim() || null,
    refs: arr(raw.refs).map((r) => str(r)).filter(Boolean),
  };
}

/** Puan bileşenleri ve üst sınırları */
export const BREAKDOWN_PARTS: { key: keyof CoachBreakdown; label: string; max: number; hint: string }[] = [
  { key: 'risk', label: 'Risk yönetimi', max: 35, hint: 'Stop kullanımı, işlem büyüklüğü, tasfiyeden kaçınma' },
  { key: 'discipline', label: 'Disiplin', max: 20, hint: 'Sakin tempo, intikam işlemi yapmama' },
  { key: 'quality', label: 'İşlem kalitesi', max: 20, hint: 'Kazanç/kayıp oranı, kârı erken kesmeme' },
  { key: 'result', label: 'Sonuç', max: 25, hint: 'Turun getirisi' },
];

function toBreakdown(raw: any): CoachBreakdown | null {
  if (!raw || typeof raw !== 'object') return null;
  const clamp = (v: unknown, max: number) => Math.max(0, Math.min(max, num(v)));
  return { risk: clamp(raw.risk, 35), discipline: clamp(raw.discipline, 20), quality: clamp(raw.quality, 20), result: clamp(raw.result, 25) };
}

/** Koç raporunu güvenle okur; boş/bozuk yanıtta null. */
export function toCoachReport(raw: any): CoachReportData | null {
  const d = raw && typeof raw === 'object' && 'data' in raw && raw.data && typeof raw.data === 'object' ? raw.data : raw;
  if (!d || typeof d !== 'object') return null;
  const score = Math.max(0, Math.min(100, Math.round(num(d.score, NaN))));
  if (!Number.isFinite(score)) return null;
  const grade = GRADES.includes(d.grade) ? (d.grade as CoachGrade) : gradeFromScore(score);
  const insights = arr(d.insights).map(toInsight).filter((i): i is CoachInsight => i !== null);
  return {
    score,
    grade,
    headline: str(d.headline).trim() || null,
    insights,
    stats: toStats(d.stats),
    breakdown: toBreakdown(d.breakdown),
  };
}

/** Not başına koçun tepkisi (oyunsu, kısa). */
export const GRADE_COPY: Record<CoachGrade, { label: string; line: string }> = {
  A: { label: 'Efsane!', line: 'Disiplinli ve soğukkanlı. Bu oyunu sen yönetiyorsun!' },
  B: { label: 'Çok iyi', line: 'Sağlam bir tur. Birkaç ince ayarla zirvedesin.' },
  C: { label: 'Fena değil', line: 'Temel yerinde. Risk yönetimine biraz daha dikkat.' },
  D: { label: 'Gelişiyor', line: 'Her tur bir ders. Aşağıdaki ipuçlarını dene.' },
  E: { label: 'Isınma turu', line: 'Kötü tur diye bir şey yok, öğrenilecek tur var!' },
};

/** Koçun düdük modu: iyi notta neşeli, kötü notta cesaretlendirici. */
export function coachMood(grade: CoachGrade): 'happy' | 'neutral' | 'cheer' {
  if (grade === 'A' || grade === 'B') return 'happy';
  if (grade === 'C') return 'neutral';
  return 'cheer';
}

/** "2 dk 05 sn" / "45 sn" */
export function formatHold(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} dk ${String(r).padStart(2, '0')} sn` : `${m} dk`;
}

/** Ekranda en fazla 4 içgörü: önce uyarılar, sonra ipuçları, sonra iyi şeyler değil — sunucu sırası korunur. */
export function pickInsights(list: CoachInsight[], max = 4): CoachInsight[] {
  return list.slice(0, max);
}
