// Ortak Akıl — Öneri Havuzu: API istemcisi, sözleşme normalleştiricileri, etiketler ve saf yardımcılar.
// Normalleştiriciler ve yardımcılar React / fetch içermez (birim testli: ideas.test.ts).

import { apiFetch, post } from '@portfoygo/shared/api';
import type { AssetType } from '@portfoygo/shared/types';
import type {
  CloseIdeaInput,
  CreateIdeaInput,
  IdeaAssetOption,
  IdeaCard,
  IdeaChart,
  IdeaComment,
  IdeaCommentPage,
  IdeaDetail,
  IdeaHorizon,
  IdeaListFilters,
  IdeaOutcome,
  IdeaPage,
  IdeaReportReason,
  IdeaReportTarget,
  IdeaResponse,
  IdeaResponseStance,
  IdeaStance,
  IdeaTrackRecord,
  IdeaUpdate,
  IdeaUpdateKind,
  IdeaView,
} from '@/types/ideas';

export const IDEAS_PATH = '/ortak-akil';
export const ideaHref = (id: string) => `${IDEAS_PATH}/${encodeURIComponent(id)}`;
export const compareHref = (ids: string[]) => `${IDEAS_PATH}/karsilastir?ids=${ids.map(encodeURIComponent).join(',')}`;

/** Her yüzeyde gösterilen sorumluluk notu */
export const IDEA_DISCLAIMER = 'Önerilerin kayıt altına alınması, tek başına yatırım tavsiyesi veya işlem onayı anlamına gelmez.';

// ---------------------------------------------------------------------------
// Etiketler ve sınırlar (backend/src/services/ideas/config.ts ile aynı)
// ---------------------------------------------------------------------------

export const STANCE_META: Record<IdeaStance, { label: string; hint: string; tone: 'up' | 'down' | 'brand' }> = {
  al: { label: 'Al', hint: 'Yükseliş beklentisi', tone: 'up' },
  sat: { label: 'Sat', hint: 'Düşüş beklentisi', tone: 'down' },
  izle: { label: 'İzle', hint: 'Yön belirtmeden izleme', tone: 'brand' },
};
export const STANCES: IdeaStance[] = ['al', 'sat', 'izle'];

export const HORIZON_LABELS: Record<IdeaHorizon, string> = { '1w': '1 hafta', '1m': '1 ay', '3m': '3 ay', '6m': '6 ay', '1y': '1 yıl' };
export const HORIZONS: IdeaHorizon[] = ['1w', '1m', '3m', '6m', '1y'];
const HORIZON_DAYS: Record<IdeaHorizon, number> = { '1w': 7, '1m': 30, '3m': 91, '6m': 182, '1y': 365 };

export const OUTCOME_META: Record<IdeaOutcome, { label: string; description: string; tone: 'up' | 'gold' | 'down' }> = {
  beklendigi_gibi: { label: 'Beklendiği gibi', description: 'Senaryo büyük ölçüde gerçekleşti', tone: 'up' },
  kismen: { label: 'Kısmen', description: 'Bir kısmı tuttu, bir kısmı tutmadı', tone: 'gold' },
  beklenmedik: { label: 'Beklenmedik', description: 'Gelişmeler senaryodan farklı ilerledi', tone: 'down' },
};
export const OUTCOMES: IdeaOutcome[] = ['beklendigi_gibi', 'kismen', 'beklenmedik'];

export const UPDATE_KIND_LABELS: Record<IdeaUpdateKind, string> = {
  note: 'İzleme notu',
  target_hit: 'Hedef seviye görüldü',
  invalidation_hit: 'Geçersizlik seviyesi görüldü',
  review_due: 'Değerlendirme tarihi geldi',
  closed: 'Öneri kapandı',
};

export const REPORT_REASONS: { value: IdeaReportReason; label: string }[] = [
  { value: 'tavsiye', label: 'Kesin getiri vaadi / yönlendirme' },
  { value: 'yaniltici', label: 'Yanıltıcı bilgi' },
  { value: 'hakaret', label: 'Hakaret veya taciz' },
  { value: 'spam', label: 'Spam / tekrar' },
  { value: 'kisisel', label: 'Kişisel veri paylaşımı' },
  { value: 'diger', label: 'Diğer' },
];

export const VIEW_LABELS: Record<IdeaView, string> = {
  newest: 'En yeni',
  review_due: 'Değerlendirme bekleyenler',
  closed: 'Kapananlar',
  bookmarks: 'İzlediklerim',
  mine: 'Önerilerim',
};

export const IDEA_TEXT = {
  rationale: { min: 80, max: 2000 },
  scenario: { min: 20, max: 2000 },
  scenarioCase: { max: 600 },
  risks: { min: 20, max: 2000 },
  evaluation: { min: 40, max: 2000 },
  lessons: { max: 1000 },
  update: { min: 5, max: 1000 },
  responseReason: { min: 10, max: 280 },
  comment: { max: 1000 },
  reportNote: { max: 500 },
  tag: { min: 2, max: 24 },
  tagsMax: 5,
} as const;

export const IDEA_LIMITS = { ideasPerDay: 5, commentsPerDay: 30, compareMax: 3 } as const;

// ---------------------------------------------------------------------------
// Saf yardımcılar
// ---------------------------------------------------------------------------

/** İstanbul takvim günü 'YYYY-MM-DD' */
export function istanbulDay(at: Date | number = Date.now()): string {
  const ms = typeof at === 'number' ? at : at.getTime();
  return new Date(ms + 3 * 3600_000).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Vadeye göre önerilen değerlendirme tarihi (bugünden) */
export function suggestedReviewDate(horizon: IdeaHorizon, now: Date | number = Date.now()): string {
  return addDays(istanbulDay(now), HORIZON_DAYS[horizon]);
}

/** '2026-11-15' → '15 Kasım 2026' */
export function formatDay(day: string | null): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return '—';
  const [y, m, d] = day.split('-').map(Number);
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Varlığın kendi kote para biriminde fiyat: "1.234,56 $" / "41,2350 TL" */
export function formatQuote(value: number | null | undefined, currency: 'USD' | 'TRY'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  const s = value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: digits });
  return currency === 'TRY' ? `${s} TL` : `${s} $`;
}

/** Kullanıcının yazdığı seviye: '1.234,5' / '1234.5' → 1234.5 (boş → null, geçersiz → NaN) */
export function parseLevel(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '');
  if (!s) return null;
  // Hem nokta hem virgül varsa: sondaki ondalık ayırıcıdır
  let norm = s;
  if (s.includes(',') && s.includes('.')) norm = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) norm = s.replace(',', '.');
  const n = Number(norm);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

/**
 * Seviyeleri duruşa ve (yaklaşık) güncel fiyata göre önceden denetler. Sunucu yayın anındaki fiyatla yeniden doğrular.
 * Hata mesajı ya da null.
 */
export function levelHint(stance: IdeaStance, price: number | null, target: number | null, invalidation: number | null): string | null {
  if (Number.isNaN(target as number) || Number.isNaN(invalidation as number)) return 'Seviyeler pozitif bir sayı olmalı';
  if (price === null) return null;
  if (stance === 'al') {
    if (target !== null && target <= price) return '"Al" önerisinde hedef seviye güncel fiyatın üstünde olmalı';
    if (invalidation !== null && invalidation >= price) return '"Al" önerisinde geçersizlik seviyesi güncel fiyatın altında olmalı';
  } else if (stance === 'sat') {
    if (target !== null && target >= price) return '"Sat" önerisinde hedef seviye güncel fiyatın altında olmalı';
    if (invalidation !== null && invalidation <= price) return '"Sat" önerisinde geçersizlik seviyesi güncel fiyatın üstünde olmalı';
  }
  if (target !== null && invalidation !== null && target === invalidation) return 'Hedef ve geçersizlik seviyeleri aynı olamaz';
  return null;
}

/** Metin uzunluğu denetimi (temizlenmiş haliyle); hata mesajı ya da null */
export function textError(label: string, value: string, min: number, max: number, required = true): string | null {
  const len = value.trim().length;
  if (!required && len === 0) return null;
  if (len < min) return min <= 1 ? `${label} gerekli` : `${label} en az ${min} karakter olmalı (${len}/${min})`;
  if (len > max) return `${label} en fazla ${max} karakter olabilir`;
  return null;
}

/** "#Enflasyon, faiz" → ['enflasyon', 'faiz'] */
export function parseTags(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const t = part.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function tagsError(tags: string[]): string | null {
  if (tags.length > IDEA_TEXT.tagsMax) return `En fazla ${IDEA_TEXT.tagsMax} etiket eklenebilir`;
  for (const t of tags) {
    if (t.length < IDEA_TEXT.tag.min || t.length > IDEA_TEXT.tag.max) return `Etiketler ${IDEA_TEXT.tag.min}–${IDEA_TEXT.tag.max} karakter olmalı`;
    if (!/^[\p{L}\p{N} _-]+$/u.test(t)) return 'Etiketlerde yalnızca harf, rakam, boşluk, - ve _ kullanılabilir';
  }
  return null;
}

/** Performans etiketi: 'al' / 'sat' → "Performans", 'izle' → "Değişim" */
export const performanceLabel = (c: Pick<IdeaCard, 'directional'>) => (c.directional ? 'Performans' : 'Değişim');

/** Karşılaştırma seçimi: en fazla 3, sıra korunur; varsa çıkarır */
export function toggleCompare(list: string[], id: string): string[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  if (list.length >= IDEA_LIMITS.compareMax) return list;
  return [...list, id];
}

/** ?ids=a,b,c → geçerli UUID'ler (en fazla 3, tekrarsız) */
export function parseCompareIds(raw: string | null | undefined): string[] {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const out: string[] = [];
  for (const s of String(raw ?? '').split(',')) {
    const id = s.trim().toLowerCase();
    if (re.test(id) && !out.includes(id)) out.push(id);
  }
  return out.slice(0, IDEA_LIMITS.compareMax);
}

/** Liste filtreleri → sorgu dizesi (boş değerler atlanır) */
export function listQuery(f: IdeaListFilters): string {
  const qs = new URLSearchParams();
  const put = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  };
  put('view', f.view);
  put('scope', f.scope === 'all' ? null : f.scope);
  put('league_id', f.league_id);
  put('asset_type', f.asset_type);
  put('stance', f.stance);
  put('horizon', f.horizon);
  put('status', f.status);
  put('q', f.q?.trim());
  put('author', f.author);
  put('limit', f.limit);
  put('offset', f.offset || null);
  return qs.toString();
}

// ---------------------------------------------------------------------------
// Normalleştiriciler (API sözleşmesini güvenle okur)
// ---------------------------------------------------------------------------

const str = (v: unknown, fb = '') => (typeof v === 'string' ? v : v == null ? fb : String(v));
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null);
const num = (v: unknown, fb = 0) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fb;
};
const numOrNull = (v: unknown) => {
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : null;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], fb: T): T => (list.includes(v as T) ? (v as T) : fb);
const ASSET_TYPES: AssetType[] = ['stock', 'crypto', 'currency', 'commodity'];

export function toIdeaCard(r: any): IdeaCard {
  return {
    id: str(r?.id),
    author: {
      username: str(r?.author?.username, '—'),
      avatar_id: str(r?.author?.avatar_id, 'avatar-1') || 'avatar-1',
      frame_id: strOrNull(r?.author?.frame_id),
      profile_public: r?.author?.profile_public !== false,
    },
    is_mine: r?.is_mine === true,
    asset_type: oneOf(r?.asset_type, ASSET_TYPES, 'stock'),
    symbol: str(r?.symbol),
    name: str(r?.name, str(r?.symbol)),
    stance: oneOf(r?.stance, STANCES, 'izle'),
    horizon: oneOf(r?.horizon, HORIZONS, '1m'),
    status: r?.status === 'kapandi' ? 'kapandi' : 'acik',
    scope: r?.scope === 'league' ? 'league' : 'public',
    league: r?.league?.id ? { id: str(r.league.id), name: str(r.league.name, 'Lig') } : null,
    tags: Array.isArray(r?.tags) ? r.tags.map((t: unknown) => str(t)).filter(Boolean) : [],
    rationale_excerpt: str(r?.rationale_excerpt),
    published_at: str(r?.published_at),
    closed_at: strOrNull(r?.closed_at),
    review_date: strOrNull(r?.review_date),
    review_due: r?.review_due === true,
    ref_price: num(r?.ref_price),
    quote_currency: r?.quote_currency === 'TRY' ? 'TRY' : 'USD',
    ref_price_at: str(r?.ref_price_at),
    price: numOrNull(r?.price),
    price_at: strOrNull(r?.price_at),
    price_source: r?.price_source === 'live' || r?.price_source === 'close' ? r.price_source : null,
    change_pct: numOrNull(r?.change_pct),
    performance_pct: numOrNull(r?.performance_pct),
    directional: r?.directional !== false && r?.stance !== 'izle',
    target_price: numOrNull(r?.target_price),
    invalidation_price: numOrNull(r?.invalidation_price),
    target_hit_at: strOrNull(r?.target_hit_at),
    invalidation_hit_at: strOrNull(r?.invalidation_hit_at),
    outcome: OUTCOMES.includes(r?.outcome) ? r.outcome : null,
    counts: { agree: num(r?.counts?.agree), disagree: num(r?.counts?.disagree), comments: num(r?.counts?.comments) },
    bookmarked: r?.bookmarked === true,
    hidden: r?.hidden === true,
  };
}

export function toIdeaUpdate(r: any): IdeaUpdate {
  return {
    id: str(r?.id),
    kind: oneOf(r?.kind, ['note', 'target_hit', 'invalidation_hit', 'review_due', 'closed'] as const, 'note'),
    text: strOrNull(r?.text),
    price: numOrNull(r?.price),
    created_at: str(r?.created_at),
    hidden: r?.hidden === true,
  };
}

export function toIdeaResponse(r: any): IdeaResponse {
  return {
    id: str(r?.id),
    username: str(r?.username, '—'),
    avatar_id: str(r?.avatar_id, 'avatar-1'),
    stance: r?.stance === 'katilmiyorum' ? 'katilmiyorum' : 'katiliyorum',
    reason: str(r?.reason),
    created_at: str(r?.created_at),
    updated_at: str(r?.updated_at, str(r?.created_at)),
    edited: r?.edited === true,
    is_me: r?.is_me === true,
    hidden: r?.hidden === true,
  };
}

export function toIdeaComment(r: any): IdeaComment {
  return {
    id: str(r?.id),
    username: str(r?.username, '—'),
    avatar_id: str(r?.avatar_id, 'avatar-1'),
    text: str(r?.text),
    created_at: str(r?.created_at),
    is_me: r?.is_me === true,
    is_author: r?.is_author === true,
  };
}

function toTrackRecord(r: any): IdeaTrackRecord {
  return {
    published: num(r?.published),
    open: num(r?.open),
    closed: num(r?.closed),
    as_expected: num(r?.as_expected),
    partial: num(r?.partial),
    unexpected: num(r?.unexpected),
    as_expected_pct: numOrNull(r?.as_expected_pct),
    avg_days_to_close: numOrNull(r?.avg_days_to_close),
  };
}

export function toIdeaDetail(r: any): IdeaDetail {
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    ...toIdeaCard(r),
    rationale: str(r?.rationale),
    scenario: str(r?.scenario),
    scenario_cases: { bull: strOrNull(r?.scenario_cases?.bull), base: strOrNull(r?.scenario_cases?.base), bear: strOrNull(r?.scenario_cases?.bear) },
    risks: str(r?.risks),
    evaluation: strOrNull(r?.evaluation),
    lessons: strOrNull(r?.lessons),
    hidden_reason: strOrNull(r?.hidden_reason),
    target_distance_pct: numOrNull(r?.target_distance_pct),
    invalidation_distance_pct: numOrNull(r?.invalidation_distance_pct),
    suggested_review_date: str(r?.suggested_review_date),
    updates: list(r?.updates).map(toIdeaUpdate),
    responses: { agree: list(r?.responses?.agree).map(toIdeaResponse), disagree: list(r?.responses?.disagree).map(toIdeaResponse) },
    my_response: r?.my_response ? toIdeaResponse(r.my_response) : null,
    author_track_record: toTrackRecord(r?.author_track_record),
    can: {
      respond: r?.can?.respond === true,
      comment: r?.can?.comment === true,
      add_update: r?.can?.add_update === true,
      close: r?.can?.close === true,
      bookmark: r?.can?.bookmark === true,
      report: r?.can?.report === true,
    },
  };
}

export function toIdeaChart(r: any): IdeaChart {
  const points = (Array.isArray(r?.points) ? r.points : [])
    .map((p: any) => ({ t: Math.trunc(num(p?.t, NaN)), v: num(p?.v, NaN) }))
    .filter((p: { t: number; v: number }) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0);
  return {
    id: str(r?.id),
    quote_currency: r?.quote_currency === 'TRY' ? 'TRY' : 'USD',
    granularity: r?.granularity === 'm15' || r?.granularity === 'hour' || r?.granularity === 'day' ? r.granularity : null,
    points,
    ref_price: num(r?.ref_price),
    published_at: str(r?.published_at),
    target_price: numOrNull(r?.target_price),
    invalidation_price: numOrNull(r?.invalidation_price),
    ends_at: str(r?.ends_at),
  };
}

function toAsset(r: any): IdeaAssetOption {
  return {
    asset_type: oneOf(r?.asset_type, ASSET_TYPES, 'stock'),
    symbol: str(r?.symbol),
    name: str(r?.name, str(r?.symbol)),
    price: numOrNull(r?.price),
    quote_currency: r?.quote_currency === 'TRY' ? 'TRY' : 'USD',
    change_24h_pct: numOrNull(r?.change_24h_pct),
  };
}

// ---------------------------------------------------------------------------
// API (hatalar ApiError: status + code; ör. 429 IDEA_DAILY_LIMIT, 400 INVALID_LEVELS, 404 IDEA_NOT_FOUND)
// ---------------------------------------------------------------------------

const data = <T = any>(res: any): T => (res && typeof res === 'object' && 'data' in res ? res.data : res) as T;
const gid = (v: string) => encodeURIComponent(v);
const put = (body: unknown): RequestInit => ({ method: 'PUT', body: JSON.stringify(body ?? {}) });
const del: RequestInit = { method: 'DELETE' };

export const ideasApi = {
  listKey: (f: IdeaListFilters) => `/ideas?${listQuery(f)}`,
  list: async (f: IdeaListFilters): Promise<IdeaPage> => {
    const d = data(await apiFetch(ideasApi.listKey(f)));
    const items = Array.isArray(d?.items) ? d.items.map(toIdeaCard) : [];
    return { items, total: num(d?.total, items.length), limit: num(d?.limit, f.limit), offset: num(d?.offset, f.offset) };
  },
  detailKey: (id: string) => `/ideas/${gid(id)}`,
  detail: async (id: string): Promise<IdeaDetail> => toIdeaDetail(data(await apiFetch(ideasApi.detailKey(id)))),
  chartKey: (id: string) => `/ideas/${gid(id)}/chart`,
  chart: async (id: string): Promise<IdeaChart> => toIdeaChart(data(await apiFetch(ideasApi.chartKey(id)))),
  compareKey: (ids: string[]) => `/ideas/compare?ids=${ids.map(gid).join(',')}`,
  compare: async (ids: string[]): Promise<{ items: IdeaDetail[]; missing: string[] }> => {
    const d = data(await apiFetch(ideasApi.compareKey(ids)));
    return { items: (Array.isArray(d?.items) ? d.items : []).map(toIdeaDetail), missing: Array.isArray(d?.missing) ? d.missing.map(String) : [] };
  },
  commentsKey: (id: string, before?: string | null) => `/ideas/${gid(id)}/comments?limit=30${before ? `&before=${gid(before)}` : ''}`,
  comments: async (id: string, before?: string | null): Promise<IdeaCommentPage> => {
    const d = data(await apiFetch(ideasApi.commentsKey(id, before)));
    return { items: (Array.isArray(d?.items) ? d.items : []).map(toIdeaComment), has_more: d?.has_more === true };
  },
  create: async (input: CreateIdeaInput): Promise<IdeaDetail> => toIdeaDetail(data(await apiFetch('/ideas', post(input)))),
  addUpdate: async (id: string, text: string): Promise<IdeaUpdate> => toIdeaUpdate(data(await apiFetch(`/ideas/${gid(id)}/updates`, post({ text })))),
  close: async (id: string, input: CloseIdeaInput): Promise<IdeaDetail> => toIdeaDetail(data(await apiFetch(`/ideas/${gid(id)}/close`, post(input)))),
  respond: async (id: string, stance: IdeaResponseStance, reason: string): Promise<IdeaResponse> =>
    toIdeaResponse(data(await apiFetch(`/ideas/${gid(id)}/response`, put({ stance, reason })))),
  withdrawResponse: (id: string) => apiFetch(`/ideas/${gid(id)}/response`, del),
  comment: async (id: string, text: string): Promise<IdeaComment> => toIdeaComment(data(await apiFetch(`/ideas/${gid(id)}/comments`, post({ text })))),
  deleteComment: (commentId: string) => apiFetch(`/ideas/comments/${gid(commentId)}`, del),
  bookmark: (id: string, on: boolean) => apiFetch(`/ideas/${gid(id)}/bookmark`, on ? put({}) : del),
  report: async (input: { target_type: IdeaReportTarget; target_id: string; reason: IdeaReportReason; note?: string | null }) =>
    data<{ id: string | null; already_reported: boolean }>(await apiFetch('/ideas/reports', post(input))),
  /** Varlık araması: Haftalık Seçim'in seçilebilir varlık uç noktası (güncel fiyatı olanlar) */
  assetsKey: (q: string, type: AssetType | null) => `/picks/assets?${new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(type ? { type } : {}) })}`,
  assets: async (q: string, type: AssetType | null): Promise<IdeaAssetOption[]> => {
    const d = data(await apiFetch(ideasApi.assetsKey(q, type)));
    return (Array.isArray(d) ? d : []).map(toAsset).filter((a) => a.symbol);
  },
};

/** Bu önerinin SWR anahtarları mı (değişiklikten sonra liste / detay yenilensin) */
export const isIdeasKey = (key: unknown) => typeof key === 'string' && key.startsWith('/ideas');
