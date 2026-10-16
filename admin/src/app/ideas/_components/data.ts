'use client';

import useSWR from 'swr';
import { APP_URL, apiFetch, swrFetcher, withQuery } from '@/lib/api';
import { usePaged } from '@/lib/hooks';

/* Ortak Akıl — Öneri Havuzu yönetimi: uç noktalar, sözleşme okuyucuları ve veri kancaları (/api/admin/ideas/*). */

type Tone = 'neutral' | 'brand' | 'up' | 'down' | 'gold';

export const REPORTS_PAGE = 20;
export const IDEAS_PAGE = 20;
export const COMMENTS_PAGE = 30;

export type ReportStatus = 'acik' | 'islendi' | 'reddedildi';
export type ReportTarget = 'idea' | 'response' | 'comment' | 'update';
export type IdeasFilter = 'all' | 'hidden' | 'reported';

export interface AdminIdeasSummary {
  open_reports: number;
  ideas_total: number;
  ideas_open: number;
  ideas_hidden: number;
  ideas_today: number;
  comments_today: number;
}

export interface AdminIdeaReport {
  id: string;
  idea_id: string | null;
  target_type: ReportTarget;
  target_id: string;
  reason: string;
  note: string | null;
  status: ReportStatus;
  created_at: string;
  resolved_at: string | null;
  reporter_username: string;
  resolved_by_username: string | null;
  idea: { symbol: string; stance: string; author: string; hidden: boolean } | null;
  target: { exists: boolean; text: string | null; author: string | null; hidden: boolean };
  reports_on_target: number;
}

export interface AdminIdea {
  id: string;
  asset_type: string;
  symbol: string;
  stance: string;
  horizon: string;
  status: 'acik' | 'kapandi';
  scope: 'public' | 'league';
  league_name: string | null;
  username: string;
  rationale_excerpt: string;
  published_at: string;
  hidden: boolean;
  hidden_reason: string | null;
  hidden_by_username: string | null;
  responses: number;
  comments: number;
  open_reports: number;
}

export interface AdminIdeaComment {
  id: string;
  idea_id: string;
  symbol: string;
  username: string;
  text: string;
  created_at: string;
  deleted: boolean;
  deleted_by_username: string | null;
}

export const REASON_LABEL: Record<string, string> = {
  tavsiye: 'Kesin getiri vaadi / yönlendirme',
  yaniltici: 'Yanıltıcı bilgi',
  hakaret: 'Hakaret / taciz',
  spam: 'Spam / tekrar',
  kisisel: 'Kişisel veri',
  diger: 'Diğer',
};

export const TARGET_LABEL: Record<ReportTarget, string> = { idea: 'Öneri', response: 'Yanıt', comment: 'Yorum', update: 'İzleme notu' };

export const REPORT_STATUS_META: Record<ReportStatus, { label: string; tone: Tone }> = {
  acik: { label: 'Bekliyor', tone: 'gold' },
  islendi: { label: 'İşlendi', tone: 'up' },
  reddedildi: { label: 'Reddedildi', tone: 'neutral' },
};

export const STANCE_LABEL: Record<string, string> = { al: 'Al', sat: 'Sat', izle: 'İzle' };
export const STANCE_TONE: Record<string, Tone> = { al: 'up', sat: 'down', izle: 'brand' };

/** Sitedeki öneri sayfası */
export const siteIdeaUrl = (id: string) => `${APP_URL}/ortak-akil/${encodeURIComponent(id)}`;

const s = (v: unknown) => (v == null ? '' : String(v));
const sOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null);
const n = (v: unknown) => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(x) ? x : 0;
};

export function toReport(r: any): AdminIdeaReport {
  return {
    id: s(r?.id),
    idea_id: sOrNull(r?.idea_id),
    target_type: (['idea', 'response', 'comment', 'update'] as const).includes(r?.target_type) ? r.target_type : 'idea',
    target_id: s(r?.target_id),
    reason: s(r?.reason),
    note: sOrNull(r?.note),
    status: r?.status === 'islendi' || r?.status === 'reddedildi' ? r.status : 'acik',
    created_at: s(r?.created_at),
    resolved_at: sOrNull(r?.resolved_at),
    reporter_username: s(r?.reporter_username) || '—',
    resolved_by_username: sOrNull(r?.resolved_by_username),
    idea: r?.idea?.symbol ? { symbol: s(r.idea.symbol), stance: s(r.idea.stance), author: s(r.idea.author), hidden: r.idea.hidden === true } : null,
    target: {
      exists: r?.target?.exists === true,
      text: sOrNull(r?.target?.text),
      author: sOrNull(r?.target?.author),
      hidden: r?.target?.hidden === true,
    },
    reports_on_target: n(r?.reports_on_target) || 1,
  };
}

export function toAdminIdea(r: any): AdminIdea {
  return {
    id: s(r?.id),
    asset_type: s(r?.asset_type),
    symbol: s(r?.symbol),
    stance: s(r?.stance),
    horizon: s(r?.horizon),
    status: r?.status === 'kapandi' ? 'kapandi' : 'acik',
    scope: r?.scope === 'league' ? 'league' : 'public',
    league_name: sOrNull(r?.league_name),
    username: s(r?.username) || '—',
    rationale_excerpt: s(r?.rationale_excerpt),
    published_at: s(r?.published_at),
    hidden: r?.hidden === true,
    hidden_reason: sOrNull(r?.hidden_reason),
    hidden_by_username: sOrNull(r?.hidden_by_username),
    responses: n(r?.responses),
    comments: n(r?.comments),
    open_reports: n(r?.open_reports),
  };
}

export function toAdminComment(r: any): AdminIdeaComment {
  return {
    id: s(r?.id),
    idea_id: s(r?.idea_id),
    symbol: s(r?.symbol),
    username: s(r?.username) || '—',
    text: s(r?.text),
    created_at: s(r?.created_at),
    deleted: r?.deleted === true,
    deleted_by_username: sOrNull(r?.deleted_by_username),
  };
}

export const ideasKeys = {
  summary: '/admin/ideas/summary',
  reports: (p: { status: ReportStatus | 'all'; limit: number; offset: number }) => withQuery('/admin/ideas/reports', p),
  ideas: (p: { filter: IdeasFilter; q?: string; limit: number; offset: number }) => withQuery('/admin/ideas/ideas', p),
  comments: (p: { limit: number; offset: number }) => withQuery('/admin/ideas/comments', p),
};

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body ?? {}) });

export const ideasAdminApi = {
  /** Denetim kaydı: ideas.hide */
  hide: (kind: 'ideas' | 'responses' | 'updates', id: string, reason?: string | null) =>
    apiFetch(`/admin/ideas/${kind}/${encodeURIComponent(id)}/hide`, post({ reason: reason || null })),
  /** Denetim kaydı: ideas.unhide */
  unhide: (kind: 'ideas' | 'responses' | 'updates', id: string) => apiFetch(`/admin/ideas/${kind}/${encodeURIComponent(id)}/unhide`, post({})),
  /** Denetim kaydı: ideas.comment_delete */
  deleteComment: (id: string) => apiFetch(`/admin/ideas/comments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** Denetim kaydı: ideas.report_resolve */
  resolveReport: (id: string, status: 'islendi' | 'reddedildi') => apiFetch(`/admin/ideas/reports/${encodeURIComponent(id)}/resolve`, post({ status })),
};

export const TARGET_KIND: Record<Exclude<ReportTarget, 'comment'>, 'ideas' | 'responses' | 'updates'> = { idea: 'ideas', response: 'responses', update: 'updates' };

export function useIdeasSummary() {
  return useSWR<AdminIdeasSummary>(ideasKeys.summary, swrFetcher, { revalidateOnFocus: true });
}

export function useReports(status: ReportStatus | 'all', offset: number) {
  const list = usePaged<any>(ideasKeys.reports({ status, limit: REPORTS_PAGE, offset }));
  return { ...list, items: list.items.map(toReport) };
}

export function useAdminIdeas(filter: IdeasFilter, q: string, offset: number) {
  const list = usePaged<any>(ideasKeys.ideas({ filter, q: q || undefined, limit: IDEAS_PAGE, offset }));
  return { ...list, items: list.items.map(toAdminIdea) };
}

export function useAdminComments(offset: number) {
  const list = usePaged<any>(ideasKeys.comments({ limit: COMMENTS_PAGE, offset }));
  return { ...list, items: list.items.map(toAdminComment) };
}
