import {
  BUILDING_BY_ID,
  BUILDING_IDS,
  BUILDING_UPGRADE_BASE_MULTIPLE,
  BUILDING_UPGRADE_FACTOR,
  BUILDING_UPGRADE_NAMES,
  BUILDING_UPGRADE_TIERS,
  BUILDINGS,
  COMPOUND_BOOK_BONUS,
  COST_GROWTH,
  DIVERSIFICATION_BONUS,
  DIVERSIFICATION_MIN_TYPES,
  GLOBAL_UPGRADES,
  MAX_AMOUNT,
  MAX_BUY_PER_REQUEST,
  OFFLINE_CAP_EXTENDED_S,
  OFFLINE_CAP_S,
  ONLINE_WINDOW_S,
  OWNED_MILESTONE_FACTOR,
  OWNED_MILESTONES,
  PRESTIGE_SHARE_BONUS,
  PRESTIGE_THRESHOLD,
  PRESTIGE_UNIT,
  TAP,
  UNLOCK_FRACTION,
  type BuildingId,
} from './config';

/**
 * Yatırım İmparatorluğu — sunucu tarafı oyun matematiği (SAF fonksiyonlar; veritabanına dokunmaz).
 *
 *  gelir(bina)   = adet × temel_gelir × 2^(adet eşikleri) × 2^(bina yükseltmeleri) × piyasa_çarpanı × genel
 *  genel         = (1 + %10 Bileşik Faiz Kitabı) × (1 + %25 Çeşitlendirme, ≥4 tür) × (1 + %2 × halka arz payı)
 *  fiyat(q adet) = temel × 1,15^adet × (1,15^q − 1) / 0,15   (geometrik seri)
 *  tahakkuk      = gelir/sn × süre; son işlemden > 2 dk geçtiyse süre çevrimdışı sınırla (8 sa / 12 sa) kırpılır
 *  halka arz     = toplam pay floor(√(toplam kazanç / 1e6)); kazanç ≥ 1e7 ve ≥ 1 yeni pay gerekir
 */

export interface IdleState {
  cash: number;
  /** Ömür boyu toplam kazanç (halka arzda SIFIRLANMAZ; lider tablosu ve kilometre taşları bunu kullanır) */
  total_earned: number;
  buildings: Partial<Record<BuildingId, number>>;
  upgrades: string[];
  prestige_shares: number;
  prestige_count: number;
  last_tick_at: Date | null;
  offline_cap_s: number;
}

/** Bina → bugünkü piyasa çarpanı (yoksa 1) */
export type MarketMultipliers = Partial<Record<BuildingId, number>>;

export function emptyState(now: Date | null = null): IdleState {
  return {
    cash: 0,
    total_earned: 0,
    buildings: {},
    upgrades: [],
    prestige_shares: 0,
    prestige_count: 0,
    last_tick_at: now,
    offline_cap_s: OFFLINE_CAP_S,
  };
}

const finiteOr = (n: number, def = 0) => (Number.isFinite(n) ? n : def);
export const clampAmount = (n: number) => Math.min(MAX_AMOUNT, Math.max(0, finiteOr(n)));

// ---------------------------------------------------------------------------
// Binalar
// ---------------------------------------------------------------------------

export function ownedOf(state: IdleState, id: BuildingId): number {
  const n = Number(state.buildings[id] ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Ulaşılan adet eşiği sayısı (25, 50, 100, 200) */
export function milestonesReached(owned: number): number {
  return OWNED_MILESTONES.filter((m) => owned >= m).length;
}

export function nextOwnedMilestone(owned: number): number | null {
  return OWNED_MILESTONES.find((m) => owned < m) ?? null;
}

export function typesOwned(state: IdleState): number {
  return BUILDING_IDS.filter((id) => ownedOf(state, id) > 0).length;
}

export function isUnlocked(state: IdleState, id: BuildingId): boolean {
  // İlk bina her zaman açıktır (yeni oyuncu 0 kazançla başlar)
  if (id === BUILDINGS[0].id) return true;
  return ownedOf(state, id) > 0 || state.total_earned >= BUILDING_BY_ID[id].base_cost * UNLOCK_FRACTION;
}

// ---------------------------------------------------------------------------
// Yükseltmeler
// ---------------------------------------------------------------------------

export interface UpgradeDef {
  id: string;
  kind: 'building' | 'global';
  building_id: BuildingId | null;
  tier: number | null;
  name: string;
  description: string;
  cost: number;
  requirement_text: string;
  /** Bina kademesi: gereken adet */
  requires_owned?: number;
  requires_total_earned?: number;
  requires_types?: number;
}

export const buildingUpgradeId = (id: BuildingId, tier: number) => `${id}_${tier}`;

export const UPGRADES: readonly UpgradeDef[] = [
  ...BUILDINGS.flatMap((b) =>
    BUILDING_UPGRADE_TIERS.map((t, i): UpgradeDef => ({
      id: buildingUpgradeId(b.id, t.tier),
      kind: 'building',
      building_id: b.id,
      tier: t.tier,
      name: BUILDING_UPGRADE_NAMES[b.id][i],
      description: `${b.name} geliri ×${BUILDING_UPGRADE_FACTOR}`,
      cost: b.base_cost * BUILDING_UPGRADE_BASE_MULTIPLE * t.cost_factor,
      requirement_text:
        t.tier === 1 ? `${t.requires_owned} ${b.name}` : `${t.requires_owned} ${b.name} + önceki yükseltme`,
      requires_owned: t.requires_owned,
    }))
  ),
  ...GLOBAL_UPGRADES.map(
    (g): UpgradeDef => ({
      id: g.id,
      kind: 'global',
      building_id: null,
      tier: null,
      name: g.name,
      description: g.description,
      cost: g.cost,
      requirement_text: g.requirement_text,
      requires_total_earned: g.requires_total_earned,
      requires_types: g.requires_types,
    })
  ),
];

export const UPGRADE_IDS = UPGRADES.map((u) => u.id);
export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export const hasUpgrade = (state: IdleState, id: string) => state.upgrades.includes(id);

/** Binanın satın alınmış yükseltme kademesi sayısı */
export function buildingUpgradeCount(state: IdleState, id: BuildingId): number {
  return BUILDING_UPGRADE_TIERS.filter((t) => hasUpgrade(state, buildingUpgradeId(id, t.tier))).length;
}

/** Gereksinimler sağlanıyor ve henüz alınmamış mı? (nakit kontrolü hariç) */
export function isUpgradeAvailable(state: IdleState, def: UpgradeDef): boolean {
  if (hasUpgrade(state, def.id)) return false;
  if (def.kind === 'building' && def.building_id && def.tier) {
    if (ownedOf(state, def.building_id) < (def.requires_owned ?? 0)) return false;
    if (def.tier > 1 && !hasUpgrade(state, buildingUpgradeId(def.building_id, def.tier - 1))) return false;
    return true;
  }
  if (def.requires_total_earned !== undefined && state.total_earned < def.requires_total_earned) return false;
  if (def.requires_types !== undefined && typesOwned(state) < def.requires_types) return false;
  return true;
}

export function offlineCapFor(upgrades: string[]): number {
  return upgrades.includes('gece_vardiyasi') ? OFFLINE_CAP_EXTENDED_S : OFFLINE_CAP_S;
}

// ---------------------------------------------------------------------------
// Gelir
// ---------------------------------------------------------------------------

export interface GlobalMultipliers {
  compound: number;
  diversification: number;
  diversification_active: boolean;
  prestige: number;
  total: number;
}

export function globalMultipliers(state: IdleState): GlobalMultipliers {
  const compound = hasUpgrade(state, 'bilesik_faiz') ? 1 + COMPOUND_BOOK_BONUS : 1;
  const diversificationActive = hasUpgrade(state, 'cesitlendirme') && typesOwned(state) >= DIVERSIFICATION_MIN_TYPES;
  const diversification = diversificationActive ? 1 + DIVERSIFICATION_BONUS : 1;
  const prestige = 1 + PRESTIGE_SHARE_BONUS * Math.max(0, Math.floor(state.prestige_shares || 0));
  return {
    compound,
    diversification,
    diversification_active: diversificationActive,
    prestige,
    total: compound * diversification * prestige,
  };
}

export function marketMultiplierOf(market: MarketMultipliers, id: BuildingId): number {
  const m = market[id];
  return typeof m === 'number' && Number.isFinite(m) && m > 0 ? m : 1;
}

/** Binanın temel gelirine uygulanan toplam çarpan (eşikler × yükseltmeler × piyasa × genel) */
export function buildingMultiplier(state: IdleState, id: BuildingId, market: MarketMultipliers, global = globalMultipliers(state)): number {
  const milestones = Math.pow(OWNED_MILESTONE_FACTOR, milestonesReached(ownedOf(state, id)));
  const upgrades = Math.pow(BUILDING_UPGRADE_FACTOR, buildingUpgradeCount(state, id));
  return milestones * upgrades * marketMultiplierOf(market, id) * global.total;
}

/** Tek binanın saniyelik geliri (adet 0 ise bir tane alınırsa ne kazandıracağı — eşik etkisi hariç) */
export function incomeEach(state: IdleState, id: BuildingId, market: MarketMultipliers, global = globalMultipliers(state)): number {
  return BUILDING_BY_ID[id].base_income * buildingMultiplier(state, id, market, global);
}

export function incomeTotal(state: IdleState, id: BuildingId, market: MarketMultipliers, global = globalMultipliers(state)): number {
  return ownedOf(state, id) * incomeEach(state, id, market, global);
}

export function incomePerSec(state: IdleState, market: MarketMultipliers = {}): number {
  const global = globalMultipliers(state);
  let sum = 0;
  for (const id of BUILDING_IDS) sum += incomeTotal(state, id, market, global);
  return finiteOr(sum);
}

export function tapValue(ips: number): number {
  return Math.max(TAP.min, TAP.fraction * Math.max(0, finiteOr(ips)));
}

// ---------------------------------------------------------------------------
// Fiyatlar (geometrik seri)
// ---------------------------------------------------------------------------

/** owned adetten sonra q adet almanın toplam fiyatı */
export function costFor(baseCost: number, owned: number, qty: number): number {
  if (qty <= 0) return 0;
  const first = baseCost * Math.pow(COST_GROWTH, owned);
  return (first * (Math.pow(COST_GROWTH, qty) - 1)) / (COST_GROWTH - 1);
}

/** Kayan nokta toleransıyla "nakit yeter mi?" */
export function canAfford(cash: number, cost: number): boolean {
  return Number.isFinite(cost) && cost <= cash + Math.max(1e-9, Math.abs(cash) * 1e-12);
}

/** Nakitle (en fazla limit adet) alınabilecek en çok bina */
export function maxAffordable(baseCost: number, owned: number, cash: number, limit: number = MAX_BUY_PER_REQUEST): number {
  const first = baseCost * Math.pow(COST_GROWTH, owned);
  if (!(cash > 0) || !Number.isFinite(first) || !canAfford(cash, first)) return 0;
  let q = Math.floor(Math.log((cash * (COST_GROWTH - 1)) / first + 1) / Math.log(COST_GROWTH));
  q = Math.min(limit, Math.max(0, Number.isFinite(q) ? q : limit));
  while (q > 0 && !canAfford(cash, costFor(baseCost, owned, q))) q--;
  while (q < limit && canAfford(cash, costFor(baseCost, owned, q + 1))) q++;
  return q;
}

// ---------------------------------------------------------------------------
// Tahakkuk (çevrimiçi / çevrimdışı)
// ---------------------------------------------------------------------------

export interface Accrual {
  /** none: ilk kayıt / süre yok; online: ≤ 2 dk (sınırsız); offline: > 2 dk (sınırlı) */
  mode: 'none' | 'online' | 'offline';
  /** Son işlemden bu yana geçen gerçek süre (sn) */
  elapsed_s: number;
  /** Gelir hesaplanan süre (sn) — çevrimdışı ise sınırla kırpılmış */
  credited_s: number;
  earned: number;
  capped: boolean;
  cap_s: number;
}

export function accrue(state: IdleState, now: Date, ips: number): Accrual {
  const cap = Math.max(0, state.offline_cap_s || OFFLINE_CAP_S);
  const last = state.last_tick_at?.getTime();
  if (last === undefined || !Number.isFinite(last)) {
    return { mode: 'none', elapsed_s: 0, credited_s: 0, earned: 0, capped: false, cap_s: cap };
  }
  // Saat kayması: geriye gidilmez
  const elapsed = Math.max(0, (now.getTime() - last) / 1000);
  if (elapsed <= 0) return { mode: 'none', elapsed_s: 0, credited_s: 0, earned: 0, capped: false, cap_s: cap };
  const rate = Math.max(0, finiteOr(ips));
  if (elapsed <= ONLINE_WINDOW_S) {
    return { mode: 'online', elapsed_s: elapsed, credited_s: elapsed, earned: rate * elapsed, capped: false, cap_s: cap };
  }
  const credited = Math.min(elapsed, cap);
  return { mode: 'offline', elapsed_s: elapsed, credited_s: credited, earned: rate * credited, capped: elapsed > cap, cap_s: cap };
}

/** Tahakkuku duruma uygular (yeni nesne döner) */
export function applyAccrual(state: IdleState, acc: Accrual, now: Date): IdleState {
  const last = state.last_tick_at?.getTime();
  const tick = last !== undefined && Number.isFinite(last) && last > now.getTime() ? state.last_tick_at : now;
  return {
    ...state,
    cash: clampAmount(state.cash + acc.earned),
    total_earned: clampAmount(state.total_earned + acc.earned),
    last_tick_at: tick,
  };
}

/** Kazanç ekler (dokunuş vb.): nakit + toplam kazanç */
export function addEarnings(state: IdleState, amount: number): IdleState {
  const a = Math.max(0, finiteOr(amount));
  return { ...state, cash: clampAmount(state.cash + a), total_earned: clampAmount(state.total_earned + a) };
}

// ---------------------------------------------------------------------------
// İşlemler (doğrulama hataları IdleRuleError olarak fırlatılır)
// ---------------------------------------------------------------------------

export class IdleRuleError extends Error {
  constructor(
    readonly code: 'INSUFFICIENT_CASH' | 'UPGRADE_OWNED' | 'UPGRADE_LOCKED' | 'PRESTIGE_UNAVAILABLE' | 'UNKNOWN_UPGRADE',
    message: string
  ) {
    super(message);
  }
}

export type BuyQuantity = number | 'max';

export interface BuyResult {
  state: IdleState;
  quantity: number;
  cost: number;
}

export function buyBuilding(state: IdleState, id: BuildingId, quantity: BuyQuantity): BuyResult {
  const def = BUILDING_BY_ID[id];
  const owned = ownedOf(state, id);
  const qty = quantity === 'max' ? maxAffordable(def.base_cost, owned, state.cash) : Math.floor(quantity);
  if (!(qty >= 1)) throw new IdleRuleError('INSUFFICIENT_CASH', `${def.name} için yeterli İmparatorluk Lirası yok`);
  const cost = costFor(def.base_cost, owned, qty);
  if (!canAfford(state.cash, cost)) {
    throw new IdleRuleError('INSUFFICIENT_CASH', `${def.name} için yeterli İmparatorluk Lirası yok`);
  }
  return {
    state: { ...state, cash: Math.max(0, state.cash - cost), buildings: { ...state.buildings, [id]: owned + qty } },
    quantity: qty,
    cost,
  };
}

export function buyUpgrade(state: IdleState, upgradeId: string): IdleState {
  const def = UPGRADE_BY_ID[upgradeId];
  if (!def) throw new IdleRuleError('UNKNOWN_UPGRADE', 'Bilinmeyen yükseltme');
  if (hasUpgrade(state, def.id)) throw new IdleRuleError('UPGRADE_OWNED', 'Bu yükseltme zaten alındı');
  if (!isUpgradeAvailable(state, def)) throw new IdleRuleError('UPGRADE_LOCKED', `Yükseltme kilitli: ${def.requirement_text}`);
  if (!canAfford(state.cash, def.cost)) throw new IdleRuleError('INSUFFICIENT_CASH', `${def.name} için yeterli İmparatorluk Lirası yok`);
  const upgrades = [...state.upgrades, def.id];
  return { ...state, cash: Math.max(0, state.cash - def.cost), upgrades, offline_cap_s: offlineCapFor(upgrades) };
}

// ---------------------------------------------------------------------------
// Halka Arz (prestij)
// ---------------------------------------------------------------------------

export interface PrestigeInfo {
  shares: number;
  /** Kalıcı gelir bonusu (yüzde puan; pay × 2) */
  bonus_pct: number;
  available: boolean;
  /** Şimdi halka arz yapılırsa eklenecek pay */
  shares_on_reset: number;
  threshold: number;
  count: number;
}

export function totalSharesFor(totalEarned: number): number {
  return Math.floor(Math.sqrt(Math.max(0, finiteOr(totalEarned)) / PRESTIGE_UNIT));
}

export function prestigeInfo(state: IdleState): PrestigeInfo {
  const shares = Math.max(0, Math.floor(state.prestige_shares || 0));
  const onReset = Math.max(0, totalSharesFor(state.total_earned) - shares);
  return {
    shares,
    bonus_pct: Math.round(shares * PRESTIGE_SHARE_BONUS * 100 * 100) / 100,
    available: state.total_earned >= PRESTIGE_THRESHOLD && onReset >= 1,
    shares_on_reset: onReset,
    threshold: PRESTIGE_THRESHOLD,
    count: Math.max(0, Math.floor(state.prestige_count || 0)),
  };
}

/** Nakit, binalar ve yükseltmeler sıfırlanır; pay ve toplam kazanç korunur. */
export function applyPrestige(state: IdleState, now: Date): { state: IdleState; gained: number } {
  const info = prestigeInfo(state);
  if (!info.available) {
    throw new IdleRuleError(
      'PRESTIGE_UNAVAILABLE',
      state.total_earned < PRESTIGE_THRESHOLD
        ? 'Halka arz için toplam 10 milyon İL kazanmalısın'
        : 'Yeni bir halka arz payı için daha fazla kazanmalısın'
    );
  }
  return {
    state: {
      ...state,
      cash: 0,
      buildings: {},
      upgrades: [],
      offline_cap_s: OFFLINE_CAP_S,
      prestige_shares: info.shares + info.shares_on_reset,
      prestige_count: info.count + 1,
      last_tick_at: now,
    },
    gained: info.shares_on_reset,
  };
}
