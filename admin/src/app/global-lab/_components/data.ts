'use client';

import useSWR from 'swr';
import { apiFetch, swrFetcher, withQuery } from '@/lib/api';

/* Global Portföy Lab yönetimi (backend: routes/adminGlobalLab.ts, migration 025): katalog, araştırma notları,
   sermaye piyasası varsayımları (ÖRNEK; kaynak ve tarih belirtin) ve stres senaryoları. Her değişiklik denetim kaydına yazılır. */

export const REGIONS = ['Kuzey Amerika', 'Avrupa', 'Asya-Pasifik', 'Gelişmekte olan', 'Türkiye', 'Küresel'] as const;
export const ASSET_CLASSES = ['hisse', 'tahvil', 'emtia', 'gayrimenkul', 'kripto', 'nakit'] as const;
export const VEHICLES = ['ETF', 'endeks', 'fon', 'hisse', 'tahvil', 'emtia', 'kripto'] as const;
export const CLASS_LABELS: Record<string, string> = { hisse: 'Hisse', tahvil: 'Tahvil', emtia: 'Emtia', gayrimenkul: 'Gayrimenkul', kripto: 'Kripto', nakit: 'Nakit' };
export const VEHICLE_LABELS: Record<string, string> = {
  ETF: 'ETF',
  endeks: 'Endeks',
  fon: 'Fon / nakit',
  hisse: 'Hisse senedi',
  tahvil: 'Tahvil',
  emtia: 'Emtia',
  kripto: 'Kripto varlık',
};

export interface Instrument {
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
  created_at: string;
  updated_at: string;
}

export type InstrumentInput = Omit<Instrument, 'id' | 'notes_count' | 'created_at' | 'updated_at'>;

export interface Note {
  id: string;
  instrument_id: string;
  symbol?: string;
  title: string;
  body: string | null;
  author: string | null;
  created_at: string;
  updated_at: string;
}

export interface Assumption {
  key: string;
  kind: 'cell' | 'fx';
  asset_class: string | null;
  region: string | null;
  label: string;
  expected_return_pct: number;
  volatility_pct: number;
  source: string;
  as_of: string | null;
  note: string | null;
  sort_order: number;
  updated_at: string;
  updated_by_username: string | null;
}

export interface Stress {
  id: string;
  name: string;
  period_label: string | null;
  description: string | null;
  shocks: Record<string, number>;
  source: string;
  note: string | null;
  sort_order: number;
  active: boolean;
  updated_at: string;
}

export interface AssumptionsView {
  note: string;
  assumptions: Assumption[];
  keys: string[];
  correlations: { key_a: string; key_b: string; rho: number }[];
  min_eigenvalue: number;
  psd_adjusted: boolean;
  stress: Stress[];
  stress_note: string;
}

export interface ImportResult {
  total: number;
  valid: number;
  duplicates: number;
  errors: { line: number; symbol: string | null; message: string }[];
  error_count: number;
  dry_run: boolean;
  /** katalog */
  created?: string[] | number;
  updated?: string[] | number;
  unchanged?: string[];
  /** notlar */
  unknown_symbols?: string[];
}

export const labKeys = {
  instruments: '/admin/global-lab/instruments',
  notes: (p: { instrument_id?: string; limit: number; offset: number }) => withQuery('/admin/global-lab/notes', p),
  assumptions: '/admin/global-lab/assumptions',
};

const enc = encodeURIComponent;
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const labAdminApi = {
  createInstrument: (input: Partial<InstrumentInput>) => apiFetch<{ data?: Instrument }>('/admin/global-lab/instruments', json('POST', input)),
  updateInstrument: (id: string, patch: Partial<InstrumentInput>) => apiFetch<{ data?: Instrument }>(`/admin/global-lab/instruments/${enc(id)}`, json('PATCH', patch)),
  deleteInstrument: (id: string) => apiFetch(`/admin/global-lab/instruments/${enc(id)}`, { method: 'DELETE' }),
  exportInstruments: async () => (await apiFetch<{ data: { filename: string; csv: string } }>('/admin/global-lab/instruments/export')).data,
  importCsv: async (kind: 'instruments' | 'notes', csv: string, dryRun: boolean) =>
    (
      await apiFetch<{ data: ImportResult }>(`/admin/global-lab/${kind}/import${dryRun ? '?dry_run=1' : ''}`, {
        method: 'POST',
        body: csv,
        headers: { 'Content-Type': 'text/csv' },
      })
    ).data,
  createNote: (input: { instrument_id: string; title: string; body: string }) => apiFetch<{ data?: Note }>('/admin/global-lab/notes', json('POST', input)),
  updateNote: (id: string, patch: { title?: string; body?: string }) => apiFetch<{ data?: Note }>(`/admin/global-lab/notes/${enc(id)}`, json('PATCH', patch)),
  deleteNote: (id: string) => apiFetch(`/admin/global-lab/notes/${enc(id)}`, { method: 'DELETE' }),
  exportNotes: async () => (await apiFetch<{ data: { filename: string; csv: string } }>('/admin/global-lab/notes/export')).data,
  updateAssumptions: (rows: { key: string; expected_return_pct: number; volatility_pct: number; source: string; as_of: string | null; note: string | null }[]) =>
    apiFetch<{ data?: AssumptionsView }>('/admin/global-lab/assumptions', json('PUT', { rows })),
  updateCorrelations: (pairs: { key_a: string; key_b: string; rho: number }[]) =>
    apiFetch<{ data?: AssumptionsView }>('/admin/global-lab/assumptions/correlations', json('PUT', { pairs })),
  upsertStress: (id: string, input: Omit<Stress, 'id' | 'updated_at' | 'sort_order'> & { sort_order?: number }) =>
    apiFetch<{ data?: Stress }>(`/admin/global-lab/stress/${enc(id)}`, json('PUT', input)),
  deleteStress: (id: string) => apiFetch(`/admin/global-lab/stress/${enc(id)}`, { method: 'DELETE' }),
};

export function useLabInstruments() {
  return useSWR<{ items: Instrument[]; total: number }>(labKeys.instruments, swrFetcher, { revalidateOnFocus: false });
}

export function useLabNotes(p: { instrument_id?: string; limit: number; offset: number }) {
  return useSWR<{ items: Note[]; total: number; limit: number; offset: number }>(labKeys.notes(p), swrFetcher, { revalidateOnFocus: false, keepPreviousData: true });
}

export function useAssumptions() {
  return useSWR<AssumptionsView>(labKeys.assumptions, swrFetcher, { revalidateOnFocus: false });
}

/** Türkçe ondalık: "7,5" → 7.5 */
export function parseNum(text: string): number {
  const t = text.trim().replace('%', '');
  if (!t) return NaN;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : NaN;
}

export const fmtNum = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? '' : n.toLocaleString('tr-TR', { maximumFractionDigits: digits });
