// Arena senaryoları: normalleştiriciler ve saf yardımcılar (React içermez; birim testli).

import type { ArenaScenario, ArenaScenarioDetail, RecentScenarioRound, ScenarioDifficulty, ScenarioRoundInfo } from '@/types';

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : v == null ? fallback : String(v));
const num = (v: unknown, fallback = 0) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const numOrNull = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const unwrapData = (raw: any) => (raw && typeof raw === 'object' && 'success' in raw && 'data' in raw ? raw.data : raw);

const DIFFICULTIES: ScenarioDifficulty[] = ['kolay', 'orta', 'zor'];

/** Senaryo turunda seçilebilen süreler (saniye) */
export const SCENARIO_DURATIONS = [60, 180, 300, 600] as const;
export type ScenarioDuration = (typeof SCENARIO_DURATIONS)[number];

export const DIFFICULTY_META: Record<ScenarioDifficulty, { label: string; stars: 1 | 2 | 3; tone: 'up' | 'gold' | 'down' }> = {
  kolay: { label: 'Kolay', stars: 1, tone: 'up' },
  orta: { label: 'Orta', stars: 2, tone: 'gold' },
  zor: { label: 'Zor', stars: 3, tone: 'down' },
};

export function durationText(s: number): string {
  return s < 60 ? `${s} sn` : `${Math.round(s / 60)} dk`;
}

export function toScenario(raw: any): ArenaScenario {
  const difficulty = DIFFICULTIES.includes(raw?.difficulty) ? (raw.difficulty as ScenarioDifficulty) : 'orta';
  return {
    id: str(raw?.id),
    slug: str(raw?.slug),
    title: str(raw?.title, 'Senaryo'),
    description: str(raw?.description ?? ''),
    difficulty,
    instruments: arr(raw?.instruments)
      .map((i) => (typeof i === 'string' ? { code: i, label: i } : { code: str(i?.code), label: str(i?.label, str(i?.code)) }))
      .filter((i) => i.code),
    synthetic: !!raw?.synthetic,
    plays: Math.max(0, Math.floor(num(raw?.plays))),
    my_best_return_pct: numOrNull(raw?.my_best_return_pct),
  };
}

export function toScenarios(input: unknown): ArenaScenario[] {
  const raw = unwrapData(input) as any;
  const list = Array.isArray(raw) ? raw : arr(raw?.items);
  return list.map(toScenario).filter((s) => s.id);
}

/** GET /arena/rounds/:id yanıtından senaryo brifingi ve "Ne oldu?" bilgisi. */
export function toScenarioRoundInfo(input: unknown): ScenarioRoundInfo | null {
  const raw = unwrapData(input) as any;
  const round = raw?.round ?? raw;
  if (!round || typeof round !== 'object') return null;
  const sc = round.scenario ?? raw?.scenario ?? null;
  const reveal = round.reveal ?? raw?.reveal ?? null;
  const status = str(round.status);
  const finished = status === 'finished' || !!round.cancelled || !!raw?.final;
  const debrief = str(reveal?.debrief ?? sc?.debrief ?? raw?.debrief ?? '').trim() || null;
  const ret = numOrNull(raw?.final?.return_pct ?? raw?.me?.return_pct);
  const from = reveal?.from ? str(reveal.from) : null;
  const to = reveal?.to ? str(reveal.to) : null;
  return {
    round_id: str(round.id ?? raw?.round_id),
    status,
    finished,
    scenario:
      sc && typeof sc === 'object'
        ? { id: str(sc.id), title: str(sc.title, 'Senaryo'), briefing: str(sc.briefing), synthetic: !!sc.synthetic }
        : null,
    debrief,
    return_pct: ret,
    duration_s: num(round.duration_s),
    window: from && to ? { from, to } : null,
  };
}

/** Senaryo listesini zorluk ve ada göre sıralar (kolaydan zora). */
export function sortScenarios(list: ArenaScenario[]): ArenaScenario[] {
  const rank = (d: ScenarioDifficulty) => DIFFICULTIES.indexOf(d);
  return [...list].sort((a, b) => rank(a.difficulty) - rank(b.difficulty) || a.title.localeCompare(b.title, 'tr'));
}

/** Brifing metnini paragraflara böler (boş satırlar). */
export function paragraphs(text: string | null | undefined): string[] {
  return str(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function toScenarioDetail(input: unknown): ArenaScenarioDetail {
  const raw = unwrapData(input) as any;
  const base = toScenario(raw);
  const debrief = raw?.debrief == null ? null : str(raw.debrief).trim() || null;
  return { ...base, briefing: str(raw?.briefing), debrief };
}

/** Geçmiş sayfasından senaryo turlarını süzer (en yeni önce) */
export function toRecentScenarioRounds(input: unknown, max = 5): RecentScenarioRound[] {
  const raw = unwrapData(input) as any;
  return arr(raw?.items ?? raw)
    .filter((r) => r?.kind === 'scenario' && r?.round_id)
    .slice(0, max)
    .map((r) => ({
      round_id: str(r.round_id),
      duration_s: num(r.duration_s, 60),
      return_pct: num(r.return_pct),
      trades_count: num(r.trades_count),
      finished_at: r.finished_at ? str(r.finished_at) : null,
    }));
}
