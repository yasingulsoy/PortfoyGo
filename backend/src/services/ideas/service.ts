import type { PoolClient } from 'pg';
import pool from '../../config/database';
import { logger } from '../../utils/logger';
import { GameError, Queryable, UUID_RE, istanbulDayStart, withTx } from '../game/common';
import { DEFAULT_AVATAR } from '../game/config';
import { NotificationService } from '../notifications';
import { cleanText } from '../picks/service';
import {
  ACTIVITY_COOLDOWN_MS,
  IDEA_LIMITS,
  IDEA_NOTIFICATION_CATEGORY,
  IDEA_NOTIFICATION_TYPES,
  IDEA_PRICES,
  IDEA_TEXT,
  IdeaAssetType,
  IdeaHorizon,
  IdeaOutcome,
  IdeaScope,
  IdeaStance,
  IdeaStatus,
  OUTCOME_LABELS,
  QuoteCurrency,
  REVIEW_DATE_MAX_DAYS,
  ReportReason,
  ReportStatus,
  ReportTarget,
  ResponseStance,
  STANCE_LABELS,
  UpdateKind,
  ideaLink,
} from './config';
import {
  TrackRecord,
  buildTrackRecord,
  distancePct,
  ideaPerformance,
  isReviewDue,
  istanbulDay,
  levelCrossed,
  normalizeTags,
  positive,
  round2,
  suggestedReviewDate,
  validateLevels,
  validateReviewDate,
} from './math';
import { ChartGranularity, ChartPoint, captureQuote, chartSeries, clearQuoteCache, fetchQuotes, highLowSince, liveQuotes, quoteKey } from './prices';

/**
 * Ortak Akıl — Öneri Havuzu.
 *
 * Katılımcılar yatırım fikirlerini yapılandırılmış bir kartla kaydeder (varlık + duruş + vade, gerekçe, beklenen
 * senaryo, riskler, izleme kriterleri). Yayında referans fiyat saklanır, performans canlı hesaplanır (yalnızca
 * saklanmış fiyatlar okunur). Yaşam döngüsü: 'acik' → yazar izleme notları ekler → 'kapandi' (zorunlu değerlendirme +
 * sonuç etiketi). Topluluk beğeni yerine gerekçeli "Katılıyorum / Katılmıyorum" yanıtı, yorum ve "İzlemeye al" kullanır;
 * varsayılan sıralama en yenidir (popülerlik sıralaması yok).
 *
 * Görünürlük: 'public' → herkes; 'league' → yalnızca seçilen ligin (şu anki) üyeleri + yazar. Yönetici tarafından
 * gizlenen içerik yalnızca yazarına "gizlendi" notuyla görünür. Yasaklı / silinmiş hesapların içeriği listelenmez.
 *
 * İş ('idea-reviews', günlük) → IdeasService.reviewJob(): değerlendirme tarihi gelen önerilerin yazarına bir kez
 * bildirim, hedef / geçersizlik seviyesi aşılınca (her biri bir kez) bildirim ve bekleyen toplu etkileşim bildirimleri.
 */

// ---------------------------------------------------------------------------
// DTO'lar
// ---------------------------------------------------------------------------

export interface IdeaAuthorDto {
  username: string;
  avatar_id: string;
  frame_id: string | null;
  profile_public: boolean;
}

export interface IdeaCardDto {
  id: string;
  author: IdeaAuthorDto;
  is_mine: boolean;
  asset_type: IdeaAssetType;
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
  quote_currency: QuoteCurrency;
  ref_price_at: string;
  /** Açık öneri: saklanmış en güncel fiyat · kapalı öneri: kapanış fiyatı */
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
  /** Yönetici gizledi (yalnızca yazar görür) */
  hidden: boolean;
}

export interface IdeaUpdateDto {
  id: string;
  kind: UpdateKind;
  text: string | null;
  price: number | null;
  created_at: string;
  hidden: boolean;
}

export interface IdeaResponseDto {
  id: string;
  username: string;
  avatar_id: string;
  stance: ResponseStance;
  reason: string;
  created_at: string;
  updated_at: string;
  edited: boolean;
  is_me: boolean;
  hidden: boolean;
}

export interface IdeaCommentDto {
  id: string;
  username: string;
  avatar_id: string;
  text: string;
  created_at: string;
  is_me: boolean;
  is_author: boolean;
}

export interface IdeaDetailDto extends IdeaCardDto {
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
  updates: IdeaUpdateDto[];
  responses: { agree: IdeaResponseDto[]; disagree: IdeaResponseDto[] };
  my_response: IdeaResponseDto | null;
  author_track_record: TrackRecord;
  can: { respond: boolean; comment: boolean; add_update: boolean; close: boolean; bookmark: boolean; report: boolean };
}

export interface IdeaListResult {
  items: IdeaCardDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface IdeaChartDto {
  id: string;
  quote_currency: QuoteCurrency;
  granularity: ChartGranularity | null;
  points: ChartPoint[];
  ref_price: number;
  published_at: string;
  target_price: number | null;
  invalidation_price: number | null;
  ends_at: string;
}

export const IDEA_VIEWS = ['newest', 'review_due', 'closed', 'bookmarks', 'mine'] as const;
export type IdeaView = (typeof IDEA_VIEWS)[number];
export const IDEA_SCOPE_FILTERS = ['all', 'public', 'leagues'] as const;
export type IdeaScopeFilter = (typeof IDEA_SCOPE_FILTERS)[number];

export interface IdeaListFilters {
  view: IdeaView;
  scope: IdeaScopeFilter;
  league_id?: string;
  asset_type?: IdeaAssetType;
  stance?: IdeaStance;
  horizon?: IdeaHorizon;
  status?: IdeaStatus;
  q?: string;
  author?: string;
  limit: number;
  offset: number;
}

export interface CreateIdeaInput {
  asset_type: IdeaAssetType;
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
  tags?: string[] | null;
  scope: IdeaScope;
  league_id?: string | null;
}

export interface CloseIdeaInput {
  outcome: IdeaOutcome;
  evaluation: string;
  lessons?: string | null;
}

export interface ReviewJobResult {
  review_due: number;
  target_hit: number;
  invalidation_hit: number;
  activity_flushed: number;
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const HUMAN = (a: string) => `COALESCE(${a}.is_banned, FALSE) = FALSE AND COALESCE(${a}.is_deleted, FALSE) = FALSE`;

const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

const err = (status: number, message: string, code: string, extra: Record<string, unknown> = {}) => new GameError(status, message, code, extra);

const notFound = () => err(404, 'Öneri bulunamadı', 'IDEA_NOT_FOUND');

/** Düz metin (çok satırlı): kontrol karakterleri atılır, satır sonları sınırlanır */
const clean = (s: string | null | undefined) => cleanText(String(s ?? ''), false);
const cleanOrNull = (s: string | null | undefined) => {
  const v = clean(s);
  return v ? v : null;
};

function checkLen(label: string, value: string, min: number, max: number): void {
  if (value.length < min) throw err(400, `${label} en az ${min} karakter olmalı`, 'VALIDATION_ERROR');
  if (value.length > max) throw err(400, `${label} en fazla ${max} karakter olabilir`, 'VALIDATION_ERROR');
}

function excerpt(s: string, max = 200): string {
  const flat = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

function fmtPrice(n: number | null, ccy: QuoteCurrency): string {
  if (n === null) return '—';
  const digits = n >= 100 ? 2 : n >= 1 ? 4 : 6;
  const s = n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: digits });
  return ccy === 'TRY' ? `${s} TL` : `${s} $`;
}

function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '-';
  const r = round2(n);
  return `%${r < 0 ? '-' : '+'}${Math.abs(r).toFixed(2).replace('.', ',')}`;
}

/**
 * Görünürlük koşulu (i = ideas, u = yazar). viewer: parametre yer tutucusu (ör. '$1') ya da null (oturumsuz).
 * Yazar kendi gizlenmiş önerisini görür; lig önerileri yalnızca ligin şu anki üyelerine görünür.
 */
function visibleSql(viewer: string | null): string {
  if (!viewer) return `i.hidden_at IS NULL AND i.scope = 'public' AND ${HUMAN('u')}`;
  return `(i.hidden_at IS NULL OR i.user_id = ${viewer}) AND ${HUMAN('u')}
    AND (i.scope = 'public' OR i.user_id = ${viewer}
      OR (i.league_id IS NOT NULL AND EXISTS (SELECT 1 FROM league_members m WHERE m.league_id = i.league_id AND m.user_id = ${viewer})))`;
}

function cardSelect(viewer: string | null, extraColumns = ''): string {
  return `SELECT ${extraColumns}i.id, i.user_id, i.asset_type, i.symbol, i.name, i.stance, i.horizon, i.status, i.scope, i.league_id, l.name AS league_name,
      i.tags, LEFT(i.rationale, 260) AS rationale_head, i.published_at, i.closed_at, i.review_date::text AS review_date,
      i.ref_price, i.quote_currency, i.ref_price_at, i.close_price, i.close_price_at, i.target_price, i.invalidation_price,
      i.target_hit_at, i.invalidation_hit_at, i.outcome, i.hidden_at,
      u.username, u.avatar_id, u.frame_id, COALESCE(u.profile_public, TRUE) AS profile_public,
      (SELECT COUNT(*)::int FROM idea_responses r JOIN users ru ON ru.id = r.user_id
        WHERE r.idea_id = i.id AND r.stance = 'katiliyorum' AND r.hidden_at IS NULL AND ${HUMAN('ru')}) AS agree_count,
      (SELECT COUNT(*)::int FROM idea_responses r JOIN users ru ON ru.id = r.user_id
        WHERE r.idea_id = i.id AND r.stance = 'katilmiyorum' AND r.hidden_at IS NULL AND ${HUMAN('ru')}) AS disagree_count,
      (SELECT COUNT(*)::int FROM idea_comments c JOIN users cu ON cu.id = c.user_id
        WHERE c.idea_id = i.id AND c.deleted_at IS NULL AND ${HUMAN('cu')}) AS comment_count,
      ${viewer ? `EXISTS (SELECT 1 FROM idea_bookmarks b WHERE b.idea_id = i.id AND b.user_id = ${viewer})` : 'FALSE'} AS bookmarked
    FROM ideas i
    JOIN users u ON u.id = i.user_id
    LEFT JOIN leagues l ON l.id = i.league_id`;
}

interface CardRow {
  id: string;
  user_id: string;
  asset_type: IdeaAssetType;
  symbol: string;
  name: string | null;
  stance: IdeaStance;
  horizon: IdeaHorizon;
  status: IdeaStatus;
  scope: IdeaScope;
  league_id: string | null;
  league_name: string | null;
  tags: string[] | null;
  rationale_head: string;
  published_at: Date;
  closed_at: Date | null;
  review_date: string | null;
  ref_price: string;
  quote_currency: QuoteCurrency;
  ref_price_at: Date;
  close_price: string | null;
  close_price_at: Date | null;
  target_price: string | null;
  invalidation_price: string | null;
  target_hit_at: Date | null;
  invalidation_hit_at: Date | null;
  outcome: IdeaOutcome | null;
  hidden_at: Date | null;
  username: string;
  avatar_id: string | null;
  frame_id: string | null;
  profile_public: boolean;
  agree_count: number;
  disagree_count: number;
  comment_count: number;
  bookmarked: boolean;
}

interface DetailRow extends CardRow {
  rationale: string;
  scenario: string;
  scenario_bull: string | null;
  scenario_base: string | null;
  scenario_bear: string | null;
  risks: string;
  evaluation: string | null;
  lessons: string | null;
  hidden_reason: string | null;
}

/** pg TEXT[] → string[] (PGlite / node-pg dizi olarak döndürür; metin gelirse ayrıştırılır) */
function toTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v.startsWith('{')) {
    return v
      .slice(1, -1)
      .split(',')
      .map((s) => s.replace(/^"|"$/g, '').trim())
      .filter(Boolean);
  }
  return [];
}

async function cardsFromRows(rows: CardRow[], viewerId: string | undefined, now: Date): Promise<IdeaCardDto[]> {
  const open = rows.filter((r) => r.status === 'acik');
  const quotes = open.length ? await liveQuotes(open.map((r) => ({ asset_type: r.asset_type, symbol: r.symbol }))) : new Map();
  return rows.map((r) => {
    let price: number | null = null;
    let priceAt: string | null = null;
    let source: IdeaCardDto['price_source'] = null;
    if (r.status === 'kapandi') {
      price = positive(r.close_price);
      priceAt = price ? iso(r.close_price_at) : null;
      source = price ? 'close' : null;
    } else {
      const q = quotes.get(quoteKey(r.asset_type, r.symbol));
      if (q && q.quote_currency === r.quote_currency) {
        price = q.price;
        priceAt = iso(q.as_of);
        source = 'live';
      }
    }
    const perf = ideaPerformance(r.stance, r.ref_price, price);
    return {
      id: r.id,
      author: { username: r.username, avatar_id: r.avatar_id ?? DEFAULT_AVATAR, frame_id: r.frame_id ?? null, profile_public: r.profile_public !== false },
      is_mine: viewerId !== undefined && r.user_id === viewerId,
      asset_type: r.asset_type,
      symbol: r.symbol,
      name: r.name || r.symbol,
      stance: r.stance,
      horizon: r.horizon,
      status: r.status,
      scope: r.scope,
      league: r.league_id ? { id: r.league_id, name: r.league_name ?? 'Lig' } : null,
      tags: toTags(r.tags),
      rationale_excerpt: excerpt(r.rationale_head),
      published_at: iso(r.published_at)!,
      closed_at: iso(r.closed_at),
      review_date: r.review_date ?? null,
      review_due: r.status === 'acik' && isReviewDue(r.review_date, now),
      ref_price: num(r.ref_price) ?? 0,
      quote_currency: r.quote_currency,
      ref_price_at: iso(r.ref_price_at)!,
      price,
      price_at: priceAt,
      price_source: source,
      change_pct: perf.change_pct,
      performance_pct: perf.performance_pct,
      directional: perf.directional,
      target_price: num(r.target_price),
      invalidation_price: num(r.invalidation_price),
      target_hit_at: iso(r.target_hit_at),
      invalidation_hit_at: iso(r.invalidation_hit_at),
      outcome: r.outcome ?? null,
      counts: { agree: Number(r.agree_count ?? 0), disagree: Number(r.disagree_count ?? 0), comments: Number(r.comment_count ?? 0) },
      bookmarked: r.bookmarked === true,
      hidden: r.hidden_at !== null,
    };
  });
}

async function assertVerifiedUser(userId: string, db: Queryable = pool): Promise<string> {
  const r = await db.query(
    `SELECT username, COALESCE(email_verified, FALSE) AS verified, COALESCE(is_banned, FALSE) AS banned FROM users WHERE id = $1`,
    [userId]
  );
  const u = r.rows[0];
  if (!u || u.banned) throw err(403, 'Bu işlem için yetkin yok', 'FORBIDDEN');
  if (!u.verified) throw err(403, 'Ortak Akıl’da paylaşım yapmak için e-posta adresini doğrulaman gerekiyor', 'EMAIL_NOT_VERIFIED');
  return String(u.username);
}

/** Öneri satırı (görünürlük kontrollü) — yoksa / görünmüyorsa 404 */
async function loadVisibleIdea(ideaId: string, viewerId: string | undefined, db: Queryable = pool): Promise<DetailRow> {
  if (!UUID_RE.test(ideaId)) throw notFound();
  const params: unknown[] = [ideaId];
  let viewer: string | null = null;
  if (viewerId) {
    params.push(viewerId);
    viewer = '$2';
  }
  const r = await db.query(
    `${cardSelect(viewer, 'i.rationale, i.scenario, i.scenario_bull, i.scenario_base, i.scenario_bear, i.risks, i.evaluation, i.lessons, i.hidden_reason, ')}
     WHERE i.id = $1 AND ${visibleSql(viewer)}`,
    params
  );
  const row = r.rows[0] as DetailRow | undefined;
  if (!row) throw notFound();
  return row;
}

async function trackRecordOf(userId: string, db: Queryable = pool): Promise<TrackRecord> {
  const r = await db.query(
    `SELECT COUNT(*)::int AS published,
            COUNT(*) FILTER (WHERE status = 'kapandi')::int AS closed,
            COUNT(*) FILTER (WHERE status = 'kapandi' AND outcome = 'beklendigi_gibi')::int AS as_expected,
            COUNT(*) FILTER (WHERE status = 'kapandi' AND outcome = 'kismen')::int AS partial,
            COUNT(*) FILTER (WHERE status = 'kapandi' AND outcome = 'beklenmedik')::int AS unexpected,
            COALESCE(SUM(EXTRACT(EPOCH FROM (closed_at - published_at)) / 86400.0) FILTER (WHERE status = 'kapandi'), 0) AS days
       FROM ideas WHERE user_id = $1 AND hidden_at IS NULL`,
    [userId]
  );
  const x = r.rows[0] ?? {};
  return buildTrackRecord({
    published: Number(x.published ?? 0),
    closed: Number(x.closed ?? 0),
    as_expected: Number(x.as_expected ?? 0),
    partial: Number(x.partial ?? 0),
    unexpected: Number(x.unexpected ?? 0),
    total_days_to_close: Number(x.days ?? 0),
  });
}

/** İstanbul günü içindeki sayım (günlük sınırlar) */
async function countToday(db: Queryable, table: string, userCol: string, userId: string, at: Date, extra = ''): Promise<number> {
  const r = await db.query(
    `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${userCol} = $1 AND created_at >= $2 ${extra}`,
    [userId, istanbulDayStart(at).toISOString()]
  );
  return Number(r.rows[0]?.n ?? 0);
}

function dailyLimitError(code: string, message: string, limit: number, at: Date): GameError {
  const resets = new Date(istanbulDayStart(at).getTime() + 24 * 60 * 60 * 1000);
  return err(429, message, code, {
    retry_after: Math.max(1, Math.ceil((resets.getTime() - at.getTime()) / 1000)),
    limit,
    resets_at: resets.toISOString(),
  });
}

/**
 * Yanıt / yorum etkinliği → yazara bildirim (öneri başına ACTIVITY_COOLDOWN_MS'de en fazla bir; aradakiler sayılır ve
 * sonraki bildirime / işin toplu gönderimine eklenir). Çağıranın transaction'ında çalışır; yazarın kendi etkinliği sayılmaz.
 */
async function noteActivity(c: PoolClient, ideaId: string, actorId: string, actorName: string, kind: 'response' | 'comment', detail: string | null, at: Date): Promise<void> {
  const r = await c.query(
    `SELECT user_id, symbol, stance, activity_notified_at, activity_pending_responses, activity_pending_comments
       FROM ideas WHERE id = $1 FOR UPDATE`,
    [ideaId]
  );
  const idea = r.rows[0];
  if (!idea || idea.user_id === actorId) return;
  const responses = Number(idea.activity_pending_responses) + (kind === 'response' ? 1 : 0);
  const comments = Number(idea.activity_pending_comments) + (kind === 'comment' ? 1 : 0);
  const last = idea.activity_notified_at ? new Date(idea.activity_notified_at).getTime() : null;
  if (last !== null && at.getTime() - last < ACTIVITY_COOLDOWN_MS) {
    await c.query(`UPDATE ideas SET activity_pending_responses = $2, activity_pending_comments = $3 WHERE id = $1`, [ideaId, responses, comments]);
    return;
  }
  const single = responses + comments === 1;
  const title = single
    ? kind === 'response'
      ? `${actorName}, ${idea.symbol} önerine yanıt verdi: ${detail ?? ''}`.trim()
      : `${actorName}, ${idea.symbol} önerine yorum yazdı`
    : `${idea.symbol} önerinde yeni etkileşimler`;
  const parts = [responses > 0 ? `${responses} yanıt` : null, comments > 0 ? `${comments} yorum` : null].filter(Boolean).join(', ');
  await NotificationService.notify(
    idea.user_id,
    {
      type: IDEA_NOTIFICATION_TYPES.activity,
      category: IDEA_NOTIFICATION_CATEGORY,
      title,
      body: single ? 'Gerekçeleri okuyup izleme notlarınla değerlendirebilirsin.' : `Son bildirimden bu yana ${parts} geldi.`,
      link: ideaLink(ideaId),
      data: { idea_id: ideaId, symbol: idea.symbol, responses, comments },
    },
    c
  );
  await c.query(
    `UPDATE ideas SET activity_notified_at = $2, activity_pending_responses = 0, activity_pending_comments = 0 WHERE id = $1`,
    [ideaId, at.toISOString()]
  );
}

function updateDto(r: any, viewerIsAuthor: boolean): IdeaUpdateDto | null {
  const hidden = r.hidden_at !== null && r.hidden_at !== undefined;
  if (hidden && !viewerIsAuthor) return null;
  return { id: r.id, kind: r.kind, text: hidden ? null : r.text, price: num(r.price), created_at: iso(r.created_at)!, hidden };
}

function responseDto(r: any, viewerId: string | undefined): IdeaResponseDto {
  const created = iso(r.created_at)!;
  const updated = iso(r.updated_at) ?? created;
  return {
    id: r.id,
    username: r.username,
    avatar_id: r.avatar_id ?? DEFAULT_AVATAR,
    stance: r.stance,
    reason: r.reason,
    created_at: created,
    updated_at: updated,
    edited: Date.parse(updated) - Date.parse(created) > 1000,
    is_me: viewerId !== undefined && r.user_id === viewerId,
    hidden: r.hidden_at !== null && r.hidden_at !== undefined,
  };
}

// ---------------------------------------------------------------------------
// Servis
// ---------------------------------------------------------------------------

export class IdeasService {
  static clearCaches(): void {
    clearQuoteCache();
  }

  /** GET /api/ideas */
  static async list(viewerId: string | undefined, f: IdeaListFilters, now: Date = new Date()): Promise<IdeaListResult> {
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const viewer = viewerId ? p(viewerId) : null;
    const where: string[] = [visibleSql(viewer)];

    if ((f.view === 'bookmarks' || f.view === 'mine') && !viewer) return { items: [], total: 0, limit: f.limit, offset: f.offset };

    let order = 'i.published_at DESC, i.id DESC';
    switch (f.view) {
      case 'review_due':
        where.push(`i.status = 'acik' AND i.review_date IS NOT NULL AND i.review_date <= ${p(istanbulDay(now))}::date`);
        order = 'i.review_date ASC, i.published_at DESC, i.id DESC';
        break;
      case 'closed':
        where.push(`i.status = 'kapandi'`);
        order = 'i.closed_at DESC, i.id DESC';
        break;
      case 'bookmarks':
        where.push(`EXISTS (SELECT 1 FROM idea_bookmarks b WHERE b.idea_id = i.id AND b.user_id = ${viewer})`);
        break;
      case 'mine':
        where.push(`i.user_id = ${viewer}`);
        break;
      default:
        break;
    }
    if (f.status && f.view !== 'review_due' && f.view !== 'closed') where.push(`i.status = ${p(f.status)}`);
    if (f.scope === 'public') where.push(`i.scope = 'public'`);
    if (f.scope === 'leagues') {
      if (!viewer) return { items: [], total: 0, limit: f.limit, offset: f.offset };
      where.push(`i.scope = 'league'`);
    }
    if (f.league_id) where.push(`i.league_id = ${p(f.league_id)}`);
    if (f.asset_type) where.push(`i.asset_type = ${p(f.asset_type)}`);
    if (f.stance) where.push(`i.stance = ${p(f.stance)}`);
    if (f.horizon) where.push(`i.horizon = ${p(f.horizon)}`);
    if (f.author) where.push(`LOWER(u.username) = LOWER(${p(f.author)})`);
    if (f.q) {
      const q = f.q.trim().toUpperCase().replace(/[\\%_]/g, (ch) => `\\${ch}`);
      where.push(`(i.symbol LIKE ${p(`${q}%`)} OR UPPER(COALESCE(i.name, '')) LIKE ${p(`%${q}%`)})`);
    }

    const whereSql = where.join(' AND ');
    const [rows, total] = await Promise.all([
      pool.query(`${cardSelect(viewer)} WHERE ${whereSql} ORDER BY ${order} LIMIT ${p(f.limit)} OFFSET ${p(f.offset)}`, params),
      pool.query(
        `SELECT COUNT(*)::int AS n FROM ideas i JOIN users u ON u.id = i.user_id WHERE ${whereSql}`,
        params.slice(0, params.length - 2)
      ),
    ]);
    return {
      items: await cardsFromRows(rows.rows as CardRow[], viewerId, now),
      total: Number(total.rows[0]?.n ?? 0),
      limit: f.limit,
      offset: f.offset,
    };
  }

  /** GET /api/ideas/:id */
  static async detail(ideaId: string, viewerId: string | undefined, now: Date = new Date()): Promise<IdeaDetailDto> {
    const row = await loadVisibleIdea(ideaId, viewerId);
    const isAuthor = viewerId !== undefined && row.user_id === viewerId;
    const [card] = await cardsFromRows([row], viewerId, now);
    const [updates, responses, track] = await Promise.all([
      pool.query(
        `SELECT id, kind, text, price, created_at, hidden_at FROM idea_updates WHERE idea_id = $1 ORDER BY created_at ASC, id ASC LIMIT $2`,
        [row.id, IDEA_LIMITS.updatesShown]
      ),
      pool.query(
        `SELECT r.id, r.user_id, r.stance, r.reason, r.created_at, r.updated_at, r.hidden_at, ru.username, ru.avatar_id
           FROM idea_responses r JOIN users ru ON ru.id = r.user_id
          WHERE r.idea_id = $1 AND ${HUMAN('ru')} AND (r.hidden_at IS NULL OR r.user_id = $2::uuid)
          ORDER BY r.updated_at DESC, r.id DESC
          LIMIT $3`,
        [row.id, viewerId ?? null, IDEA_LIMITS.responsesShown]
      ),
      trackRecordOf(row.user_id),
    ]);
    const resp = responses.rows.map((r: any) => responseDto(r, viewerId));
    const mine = resp.find((r) => r.is_me) ?? null;
    const visibleResp = resp.filter((r) => !r.hidden);
    const open = row.status === 'acik';
    const active = row.hidden_at === null;
    return {
      ...card,
      rationale: row.rationale,
      scenario: row.scenario,
      scenario_cases: { bull: row.scenario_bull ?? null, base: row.scenario_base ?? null, bear: row.scenario_bear ?? null },
      risks: row.risks,
      evaluation: row.evaluation ?? null,
      lessons: row.lessons ?? null,
      hidden_reason: isAuthor && row.hidden_at ? row.hidden_reason ?? null : null,
      target_distance_pct: open ? distancePct(row.target_price, card.price) : null,
      invalidation_distance_pct: open ? distancePct(row.invalidation_price, card.price) : null,
      suggested_review_date: suggestedReviewDate(new Date(row.published_at), row.horizon),
      updates: updates.rows.map((u: any) => updateDto(u, isAuthor)).filter((u): u is IdeaUpdateDto => u !== null),
      responses: {
        agree: visibleResp.filter((r) => r.stance === 'katiliyorum'),
        disagree: visibleResp.filter((r) => r.stance === 'katilmiyorum'),
      },
      my_response: mine,
      author_track_record: track,
      can: {
        respond: !!viewerId && !isAuthor && open && active,
        comment: !!viewerId && active,
        add_update: isAuthor && open && active,
        close: isAuthor && open && active,
        bookmark: !!viewerId,
        report: !!viewerId && !isAuthor,
      },
    };
  }

  /** GET /api/ideas/compare?ids=a,b,c — görünen öneriler (istek sırasıyla) + bulunamayanlar */
  static async compare(ids: string[], viewerId: string | undefined, now: Date = new Date()): Promise<{ items: IdeaDetailDto[]; missing: string[] }> {
    const uniq = [...new Set(ids)].slice(0, IDEA_LIMITS.compareMax);
    const items: IdeaDetailDto[] = [];
    const missing: string[] = [];
    for (const id of uniq) {
      try {
        items.push(await IdeasService.detail(id, viewerId, now));
      } catch (e) {
        if (e instanceof GameError && e.code === 'IDEA_NOT_FOUND') missing.push(id);
        else throw e;
      }
    }
    return { items, missing };
  }

  /** GET /api/ideas/:id/chart — yayından (kapanmışsa kapanışa kadar) bu yana fiyat geçmişi */
  static async chart(ideaId: string, viewerId: string | undefined, now: Date = new Date()): Promise<IdeaChartDto> {
    const row = await loadVisibleIdea(ideaId, viewerId);
    const publishedAt = new Date(row.published_at);
    const end = row.status === 'kapandi' && row.closed_at ? new Date(row.closed_at) : now;
    const series = await chartSeries({ asset_type: row.asset_type, symbol: row.symbol, quote_currency: row.quote_currency }, publishedAt, end);
    const ref = num(row.ref_price) ?? 0;
    const points: ChartPoint[] = [{ t: Math.floor(publishedAt.getTime() / 1000), v: ref }, ...series.points.filter((x) => x.t * 1000 > publishedAt.getTime())];
    // Son nokta: kapanış fiyatı ya da güncel fiyat
    let lastPrice: number | null = null;
    let lastAt: Date | null = null;
    if (row.status === 'kapandi') {
      lastPrice = positive(row.close_price);
      lastAt = row.close_price_at ? new Date(row.close_price_at) : end;
    } else {
      const q = (await liveQuotes([{ asset_type: row.asset_type, symbol: row.symbol }])).get(quoteKey(row.asset_type, row.symbol));
      if (q && q.quote_currency === row.quote_currency) {
        lastPrice = q.price;
        lastAt = now;
      }
    }
    if (lastPrice !== null && lastAt) {
      const t = Math.floor(lastAt.getTime() / 1000);
      if (t > points[points.length - 1].t) points.push({ t, v: lastPrice });
    }
    return {
      id: row.id,
      quote_currency: row.quote_currency,
      granularity: series.granularity,
      points,
      ref_price: ref,
      published_at: publishedAt.toISOString(),
      target_price: num(row.target_price),
      invalidation_price: num(row.invalidation_price),
      ends_at: end.toISOString(),
    };
  }

  /** POST /api/ideas — yayınla (referans fiyat yakalanır) */
  static async create(userId: string, input: CreateIdeaInput, now: Date = new Date()): Promise<IdeaDetailDto> {
    await assertVerifiedUser(userId);
    const symbol = input.symbol.trim().toUpperCase();
    const rationale = clean(input.rationale);
    const scenario = clean(input.scenario);
    const risks = clean(input.risks);
    checkLen('Gerekçe', rationale, IDEA_TEXT.rationale.min, IDEA_TEXT.rationale.max);
    checkLen('Beklenen senaryo', scenario, IDEA_TEXT.scenario.min, IDEA_TEXT.scenario.max);
    checkLen('Riskler', risks, IDEA_TEXT.risks.min, IDEA_TEXT.risks.max);
    const cases = {
      bull: cleanOrNull(input.scenario_bull),
      base: cleanOrNull(input.scenario_base),
      bear: cleanOrNull(input.scenario_bear),
    };
    for (const [label, v] of [
      ['İyimser senaryo', cases.bull],
      ['Temel senaryo', cases.base],
      ['Kötümser senaryo', cases.bear],
    ] as const) {
      if (v) checkLen(label, v, 1, IDEA_TEXT.scenarioCase.max);
    }
    const { tags, error: tagError } = normalizeTags(input.tags ?? []);
    if (tagError) throw err(400, tagError, 'VALIDATION_ERROR');

    const target = input.target_price ?? null;
    const invalidation = input.invalidation_price ?? null;
    const reviewDate = input.review_date ?? null;
    if (target === null && invalidation === null && !reviewDate) {
      throw err(400, 'İzleme kriteri olarak hedef seviye, geçersizlik seviyesi ya da değerlendirme tarihinden en az birini gir', 'MONITOR_REQUIRED');
    }
    if (reviewDate) {
      const msg = validateReviewDate(reviewDate, now, REVIEW_DATE_MAX_DAYS);
      if (msg) throw err(400, msg, 'VALIDATION_ERROR');
    }

    let leagueId: string | null = null;
    if (input.scope === 'league') {
      if (!input.league_id) throw err(400, 'Lig kapsamı için bir lig seç', 'VALIDATION_ERROR');
      const m = await pool.query(`SELECT 1 FROM league_members WHERE league_id = $1 AND user_id = $2`, [input.league_id, userId]);
      if (m.rows.length === 0) throw err(403, 'Yalnızca üyesi olduğun bir lige özel öneri paylaşabilirsin', 'LEAGUE_MEMBERSHIP_REQUIRED');
      leagueId = input.league_id;
    }

    const quote = await captureQuote({ asset_type: input.asset_type, symbol });
    if (!quote) throw err(400, 'Bu varlık için şu an güncel fiyat yok; başka bir varlık seç', 'ASSET_UNAVAILABLE');
    const levelError = validateLevels(input.stance, quote.price, target, invalidation);
    if (levelError) throw err(400, levelError, 'INVALID_LEVELS', { ref_price: quote.price, quote_currency: quote.quote_currency });

    const id = await withTx(null, async (c) => {
      await c.query(`SELECT pg_advisory_xact_lock(4224, hashtext($1))`, [userId]);
      const today = await c.query(`SELECT COUNT(*)::int AS n FROM ideas WHERE user_id = $1 AND published_at >= $2`, [
        userId,
        istanbulDayStart(now).toISOString(),
      ]);
      if (Number(today.rows[0]?.n ?? 0) >= IDEA_LIMITS.ideasPerDay) {
        throw dailyLimitError('IDEA_DAILY_LIMIT', `Bugün en fazla ${IDEA_LIMITS.ideasPerDay} öneri paylaşabilirsin`, IDEA_LIMITS.ideasPerDay, now);
      }
      const ins = await c.query(
        `INSERT INTO ideas (user_id, asset_type, symbol, name, stance, horizon, rationale, scenario, scenario_bull, scenario_base,
                            scenario_bear, risks, target_price, invalidation_price, review_date, tags, scope, league_id,
                            ref_price, quote_currency, ref_price_at, published_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::date, $16::varchar[], $17, $18, $19, $20, $21, $22, $22)
         RETURNING id`,
        [
          userId,
          input.asset_type,
          symbol,
          quote.name,
          input.stance,
          input.horizon,
          rationale,
          scenario,
          cases.bull,
          cases.base,
          cases.bear,
          risks,
          target,
          invalidation,
          reviewDate,
          tags,
          input.scope,
          leagueId,
          quote.price,
          quote.quote_currency,
          quote.as_of.toISOString(),
          now.toISOString(),
        ]
      );
      return ins.rows[0].id as string;
    });
    return IdeasService.detail(id, userId, now);
  }

  /** POST /api/ideas/:id/updates — yazarın izleme notu (yalnızca açık öneri) */
  static async addUpdate(userId: string, ideaId: string, rawText: string, now: Date = new Date()): Promise<IdeaUpdateDto> {
    const text = clean(rawText);
    checkLen('İzleme notu', text, IDEA_TEXT.update.min, IDEA_TEXT.update.max);
    const row = await loadVisibleIdea(ideaId, userId);
    if (row.user_id !== userId) throw err(403, 'İzleme notunu yalnızca önerinin yazarı ekleyebilir', 'NOT_AUTHOR');
    if (row.hidden_at) throw err(409, 'Bu öneri yönetici tarafından gizlendi', 'IDEA_HIDDEN');
    if (row.status !== 'acik') throw err(409, 'Kapanan öneriye izleme notu eklenemez', 'IDEA_CLOSED');
    const q = (await liveQuotes([{ asset_type: row.asset_type, symbol: row.symbol }])).get(quoteKey(row.asset_type, row.symbol));
    const price = q && q.quote_currency === row.quote_currency ? q.price : null;
    const ins = await withTx(null, async (c) => {
      await c.query(`SELECT pg_advisory_xact_lock(4225, hashtext($1))`, [userId]);
      if ((await countToday(c, 'idea_updates', 'user_id', userId, now, `AND kind = 'note'`)) >= IDEA_LIMITS.updatesPerDay) {
        throw dailyLimitError('UPDATE_DAILY_LIMIT', `Bugün en fazla ${IDEA_LIMITS.updatesPerDay} izleme notu ekleyebilirsin`, IDEA_LIMITS.updatesPerDay, now);
      }
      const r = await c.query(
        `INSERT INTO idea_updates (idea_id, user_id, kind, text, price, created_at) VALUES ($1, $2, 'note', $3, $4, $5)
         RETURNING id, kind, text, price, created_at, hidden_at`,
        [ideaId, userId, text, price, now.toISOString()]
      );
      await c.query(`UPDATE ideas SET updated_at = $2 WHERE id = $1`, [ideaId, now.toISOString()]);
      return r.rows[0];
    });
    return updateDto(ins, true)!;
  }

  /** POST /api/ideas/:id/close — zorunlu değerlendirme + sonuç etiketi; fiyat dondurulur */
  static async close(userId: string, ideaId: string, input: CloseIdeaInput, now: Date = new Date()): Promise<IdeaDetailDto> {
    const evaluation = clean(input.evaluation);
    checkLen('Değerlendirme', evaluation, IDEA_TEXT.evaluation.min, IDEA_TEXT.evaluation.max);
    const lessons = cleanOrNull(input.lessons);
    if (lessons) checkLen('Çıkarılan dersler', lessons, 1, IDEA_TEXT.lessons.max);
    const row = await loadVisibleIdea(ideaId, userId);
    if (row.user_id !== userId) throw err(403, 'Öneriyi yalnızca yazarı kapatabilir', 'NOT_AUTHOR');
    if (row.hidden_at) throw err(409, 'Bu öneri yönetici tarafından gizlendi', 'IDEA_HIDDEN');
    if (row.status !== 'acik') throw err(409, 'Öneri zaten kapandı', 'IDEA_CLOSED');

    const q = (await fetchQuotes([{ asset_type: row.asset_type, symbol: row.symbol }], IDEA_PRICES.displayMaxAgeMs)).get(quoteKey(row.asset_type, row.symbol));
    const closePrice = q && q.quote_currency === row.quote_currency ? q.price : null;
    const perf = ideaPerformance(row.stance, row.ref_price, closePrice);

    const bookmarkers = await withTx(null, async (c) => {
      const upd = await c.query(
        `UPDATE ideas SET status = 'kapandi', closed_at = $2, close_price = $3, close_price_at = $4, outcome = $5, evaluation = $6,
                          lessons = $7, updated_at = $2
          WHERE id = $1 AND status = 'acik' AND user_id = $8
          RETURNING id`,
        [ideaId, now.toISOString(), closePrice, closePrice !== null && q ? q.as_of.toISOString() : null, input.outcome, evaluation, lessons, userId]
      );
      if (upd.rows.length === 0) throw err(409, 'Öneri zaten kapandı', 'IDEA_CLOSED');
      await c.query(
        `INSERT INTO idea_updates (idea_id, user_id, kind, text, price, created_at) VALUES ($1, NULL, 'closed', $2, $3, $4)`,
        [
          ideaId,
          `Öneri kapandı — sonuç: ${OUTCOME_LABELS[input.outcome]}${perf.change_pct !== null ? ` · yayından bu yana değişim ${fmtPct(perf.change_pct)}` : ''}`,
          closePrice,
          now.toISOString(),
        ]
      );
      const b = await c.query(
        `SELECT b.user_id FROM idea_bookmarks b JOIN users u ON u.id = b.user_id WHERE b.idea_id = $1 AND b.user_id <> $2 AND ${HUMAN('u')}`,
        [ideaId, userId]
      );
      return b.rows.map((x: any) => String(x.user_id));
    });

    if (bookmarkers.length > 0 && row.hidden_at === null) {
      // Lig önerisinde yalnızca hâlâ görebilenler (ayrılan üyeler bildirim almaz)
      let recipients = bookmarkers;
      if (row.scope === 'league') {
        const m = await pool.query(`SELECT user_id FROM league_members WHERE league_id = $1 AND user_id = ANY($2::uuid[])`, [row.league_id, bookmarkers]);
        recipients = m.rows.map((x: any) => String(x.user_id));
      }
      await NotificationService.notify(recipients, {
        type: IDEA_NOTIFICATION_TYPES.closed,
        category: IDEA_NOTIFICATION_CATEGORY,
        title: `İzlediğin ${row.symbol} önerisi kapandı — ${OUTCOME_LABELS[input.outcome]}`,
        body: `${row.username} değerlendirmesini paylaştı. Beklenen senaryo ile gerçekleşeni karşılaştırabilirsin.`,
        link: ideaLink(ideaId),
        data: { idea_id: ideaId, symbol: row.symbol, outcome: input.outcome },
      });
    }
    return IdeasService.detail(ideaId, userId, now);
  }

  // -------------------------------------------------------------------------
  // Topluluk: yanıtlar, yorumlar, izleme listesi, şikâyet
  // -------------------------------------------------------------------------

  /** PUT /api/ideas/:id/response — kullanıcı başına bir yanıt (düzenlenebilir); yalnızca açık önerilere */
  static async upsertResponse(userId: string, ideaId: string, stance: ResponseStance, rawReason: string, now: Date = new Date()): Promise<IdeaResponseDto> {
    const reason = cleanText(String(rawReason ?? ''), true);
    checkLen('Gerekçe', reason, IDEA_TEXT.responseReason.min, IDEA_TEXT.responseReason.max);
    const username = await assertVerifiedUser(userId);
    const row = await loadVisibleIdea(ideaId, userId);
    if (row.user_id === userId) throw err(403, 'Kendi önerine yanıt veremezsin; izleme notu ekleyebilirsin', 'OWN_IDEA');
    if (row.hidden_at) throw err(409, 'Bu öneri yönetici tarafından gizlendi', 'IDEA_HIDDEN');
    if (row.status !== 'acik') throw err(409, 'Kapanan öneriye yanıt verilemez', 'IDEA_CLOSED');

    const saved = await withTx(null, async (c) => {
      const r = await c.query(
        `INSERT INTO idea_responses (idea_id, user_id, stance, reason, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)
         ON CONFLICT (idea_id, user_id) DO UPDATE SET stance = EXCLUDED.stance, reason = EXCLUDED.reason,
           updated_at = CASE WHEN idea_responses.stance IS DISTINCT FROM EXCLUDED.stance OR idea_responses.reason IS DISTINCT FROM EXCLUDED.reason
                             THEN EXCLUDED.updated_at ELSE idea_responses.updated_at END
         RETURNING id, user_id, stance, reason, created_at, updated_at, hidden_at, (xmax = 0) AS inserted`,
        [ideaId, userId, stance, reason, now.toISOString()]
      );
      const out = r.rows[0];
      if (out.inserted) await noteActivity(c, ideaId, userId, username, 'response', stance === 'katiliyorum' ? 'Katılıyorum' : 'Katılmıyorum', now);
      return out;
    });
    const u = await pool.query(`SELECT username, avatar_id FROM users WHERE id = $1`, [userId]);
    return responseDto({ ...saved, username: u.rows[0]?.username ?? username, avatar_id: u.rows[0]?.avatar_id }, userId);
  }

  /** DELETE /api/ideas/:id/response */
  static async deleteResponse(userId: string, ideaId: string): Promise<{ deleted: boolean }> {
    await loadVisibleIdea(ideaId, userId);
    const r = await pool.query(`DELETE FROM idea_responses WHERE idea_id = $1 AND user_id = $2 RETURNING id`, [ideaId, userId]);
    return { deleted: r.rows.length > 0 };
  }

  /** GET /api/ideas/:id/comments — en yeni önce; before = yorum ID'si */
  static async listComments(ideaId: string, viewerId: string | undefined, limit: number, before?: string): Promise<{ items: IdeaCommentDto[]; has_more: boolean }> {
    const idea = await loadVisibleIdea(ideaId, viewerId);
    const params: unknown[] = [ideaId];
    let cursor = '';
    if (before && UUID_RE.test(before)) {
      params.push(before);
      cursor = `AND (c.created_at, c.id) < (SELECT created_at, id FROM idea_comments WHERE id = $${params.length})`;
    }
    params.push(limit + 1);
    const r = await pool.query(
      `SELECT c.id, c.user_id, c.text, c.created_at, u.username, u.avatar_id
         FROM idea_comments c JOIN users u ON u.id = c.user_id
        WHERE c.idea_id = $1 AND c.deleted_at IS NULL AND ${HUMAN('u')} ${cursor}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT $${params.length}`,
      params
    );
    return {
      items: r.rows.slice(0, limit).map((row: any) => ({
        id: row.id,
        username: row.username,
        avatar_id: row.avatar_id ?? DEFAULT_AVATAR,
        text: row.text,
        created_at: iso(row.created_at)!,
        is_me: viewerId !== undefined && row.user_id === viewerId,
        is_author: row.user_id === idea.user_id,
      })),
      has_more: r.rows.length > limit,
    };
  }

  /** POST /api/ideas/:id/comments — 15 sn'de bir, İstanbul günü başına 30 */
  static async postComment(userId: string, ideaId: string, rawText: string, now: Date = new Date()): Promise<IdeaCommentDto> {
    const text = clean(rawText);
    checkLen('Yorum', text, IDEA_TEXT.comment.min, IDEA_TEXT.comment.max);
    const username = await assertVerifiedUser(userId);
    const idea = await loadVisibleIdea(ideaId, userId);
    if (idea.hidden_at) throw err(409, 'Bu öneri yönetici tarafından gizlendi', 'IDEA_HIDDEN');

    const row = await withTx(null, async (c) => {
      await c.query(`SELECT pg_advisory_xact_lock(4226, hashtext($1))`, [userId]);
      const last = await c.query(`SELECT created_at FROM idea_comments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [userId]);
      const lastAt = last.rows[0]?.created_at ? new Date(last.rows[0].created_at).getTime() : null;
      if (lastAt !== null && now.getTime() - lastAt < IDEA_LIMITS.commentCooldownMs && now.getTime() >= lastAt) {
        const retry = Math.max(1, Math.ceil((lastAt + IDEA_LIMITS.commentCooldownMs - now.getTime()) / 1000));
        throw err(429, `Çok hızlı yorum yapıyorsun; ${retry} sn sonra tekrar dene`, 'RATE_LIMITED', { retry_after: retry });
      }
      if ((await countToday(c, 'idea_comments', 'user_id', userId, now)) >= IDEA_LIMITS.commentsPerDay) {
        throw dailyLimitError('COMMENT_DAILY_LIMIT', `Bugün en fazla ${IDEA_LIMITS.commentsPerDay} yorum yazabilirsin`, IDEA_LIMITS.commentsPerDay, now);
      }
      const ins = await c.query(
        `INSERT INTO idea_comments (idea_id, user_id, text, created_at) VALUES ($1, $2, $3, $4) RETURNING id, text, created_at`,
        [ideaId, userId, text, now.toISOString()]
      );
      await noteActivity(c, ideaId, userId, username, 'comment', null, now);
      return ins.rows[0];
    });
    const u = await pool.query(`SELECT avatar_id FROM users WHERE id = $1`, [userId]);
    return {
      id: row.id,
      username,
      avatar_id: u.rows[0]?.avatar_id ?? DEFAULT_AVATAR,
      text: row.text,
      created_at: iso(row.created_at)!,
      is_me: true,
      is_author: idea.user_id === userId,
    };
  }

  /** DELETE /api/ideas/comments/:id — yalnızca yazarı (yumuşak silme) */
  static async deleteOwnComment(userId: string, commentId: string): Promise<{ id: string; deleted: true }> {
    const r = await pool.query(`SELECT user_id FROM idea_comments WHERE id = $1 AND deleted_at IS NULL`, [commentId]);
    const row = r.rows[0];
    if (!row) throw err(404, 'Yorum bulunamadı', 'COMMENT_NOT_FOUND');
    if (row.user_id !== userId) throw err(403, 'Yalnızca kendi yorumunu silebilirsin', 'FORBIDDEN');
    await pool.query(`UPDATE idea_comments SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL`, [commentId, userId]);
    return { id: commentId, deleted: true };
  }

  /** PUT / DELETE /api/ideas/:id/bookmark — "İzlemeye al" */
  static async setBookmark(userId: string, ideaId: string, on: boolean): Promise<{ bookmarked: boolean }> {
    await loadVisibleIdea(ideaId, userId);
    if (on) {
      await pool.query(`INSERT INTO idea_bookmarks (user_id, idea_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, ideaId]);
    } else {
      await pool.query(`DELETE FROM idea_bookmarks WHERE user_id = $1 AND idea_id = $2`, [userId, ideaId]);
    }
    return { bookmarked: on };
  }

  /** POST /api/ideas/reports — hedef görünür olmalı; kendi içeriğini şikâyet edemez; kullanıcı + hedef başına bir */
  static async report(
    userId: string,
    input: { target_type: ReportTarget; target_id: string; reason: ReportReason; note?: string | null },
    now: Date = new Date()
  ): Promise<{ id: string | null; already_reported: boolean }> {
    if (!UUID_RE.test(input.target_id)) throw err(404, 'Şikâyet edilen içerik bulunamadı', 'TARGET_NOT_FOUND');
    let ideaId: string;
    let ownerId: string;
    if (input.target_type === 'idea') {
      ideaId = input.target_id;
      ownerId = (await loadVisibleIdea(ideaId, userId)).user_id;
    } else {
      const table = input.target_type === 'response' ? 'idea_responses' : input.target_type === 'comment' ? 'idea_comments' : 'idea_updates';
      const t = await pool.query(`SELECT idea_id, user_id FROM ${table} WHERE id = $1`, [input.target_id]);
      if (!t.rows[0]) throw err(404, 'Şikâyet edilen içerik bulunamadı', 'TARGET_NOT_FOUND');
      ideaId = t.rows[0].idea_id;
      const idea = await loadVisibleIdea(ideaId, userId);
      ownerId = t.rows[0].user_id ?? idea.user_id;
    }
    if (ownerId === userId) throw err(400, 'Kendi içeriğini şikâyet edemezsin', 'OWN_CONTENT');
    const note = input.note ? cleanText(input.note, false).slice(0, IDEA_TEXT.reportNote.max) || null : null;
    return withTx(null, async (c) => {
      await c.query(`SELECT pg_advisory_xact_lock(4227, hashtext($1))`, [userId]);
      if ((await countToday(c, 'idea_reports', 'reporter_id', userId, now)) >= IDEA_LIMITS.reportsPerDay) {
        throw dailyLimitError('REPORT_DAILY_LIMIT', `Bugün en fazla ${IDEA_LIMITS.reportsPerDay} şikâyet gönderebilirsin`, IDEA_LIMITS.reportsPerDay, now);
      }
      const r = await c.query(
        `INSERT INTO idea_reports (reporter_id, idea_id, target_type, target_id, reason, note, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING
         RETURNING id`,
        [userId, ideaId, input.target_type, input.target_id, input.reason, note, now.toISOString()]
      );
      return { id: r.rows[0]?.id ?? null, already_reported: r.rows.length === 0 };
    });
  }

  /** Yazarın sakin başarı kaydı (gizlenmemiş öneriler) — herkese açık profil de kullanır */
  static trackRecord(userId: string): Promise<TrackRecord> {
    return trackRecordOf(userId);
  }

  // -------------------------------------------------------------------------
  // İş: 'idea-reviews'
  // -------------------------------------------------------------------------

  /**
   * Günlük iş (idempotent; her olay bir kez):
   *  1) değerlendirme tarihi gelen açık öneriler → yazara 'ideas.review_due' + zaman çizelgesi olayı
   *  2) hedef / geçersizlik seviyesi yayından bu yana aşıldıysa (fiyat geçmişi en yüksek/en düşük + güncel fiyat)
   *     → 'ideas.level_crossed' + zaman çizelgesi olayı
   *  3) bekleme süresi dolmuş toplu yanıt / yorum bildirimleri
   */
  static async reviewJob(now: Date = new Date()): Promise<ReviewJobResult> {
    const result: ReviewJobResult = { review_due: 0, target_hit: 0, invalidation_hit: 0, activity_flushed: 0 };
    const human = HUMAN('u');

    // 1) Değerlendirme tarihi
    const due = await pool.query(
      `SELECT i.id FROM ideas i JOIN users u ON u.id = i.user_id
        WHERE i.status = 'acik' AND i.hidden_at IS NULL AND i.review_notified_at IS NULL
          AND i.review_date IS NOT NULL AND i.review_date <= $1::date AND ${human}
        ORDER BY i.review_date ASC LIMIT 500`,
      [istanbulDay(now)]
    );
    for (const { id } of due.rows) {
      const sent = await withTx(null, async (c) => {
        const r = await c.query(
          `UPDATE ideas SET review_notified_at = $2 WHERE id = $1 AND review_notified_at IS NULL AND status = 'acik'
           RETURNING user_id, symbol, stance, review_date::text AS review_date`,
          [id, now.toISOString()]
        );
        const x = r.rows[0];
        if (!x) return false;
        await c.query(`INSERT INTO idea_updates (idea_id, user_id, kind, text, created_at) VALUES ($1, NULL, 'review_due', $2, $3)`, [
          id,
          `Değerlendirme tarihi geldi (${x.review_date}). Senaryonu gerçekleşenle karşılaştırıp öneriyi kapatabilir ya da izleme notu ekleyebilirsin.`,
          now.toISOString(),
        ]);
        await NotificationService.notify(
          x.user_id,
          {
            type: IDEA_NOTIFICATION_TYPES.reviewDue,
            category: IDEA_NOTIFICATION_CATEGORY,
            title: `${x.symbol} önerinin değerlendirme tarihi geldi`,
            body: 'Beklediğin senaryo ile gerçekleşeni karşılaştır: öneriyi değerlendirmeyle kapat ya da izleme notu ekle.',
            link: ideaLink(id),
            data: { idea_id: id, symbol: x.symbol, review_date: x.review_date },
          },
          c
        );
        return true;
      });
      if (sent) result.review_due += 1;
    }

    // 2) Seviye aşımları
    const lv = await pool.query(
      `SELECT i.id, i.user_id, i.asset_type, i.symbol, i.stance, i.quote_currency, i.ref_price, i.published_at,
              i.target_price, i.invalidation_price, i.target_hit_at, i.invalidation_hit_at
         FROM ideas i JOIN users u ON u.id = i.user_id
        WHERE i.status = 'acik' AND i.hidden_at IS NULL AND ${human}
          AND ((i.target_price IS NOT NULL AND i.target_hit_at IS NULL) OR (i.invalidation_price IS NOT NULL AND i.invalidation_hit_at IS NULL))
        ORDER BY i.published_at ASC LIMIT 2000`
    );
    if (lv.rows.length > 0) {
      const quotes = await fetchQuotes(
        lv.rows.map((r: any) => ({ asset_type: r.asset_type, symbol: r.symbol })),
        IDEA_PRICES.displayMaxAgeMs
      );
      for (const r of lv.rows) {
        try {
          const q = quotes.get(quoteKey(r.asset_type, r.symbol));
          const live = q && q.quote_currency === r.quote_currency ? q.price : null;
          const hl = await highLowSince({ asset_type: r.asset_type, symbol: r.symbol, quote_currency: r.quote_currency }, new Date(r.published_at));
          const high = [hl.high, live].filter((v): v is number => v !== null).reduce<number | null>((a, b) => (a === null ? b : Math.max(a, b)), null);
          const low = [hl.low, live].filter((v): v is number => v !== null).reduce<number | null>((a, b) => (a === null ? b : Math.min(a, b)), null);
          for (const level of ['target', 'invalidation'] as const) {
            const price = level === 'target' ? r.target_price : r.invalidation_price;
            const hitAt = level === 'target' ? r.target_hit_at : r.invalidation_hit_at;
            if (price === null || hitAt !== null || !levelCrossed(price, r.ref_price, high, low)) continue;
            const sent = await IdeasService.markLevelCrossed(r, level, live, now);
            if (sent) result[level === 'target' ? 'target_hit' : 'invalidation_hit'] += 1;
          }
        } catch (e: any) {
          logger.error({ err: e, ideaId: r.id }, `[ideas] seviye kontrolü başarısız (${r.id}): ${e?.message || e}`);
        }
      }
    }

    // 3) Bekleyen toplu etkileşim bildirimleri
    const pend = await pool.query(
      `SELECT id FROM ideas
        WHERE (activity_pending_responses > 0 OR activity_pending_comments > 0)
          AND (activity_notified_at IS NULL OR activity_notified_at <= $1)
        LIMIT 1000`,
      [new Date(now.getTime() - ACTIVITY_COOLDOWN_MS).toISOString()]
    );
    for (const { id } of pend.rows) {
      const sent = await withTx(null, async (c) => {
        const r = await c.query(
          `SELECT i.user_id, i.symbol, i.activity_pending_responses AS pr, i.activity_pending_comments AS pc, i.activity_notified_at
             FROM ideas i WHERE i.id = $1 FOR UPDATE`,
          [id]
        );
        const x = r.rows[0];
        if (!x || (Number(x.pr) === 0 && Number(x.pc) === 0)) return false;
        if (x.activity_notified_at && now.getTime() - new Date(x.activity_notified_at).getTime() < ACTIVITY_COOLDOWN_MS) return false;
        const parts = [Number(x.pr) > 0 ? `${x.pr} yanıt` : null, Number(x.pc) > 0 ? `${x.pc} yorum` : null].filter(Boolean).join(', ');
        await NotificationService.notify(
          x.user_id,
          {
            type: IDEA_NOTIFICATION_TYPES.activity,
            category: IDEA_NOTIFICATION_CATEGORY,
            title: `${x.symbol} önerinde yeni etkileşimler`,
            body: `Son bildirimden bu yana ${parts} geldi.`,
            link: ideaLink(id),
            data: { idea_id: id, symbol: x.symbol, responses: Number(x.pr), comments: Number(x.pc) },
          },
          c
        );
        await c.query(`UPDATE ideas SET activity_notified_at = $2, activity_pending_responses = 0, activity_pending_comments = 0 WHERE id = $1`, [
          id,
          now.toISOString(),
        ]);
        return true;
      });
      if (sent) result.activity_flushed += 1;
    }
    return result;
  }

  /** Seviye aşımı: bayrak (bir kez) + zaman çizelgesi olayı + yazara bildirim */
  private static async markLevelCrossed(r: any, level: 'target' | 'invalidation', live: number | null, now: Date): Promise<boolean> {
    const col = level === 'target' ? 'target_hit_at' : 'invalidation_hit_at';
    return withTx(null, async (c) => {
      const u = await c.query(`UPDATE ideas SET ${col} = $2 WHERE id = $1 AND ${col} IS NULL AND status = 'acik' RETURNING id`, [r.id, now.toISOString()]);
      if (u.rows.length === 0) return false;
      const lvl = num(level === 'target' ? r.target_price : r.invalidation_price);
      const ccy = r.quote_currency as QuoteCurrency;
      const label = level === 'target' ? 'Hedef seviye' : 'Geçersizlik seviyesi';
      const text = `${label} (${fmtPrice(lvl, ccy)}) yayından bu yana görüldü${live !== null ? `; güncel fiyat ${fmtPrice(live, ccy)}` : ''}.`;
      await c.query(`INSERT INTO idea_updates (idea_id, user_id, kind, text, price, created_at) VALUES ($1, NULL, $2, $3, $4, $5)`, [
        r.id,
        level === 'target' ? 'target_hit' : 'invalidation_hit',
        text,
        live,
        now.toISOString(),
      ]);
      await NotificationService.notify(
        r.user_id,
        {
          type: IDEA_NOTIFICATION_TYPES.levelCrossed,
          category: IDEA_NOTIFICATION_CATEGORY,
          title:
            level === 'target'
              ? `${r.symbol} önerinde hedef seviyeye ulaşıldı`
              : `${r.symbol} önerinde geçersizlik seviyesi görüldü`,
          body: `${text} ${STANCE_LABELS[r.stance as IdeaStance]} önerini izleme notuyla güncelleyebilir ya da değerlendirmeyle kapatabilirsin.`,
          link: ideaLink(r.id),
          data: { idea_id: r.id, symbol: r.symbol, level, level_price: lvl, price: live },
        },
        c
      );
      return true;
    });
  }

  static async job(): Promise<ReviewJobResult> {
    const r = await IdeasService.reviewJob();
    if ((r.review_due || r.target_hit || r.invalidation_hit || r.activity_flushed) && process.env.NODE_ENV !== 'test') {
      logger.info(r, `[ideas] değerlendirme: ${r.review_due} tarih, ${r.target_hit} hedef, ${r.invalidation_hit} geçersizlik, ${r.activity_flushed} toplu bildirim`);
    }
    return r;
  }

  // -------------------------------------------------------------------------
  // Yönetici
  // -------------------------------------------------------------------------

  static async adminSummary(now: Date = new Date()) {
    const r = await pool.query(
      `SELECT (SELECT COUNT(*)::int FROM idea_reports WHERE status = 'acik') AS open_reports,
              (SELECT COUNT(*)::int FROM ideas) AS ideas_total,
              (SELECT COUNT(*)::int FROM ideas WHERE status = 'acik') AS ideas_open,
              (SELECT COUNT(*)::int FROM ideas WHERE hidden_at IS NOT NULL) AS ideas_hidden,
              (SELECT COUNT(*)::int FROM ideas WHERE published_at >= $1) AS ideas_today,
              (SELECT COUNT(*)::int FROM idea_comments WHERE created_at >= $1) AS comments_today`,
      [istanbulDayStart(now).toISOString()]
    );
    const x = r.rows[0] ?? {};
    return {
      open_reports: Number(x.open_reports ?? 0),
      ideas_total: Number(x.ideas_total ?? 0),
      ideas_open: Number(x.ideas_open ?? 0),
      ideas_hidden: Number(x.ideas_hidden ?? 0),
      ideas_today: Number(x.ideas_today ?? 0),
      comments_today: Number(x.comments_today ?? 0),
    };
  }

  static async adminReports(status: ReportStatus | 'all', limit: number, offset: number) {
    const where = status === 'all' ? '' : `WHERE r.status = $3`;
    const params: unknown[] = [limit, offset];
    if (status !== 'all') params.push(status);
    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT r.id, r.idea_id, r.target_type, r.target_id, r.reason, r.note, r.status, r.created_at, r.resolved_at,
                ru.username AS reporter_username, rb.username AS resolved_by_username,
                i.symbol, i.stance, i.hidden_at AS idea_hidden_at, iu.username AS idea_author,
                CASE r.target_type WHEN 'idea' THEN LEFT(i.rationale, 400) WHEN 'response' THEN rs.reason
                     WHEN 'comment' THEN cm.text WHEN 'update' THEN up.text END AS target_text,
                CASE r.target_type WHEN 'idea' THEN iu.username WHEN 'response' THEN rsu.username
                     WHEN 'comment' THEN cmu.username WHEN 'update' THEN iu.username END AS target_author,
                CASE r.target_type WHEN 'idea' THEN i.hidden_at IS NOT NULL WHEN 'response' THEN rs.hidden_at IS NOT NULL
                     WHEN 'comment' THEN cm.deleted_at IS NOT NULL WHEN 'update' THEN up.hidden_at IS NOT NULL END AS target_hidden,
                CASE r.target_type WHEN 'idea' THEN i.id IS NOT NULL WHEN 'response' THEN rs.id IS NOT NULL
                     WHEN 'comment' THEN cm.id IS NOT NULL WHEN 'update' THEN up.id IS NOT NULL END AS target_exists,
                (SELECT COUNT(*)::int FROM idea_reports r2 WHERE r2.target_type = r.target_type AND r2.target_id = r.target_id) AS reports_on_target
           FROM idea_reports r
           JOIN users ru ON ru.id = r.reporter_id
           LEFT JOIN users rb ON rb.id = r.resolved_by
           LEFT JOIN ideas i ON i.id = r.idea_id
           LEFT JOIN users iu ON iu.id = i.user_id
           LEFT JOIN idea_responses rs ON r.target_type = 'response' AND rs.id = r.target_id
           LEFT JOIN users rsu ON rsu.id = rs.user_id
           LEFT JOIN idea_comments cm ON r.target_type = 'comment' AND cm.id = r.target_id
           LEFT JOIN users cmu ON cmu.id = cm.user_id
           LEFT JOIN idea_updates up ON r.target_type = 'update' AND up.id = r.target_id
           ${where}
          ORDER BY (r.status = 'acik') DESC, r.created_at DESC, r.id DESC
          LIMIT $1 OFFSET $2`,
        params
      ),
      pool.query(`SELECT COUNT(*)::int AS n FROM idea_reports r ${status === 'all' ? '' : 'WHERE r.status = $1'}`, status === 'all' ? [] : [status]),
    ]);
    return {
      items: rows.rows.map((x: any) => ({
        id: x.id,
        idea_id: x.idea_id ?? null,
        target_type: x.target_type,
        target_id: x.target_id,
        reason: x.reason,
        note: x.note ?? null,
        status: x.status,
        created_at: iso(x.created_at),
        resolved_at: iso(x.resolved_at),
        reporter_username: x.reporter_username,
        resolved_by_username: x.resolved_by_username ?? null,
        idea: x.symbol ? { symbol: x.symbol, stance: x.stance, author: x.idea_author, hidden: x.idea_hidden_at !== null } : null,
        target: { exists: x.target_exists === true, text: x.target_text ?? null, author: x.target_author ?? null, hidden: x.target_hidden === true },
        reports_on_target: Number(x.reports_on_target ?? 1),
      })),
      total: Number(total.rows[0]?.n ?? 0),
      limit,
      offset,
    };
  }

  static async adminResolveReport(adminId: string, reportId: string, status: 'islendi' | 'reddedildi') {
    const r = await pool.query(
      `UPDATE idea_reports SET status = $2, resolved_at = now(), resolved_by = $3 WHERE id = $1
       RETURNING id, target_type, target_id, idea_id, reason`,
      [reportId, status, adminId]
    );
    if (!r.rows[0]) throw err(404, 'Şikâyet bulunamadı', 'REPORT_NOT_FOUND');
    return r.rows[0] as { id: string; target_type: ReportTarget; target_id: string; idea_id: string | null; reason: ReportReason };
  }

  static async adminIdeas(filter: 'all' | 'hidden' | 'reported', limit: number, offset: number, q?: string) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter === 'hidden') where.push('i.hidden_at IS NOT NULL');
    if (filter === 'reported') where.push(`EXISTS (SELECT 1 FROM idea_reports r WHERE r.idea_id = i.id AND r.status = 'acik')`);
    if (q) {
      params.push(`%${q.trim().toUpperCase().replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
      where.push(`(i.symbol LIKE $${params.length} OR UPPER(u.username) LIKE $${params.length})`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT i.id, i.asset_type, i.symbol, i.stance, i.horizon, i.status, i.scope, i.published_at, i.closed_at, i.outcome,
                i.hidden_at, i.hidden_reason, LEFT(i.rationale, 300) AS rationale_head, u.username, hb.username AS hidden_by_username,
                l.name AS league_name,
                (SELECT COUNT(*)::int FROM idea_responses r WHERE r.idea_id = i.id) AS responses,
                (SELECT COUNT(*)::int FROM idea_comments c WHERE c.idea_id = i.id AND c.deleted_at IS NULL) AS comments,
                (SELECT COUNT(*)::int FROM idea_reports r WHERE r.idea_id = i.id AND r.status = 'acik') AS open_reports
           FROM ideas i JOIN users u ON u.id = i.user_id
           LEFT JOIN users hb ON hb.id = i.hidden_by
           LEFT JOIN leagues l ON l.id = i.league_id
           ${w}
          ORDER BY i.published_at DESC, i.id DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS n FROM ideas i JOIN users u ON u.id = i.user_id ${w}`, params),
    ]);
    return {
      items: rows.rows.map((x: any) => ({
        id: x.id,
        asset_type: x.asset_type,
        symbol: x.symbol,
        stance: x.stance,
        horizon: x.horizon,
        status: x.status,
        scope: x.scope,
        league_name: x.league_name ?? null,
        username: x.username,
        rationale_excerpt: excerpt(x.rationale_head, 220),
        published_at: iso(x.published_at),
        closed_at: iso(x.closed_at),
        outcome: x.outcome ?? null,
        hidden: x.hidden_at !== null,
        hidden_at: iso(x.hidden_at),
        hidden_reason: x.hidden_reason ?? null,
        hidden_by_username: x.hidden_by_username ?? null,
        responses: Number(x.responses ?? 0),
        comments: Number(x.comments ?? 0),
        open_reports: Number(x.open_reports ?? 0),
      })),
      total: Number(total.rows[0]?.n ?? 0),
      limit,
      offset,
    };
  }

  static async adminComments(limit: number, offset: number) {
    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT c.id, c.idea_id, c.text, c.created_at, c.deleted_at, u.username, d.username AS deleted_by_username, i.symbol
           FROM idea_comments c JOIN users u ON u.id = c.user_id JOIN ideas i ON i.id = c.idea_id
           LEFT JOIN users d ON d.id = c.deleted_by
          ORDER BY c.created_at DESC, c.id DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query(`SELECT COUNT(*)::int AS n FROM idea_comments`),
    ]);
    return {
      items: rows.rows.map((x: any) => ({
        id: x.id,
        idea_id: x.idea_id,
        symbol: x.symbol,
        username: x.username,
        text: x.text,
        created_at: iso(x.created_at),
        deleted: x.deleted_at !== null,
        deleted_at: iso(x.deleted_at),
        deleted_by_username: x.deleted_by_username ?? null,
      })),
      total: Number(total.rows[0]?.n ?? 0),
      limit,
      offset,
    };
  }

  /**
   * Yönetici: öneri / yanıt / izleme notunu gizler ya da gösterir (yumuşak). Gizlemede hedefin açık şikâyetleri
   * 'islendi' olur. Denetim kaydı için hedef bilgisi döner.
   */
  static async adminSetHidden(
    adminId: string,
    targetType: 'idea' | 'response' | 'update',
    targetId: string,
    hidden: boolean,
    reason?: string | null
  ): Promise<{ id: string; idea_id: string; username: string; text: string; changed: boolean }> {
    const table = targetType === 'idea' ? 'ideas' : targetType === 'response' ? 'idea_responses' : 'idea_updates';
    return withTx(null, async (c) => {
      const cur = await c.query(
        targetType === 'idea'
          ? `SELECT t.id, t.id AS idea_id, t.hidden_at, u.username, t.symbol || ' · ' || LEFT(t.rationale, 160) AS text
               FROM ideas t JOIN users u ON u.id = t.user_id WHERE t.id = $1 FOR UPDATE OF t`
          : `SELECT t.id, t.idea_id, t.hidden_at, COALESCE(u.username, '(sistem)') AS username, ${targetType === 'response' ? 't.reason' : 't.text'} AS text
               FROM ${table} t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = $1 FOR UPDATE OF t`,
        [targetId]
      );
      const row = cur.rows[0];
      if (!row) throw err(404, 'İçerik bulunamadı', 'TARGET_NOT_FOUND');
      const isHidden = row.hidden_at !== null;
      let changed = false;
      if (hidden && !isHidden) {
        if (targetType === 'idea') {
          await c.query(`UPDATE ideas SET hidden_at = now(), hidden_by = $2, hidden_reason = $3 WHERE id = $1`, [
            targetId,
            adminId,
            reason ? reason.slice(0, IDEA_TEXT.hiddenReason.max) : null,
          ]);
        } else {
          await c.query(`UPDATE ${table} SET hidden_at = now(), hidden_by = $2 WHERE id = $1`, [targetId, adminId]);
        }
        changed = true;
      } else if (!hidden && isHidden) {
        await c.query(`UPDATE ${table} SET hidden_at = NULL, hidden_by = NULL${targetType === 'idea' ? ', hidden_reason = NULL' : ''} WHERE id = $1`, [targetId]);
        changed = true;
      }
      if (hidden) {
        await c.query(
          `UPDATE idea_reports SET status = 'islendi', resolved_at = now(), resolved_by = $3
            WHERE target_type = $1 AND target_id = $2 AND status = 'acik'`,
          [targetType, targetId, adminId]
        );
      }
      return { id: row.id, idea_id: row.idea_id, username: row.username, text: row.text ?? '', changed };
    });
  }

  /** Yönetici: yorumu kaldırır (yumuşak silme) + açık şikâyetleri 'islendi' yapar */
  static async adminDeleteComment(adminId: string, commentId: string) {
    return withTx(null, async (c) => {
      const r = await c.query(
        `SELECT c.id, c.idea_id, c.text, c.deleted_at, u.username FROM idea_comments c JOIN users u ON u.id = c.user_id WHERE c.id = $1 FOR UPDATE OF c`,
        [commentId]
      );
      const row = r.rows[0];
      if (!row) throw err(404, 'Yorum bulunamadı', 'COMMENT_NOT_FOUND');
      const already = row.deleted_at !== null;
      if (!already) await c.query(`UPDATE idea_comments SET deleted_at = now(), deleted_by = $2 WHERE id = $1`, [commentId, adminId]);
      await c.query(
        `UPDATE idea_reports SET status = 'islendi', resolved_at = now(), resolved_by = $2
          WHERE target_type = 'comment' AND target_id = $1 AND status = 'acik'`,
        [commentId, adminId]
      );
      return { id: row.id as string, idea_id: row.idea_id as string, username: row.username as string, text: row.text as string, already_deleted: already };
    });
  }
}
