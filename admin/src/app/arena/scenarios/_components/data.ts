'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { scenarioKeys, swrFetcher } from '@/lib/api';
import type { AdminScenario, HistoricalSeries, ScenarioDifficulty, SeriesImportResult, SeriesPreview } from '@/lib/types';
import { num } from '@/components/model';

/* Senaryo yönetimi: normalleştiriciler ve SWR kancaları */

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : v == null ? fallback : String(v));
const strOrNull = (v: unknown) => (v == null || v === '' ? null : String(v));
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : Array.isArray((v as { items?: unknown[] } | null)?.items) ? (v as { items: any[] }).items : []);
const DIFFICULTIES: ScenarioDifficulty[] = ['kolay', 'orta', 'zor'];

export const DIFFICULTY_OPTIONS: { value: ScenarioDifficulty; label: string }[] = [
  { value: 'kolay', label: 'Kolay' },
  { value: 'orta', label: 'Orta' },
  { value: 'zor', label: 'Zor' },
];

export const difficultyLabel = (d: string) => DIFFICULTY_OPTIONS.find((o) => o.value === d)?.label ?? d;
export const difficultyTone = (d: string) => (d === 'kolay' ? 'up' : d === 'zor' ? 'down' : 'gold') as 'up' | 'down' | 'gold';

export function toSeries(r: any): HistoricalSeries {
  return {
    series_code: str(r?.series_code),
    label: str(r?.label, str(r?.series_code)),
    currency: r?.currency === 'TRY' ? 'TRY' : 'USD',
    source: str(r?.source),
    license_note: str(r?.license_note),
    points: num(r?.points),
    from: strOrNull(r?.from ?? r?.from_ts),
    to: strOrNull(r?.to ?? r?.to_ts),
    imported_at: strOrNull(r?.imported_at),
    imported_by: strOrNull(r?.imported_by_username ?? r?.imported_by),
    used_by: arr(r?.used_by).map((u) => ({ id: str(u?.id), title: str(u?.title), published: !!u?.published })),
  };
}

export function toImportResult(raw: any): SeriesImportResult {
  const d = raw?.data ?? raw;
  return {
    series_code: str(d?.series_code),
    points: num(d?.points),
    imported: d?.imported == null ? null : num(d.imported),
    from: strOrNull(d?.from),
    to: strOrNull(d?.to),
    rejected_rows: num(d?.rejected_rows),
    rejected_samples: arr(d?.rejected_samples).map((x) => ({ line: num(x?.line), reason: str(x?.reason) })),
    duplicates: num(d?.duplicates),
  };
}

/** Önizleme noktaları: {t: sn|ms, p} veya [ts, price] → {t: ms, p} */
export function toPreview(raw: any): SeriesPreview {
  const d = raw?.data ?? raw;
  const list = Array.isArray(d) ? d : arr(d?.points);
  const points = list
    .map((x: any) => {
      const t = Array.isArray(x) ? x[0] : (x?.t ?? x?.ts ?? x?.time);
      const p = Array.isArray(x) ? x[1] : (x?.p ?? x?.price ?? x?.value);
      const tn = typeof t === 'number' ? (t < 1e11 ? t * 1000 : t) : Date.parse(String(t));
      return { t: tn, p: Number(p) };
    })
    .filter((x: { t: number; p: number }) => Number.isFinite(x.t) && Number.isFinite(x.p))
    .sort((a: { t: number }, b: { t: number }) => a.t - b.t);
  return {
    series_code: str(d?.series_code),
    label: str(d?.label),
    currency: str(d?.currency, 'USD'),
    total: num(d?.total ?? points.length),
    points,
  };
}

export function toAdminScenario(r: any): AdminScenario {
  return {
    id: str(r?.id),
    slug: str(r?.slug),
    title: str(r?.title),
    description: strOrNull(r?.description),
    briefing: str(r?.briefing),
    debrief: str(r?.debrief),
    difficulty: DIFFICULTIES.includes(r?.difficulty) ? r.difficulty : 'orta',
    instruments: arr(r?.instruments).map((i) => ({ code: str(i?.code), label: str(i?.label, str(i?.code)), series_code: str(i?.series_code) })),
    window_from: str(r?.window_from),
    window_to: str(r?.window_to),
    published: !!r?.published,
    synthetic: !!r?.synthetic,
    plays: num(r?.plays),
    created_at: str(r?.created_at),
    updated_at: str(r?.updated_at),
  };
}

export function useSeriesList() {
  const swr = useSWR<unknown>(scenarioKeys.series, swrFetcher, { revalidateOnFocus: false });
  const items = useMemo(() => arr(swr.data).map(toSeries).filter((s) => s.series_code), [swr.data]);
  return { ...swr, items, loading: swr.isLoading && swr.data === undefined };
}

export function useScenarioList() {
  const swr = useSWR<unknown>(scenarioKeys.scenarios, swrFetcher, { revalidateOnFocus: false });
  const items = useMemo(() => arr(swr.data).map(toAdminScenario).filter((s) => s.id), [swr.data]);
  return { ...swr, items, loading: swr.isLoading && swr.data === undefined };
}

export function useSeriesPreview(code: string | null, range?: { from?: string; to?: string }, limit = 400) {
  const key = code ? scenarioKeys.seriesPreview(code, limit, range) : null;
  const swr = useSWR<unknown>(key, swrFetcher, { revalidateOnFocus: false, keepPreviousData: false });
  const preview = useMemo(() => (swr.data === undefined ? null : toPreview(swr.data)), [swr.data]);
  return { ...swr, preview, loading: swr.isLoading && swr.data === undefined };
}

/* ------------------------------------------------------------------ */
/* Zaman: senaryo pencereleri UTC ile girilir (tarihsel seriler UTC)      */
/* ------------------------------------------------------------------ */

/** epoch ms / ISO → datetime-local ("2020-03-12T14:30"), UTC */
export function toUtcInput(v: string | number | null | undefined): string {
  if (v == null || v === '') return '';
  const ms = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 16) : '';
}

/** datetime-local (UTC) → ISO; geçersizse null */
export function fromUtcInput(v: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2})?$/.exec(v.trim());
  if (!m) return null;
  const ms = Date.parse(`${m[1]}:00Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** "12 Mar 2020 14:30 UTC" */
export function formatUtc(v: string | number | null | undefined, withTime = true): string {
  if (v == null || v === '') return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleString('tr-TR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })}${withTime ? ' UTC' : ''}`;
}

/** Fiyat: anlamlı hassasiyet */
export function formatPrice(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return '—';
  const abs = Math.abs(p);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return p.toLocaleString('tr-TR', { maximumFractionDigits: digits });
}
