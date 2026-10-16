// Ortak Akıl — Öneri Havuzu (backend: /api/ideas, migration 024). Normalleştirici: src/lib/ideas.ts

import type { AssetType } from '@portfoygo/shared/types';

export type IdeaStance = 'al' | 'sat' | 'izle';
export type IdeaHorizon = '1w' | '1m' | '3m' | '6m' | '1y';
export type IdeaStatus = 'acik' | 'kapandi';
export type IdeaOutcome = 'beklendigi_gibi' | 'kismen' | 'beklenmedik';
export type IdeaScope = 'public' | 'league';
export type IdeaResponseStance = 'katiliyorum' | 'katilmiyorum';
export type IdeaUpdateKind = 'note' | 'target_hit' | 'invalidation_hit' | 'review_due' | 'closed';
export type IdeaReportTarget = 'idea' | 'response' | 'comment' | 'update';
export type IdeaReportReason = 'spam' | 'yaniltici' | 'hakaret' | 'tavsiye' | 'kisisel' | 'diger';
export type IdeaQuoteCurrency = 'USD' | 'TRY';

/** Liste görünümleri: en yeni · değerlendirme bekleyenler · kapananlar · izlediklerim · önerilerim */
export type IdeaView = 'newest' | 'review_due' | 'closed' | 'bookmarks' | 'mine';
export type IdeaScopeFilter = 'all' | 'public' | 'leagues';

export interface IdeaAuthor {
  username: string;
  avatar_id: string;
  frame_id: string | null;
  profile_public: boolean;
}

export interface IdeaCard {
  id: string;
  author: IdeaAuthor;
  is_mine: boolean;
  asset_type: AssetType;
  symbol: string;
  name: string;
  stance: IdeaStance;
  horizon: IdeaHorizon;
  status: IdeaStatus;
  scope: IdeaScope;
  league: { id: string; name: string } | null;
  tags: string[];
  rationale_excerpt: string;
  published_at: string;
  closed_at: string | null;
  review_date: string | null;
  review_due: boolean;
  ref_price: number;
  quote_currency: IdeaQuoteCurrency;
  ref_price_at: string;
  price: number | null;
  price_at: string | null;
  price_source: 'live' | 'close' | null;
  change_pct: number | null;
  performance_pct: number | null;
  directional: boolean;
  target_price: number | null;
  invalidation_price: number | null;
  target_hit_at: string | null;
  invalidation_hit_at: string | null;
  outcome: IdeaOutcome | null;
  counts: { agree: number; disagree: number; comments: number };
  bookmarked: boolean;
  hidden: boolean;
}

export interface IdeaUpdate {
  id: string;
  kind: IdeaUpdateKind;
  text: string | null;
  price: number | null;
  created_at: string;
  hidden: boolean;
}

export interface IdeaResponse {
  id: string;
  username: string;
  avatar_id: string;
  stance: IdeaResponseStance;
  reason: string;
  created_at: string;
  updated_at: string;
  edited: boolean;
  is_me: boolean;
  hidden: boolean;
}

export interface IdeaComment {
  id: string;
  username: string;
  avatar_id: string;
  text: string;
  created_at: string;
  is_me: boolean;
  is_author: boolean;
}

export interface IdeaTrackRecord {
  published: number;
  open: number;
  closed: number;
  as_expected: number;
  partial: number;
  unexpected: number;
  as_expected_pct: number | null;
  avg_days_to_close: number | null;
}

export interface IdeaDetail extends IdeaCard {
  rationale: string;
  scenario: string;
  scenario_cases: { bull: string | null; base: string | null; bear: string | null };
  risks: string;
  evaluation: string | null;
  lessons: string | null;
  hidden_reason: string | null;
  target_distance_pct: number | null;
  invalidation_distance_pct: number | null;
  suggested_review_date: string;
  updates: IdeaUpdate[];
  responses: { agree: IdeaResponse[]; disagree: IdeaResponse[] };
  my_response: IdeaResponse | null;
  author_track_record: IdeaTrackRecord;
  can: { respond: boolean; comment: boolean; add_update: boolean; close: boolean; bookmark: boolean; report: boolean };
}

export interface IdeaPage {
  items: IdeaCard[];
  total: number;
  limit: number;
  offset: number;
}

export interface IdeaCommentPage {
  items: IdeaComment[];
  has_more: boolean;
}

export interface IdeaChartPoint {
  /** Unix saniye (UTC) */
  t: number;
  v: number;
}

export interface IdeaChart {
  id: string;
  quote_currency: IdeaQuoteCurrency;
  granularity: 'm15' | 'hour' | 'day' | null;
  points: IdeaChartPoint[];
  ref_price: number;
  published_at: string;
  target_price: number | null;
  invalidation_price: number | null;
  ends_at: string;
}

export interface IdeaListFilters {
  view: IdeaView;
  scope: IdeaScopeFilter;
  league_id?: string | null;
  asset_type?: AssetType | null;
  stance?: IdeaStance | null;
  horizon?: IdeaHorizon | null;
  status?: IdeaStatus | null;
  q?: string;
  author?: string | null;
  limit: number;
  offset: number;
}

export interface CreateIdeaInput {
  asset_type: AssetType;
  symbol: string;
  stance: IdeaStance;
  horizon: IdeaHorizon;
  rationale: string;
  scenario: string;
  scenario_bull?: string | null;
  scenario_base?: string | null;
  scenario_bear?: string | null;
  risks: string;
  target_price?: number | null;
  invalidation_price?: number | null;
  review_date?: string | null;
  tags?: string[];
  scope: IdeaScope;
  league_id?: string | null;
}

export interface CloseIdeaInput {
  outcome: IdeaOutcome;
  evaluation: string;
  lessons?: string | null;
}

/** Varlık araması (GET /picks/assets — Haftalık Seçim ile ortak) */
export interface IdeaAssetOption {
  asset_type: AssetType;
  symbol: string;
  name: string;
  price: number | null;
  quote_currency: IdeaQuoteCurrency;
  change_24h_pct: number | null;
}

/** Herkese açık profildeki sakin başarı kaydı */
export interface PublicIdeasRecord {
  published: number;
  closed: number;
  as_expected_pct: number | null;
  avg_days_to_close: number | null;
}
