// Global Portföy Lab API'si (backend: routes/globalLab.ts, migration 025). Katalog ve sınıflandırma ücretsiz;
// senaryo analizi / kayıt / karşılaştırma Premium (402 SUBSCRIPTION_REQUIRED). Tüm analizler eğitim amaçlıdır.

import { apiFetch, post } from '@portfoygo/shared/api';

export type BaseCurrency = 'USD' | 'TRY';
export type ScenarioMode = 'cells' | 'instruments';

export interface LabQuote {
  asset_type: string;
  symbol: string;
  price: number;
  currency: string;
  change_24h_pct: number | null;
}

export interface LabInstrument {
  id: string;
  symbol: string;
  name: string;
  vehicle: string;
  asset_class: string;
  sub_class: string | null;
  region: string;
  country: string | null;
  currency: string;
  risk_level: number;
  expense_ratio_pct: number | null;
  description_tr: string | null;
  data_source: string;
  license_note: string;
  provider_symbol: string | null;
  active: boolean;
  notes_count: number;
  quote?: LabQuote | null;
  added_at?: string;
}

export interface LabNote {
  id: string;
  instrument_id: string;
  title: string;
  /** Ücretsiz planda null (yalnızca başlık) */
  body: string | null;
  author: string | null;
  created_at: string;
  updated_at: string;
}

export interface LabInstrumentDetail {
  instrument: LabInstrument;
  notes: LabNote[];
  notes_locked: boolean;
  in_research_list: boolean;
  disclaimer: string;
}

export interface LabCell {
  key: string;
  asset_class: string;
  region: string;
  label: string;
  expected_return_pct: number;
  volatility_pct: number;
  source: string;
  as_of: string | null;
  note: string | null;
}

export interface LabStressInfo {
  id: string;
  name: string;
  period_label: string | null;
  description: string | null;
  source: string;
  note: string | null;
}

export interface LabMeta {
  disclaimer: string;
  regions: string[];
  asset_classes: { id: string; label: string }[];
  vehicles: { id: string; label: string }[];
  risk_levels: { level: number; label: string }[];
  base_currencies: BaseCurrency[];
  limits: {
    compareMax: number;
    scenarioRowsMax: number;
    savedMax: number;
    scenarioCompareMax: number;
    researchListMax: number;
    horizonMinYears: number;
    horizonMaxYears: number;
    amountMin: number;
    amountMax: number;
  };
  home_bias_reference_pct: number;
  assumptions: {
    note: string;
    base: 'USD';
    updated_at: string | null;
    cells: LabCell[];
    fx: { key: string; label: string; expected_return_pct: number; volatility_pct: number; source: string; as_of: string | null; note: string | null } | null;
    psd_adjusted: boolean;
    stress_note: string;
    stress: LabStressInfo[];
  };
}

export type CellAllocation = { key: string; weight: number };
export type InstrumentAllocation = { instrument_id: string; weight: number };

export type ScenarioInput =
  | { mode: 'cells'; base_currency: BaseCurrency; horizon_years: number; amount: number; allocations: CellAllocation[] }
  | { mode: 'instruments'; base_currency: BaseCurrency; horizon_years: number; amount: number; allocations: InstrumentAllocation[] };

export interface LabSimulation {
  months: number[];
  p5: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p95: number[];
  paths: number;
  seed: number;
  prob_loss: number;
  median_return: number;
  mean_final: number;
  var95_horizon: number;
  var95_1y: number;
  p5_return: number;
  p95_return: number;
  cagr_median: number;
  max_drawdown_median: number;
  max_drawdown_p95: number;
}

export interface Share {
  name: string;
  share: number;
}

export interface StressResult {
  id: string;
  name: string;
  period_label: string | null;
  description: string | null;
  portfolio_return: number;
  fx_shock: number | null;
  rows: { key: string; weight: number; shock: number; contribution: number; source: 'exact' | 'fallback' | 'missing' }[];
  missing: string[];
}

export interface Analysis {
  base_currency: BaseCurrency;
  horizon_years: number;
  amount: number;
  exposures: {
    key: string;
    label: string;
    asset_class: string;
    region: string;
    weight: number;
    expected_return: number;
    volatility: number;
    risk_contribution: number;
    fallback: boolean;
    instruments: { id: string; symbol: string; name: string; weight: number }[];
  }[];
  metrics: { expected_return: number; volatility: number; sharpe: number; risk_free: number };
  simulation: LabSimulation;
  diversification: {
    effective_bets: number;
    effective_holdings: number;
    cells: number;
    regions: Share[];
    currencies: Share[];
    asset_classes: Share[];
    region_hhi: number;
    currency_hhi: number;
    foreign_currency_share: number;
    home_bias: { tr_share: number; reference_share: number; ratio: number | null };
  };
  stress: StressResult[];
  assumptions: { psd_adjusted: boolean; fx: { expected_return: number; volatility: number } | null };
}

export interface SavedScenario {
  id: string;
  name: string;
  mode: ScenarioMode;
  base_currency: BaseCurrency;
  horizon_years: number;
  amount: number;
  allocations: (CellAllocation | InstrumentAllocation)[];
  created_at: string;
  updated_at: string;
}

export interface ScenarioWithAnalysis {
  scenario: SavedScenario;
  analysis: Analysis | null;
  error: string | null;
}

export interface CatalogFilters {
  region?: string;
  asset_class?: string;
  vehicle?: string;
  currency?: string;
  risk_min?: number;
  risk_max?: number;
  q?: string;
}

function withQuery(path: string, params: Record<string, string | number | null | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

const enc = encodeURIComponent;
const unwrap = <T>(res: unknown): T => {
  const r = res as { data?: T } | null;
  return (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;
};

/** SWR anahtarları (swrFetcher `data` zarfını açar) */
export const globalLabKeys = {
  meta: '/global-lab/meta',
  instruments: (f: CatalogFilters = {}) => withQuery('/global-lab/instruments', { ...f }),
  instrument: (symbol: string) => `/global-lab/instruments/${enc(symbol)}`,
  researchList: '/global-lab/research-list',
  scenarios: '/global-lab/scenarios',
  example: '/global-lab/scenarios/example',
  scenario: (id: string) => `/global-lab/scenarios/${enc(id)}`,
};

export const globalLabApi = {
  addToList: (instrumentId: string) => apiFetch(globalLabKeys.researchList, post({ instrument_id: instrumentId })),
  removeFromList: (instrumentId: string) => apiFetch(`${globalLabKeys.researchList}/${enc(instrumentId)}`, { method: 'DELETE' }),
  analyze: async (input: ScenarioInput) => unwrap<{ analysis: Analysis }>(await apiFetch('/global-lab/scenarios/analyze', post(input))).analysis,
  save: async (name: string, input: ScenarioInput) => unwrap<ScenarioWithAnalysis>(await apiFetch(globalLabKeys.scenarios, post({ name, ...input }))),
  update: async (id: string, name: string, input: ScenarioInput) =>
    unwrap<ScenarioWithAnalysis>(await apiFetch(globalLabKeys.scenario(id), { method: 'PATCH', body: JSON.stringify({ name, ...input }) })),
  get: async (id: string) => unwrap<ScenarioWithAnalysis>(await apiFetch(globalLabKeys.scenario(id))),
  remove: (id: string) => apiFetch(globalLabKeys.scenario(id), { method: 'DELETE' }),
  compare: async (ids: string[]) => unwrap<{ items: ScenarioWithAnalysis[] }>(await apiFetch('/global-lab/scenarios/compare', post({ ids }))).items,
};
