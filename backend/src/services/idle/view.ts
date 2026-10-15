import {
  BUILDINGS,
  DIVERSIFICATION_MIN_TYPES,
  EARN_MILESTONES,
  OFFLINE_CAP_EXTENDED_S,
  PRESTIGE_SHARE_BONUS,
  type BuildingId,
} from './config';
import {
  UPGRADES,
  buildingMultiplier,
  buildingUpgradeCount,
  canAfford,
  costFor,
  globalMultipliers,
  hasUpgrade,
  incomeEach,
  incomePerSec,
  isUnlocked,
  isUpgradeAvailable,
  maxAffordable,
  nextOwnedMilestone,
  ownedOf,
  prestigeInfo,
  tapValue,
  typesOwned,
  type Accrual,
  type IdleState,
  type PrestigeInfo,
} from './math';
import { multipliersOf, trNumber, type MarketInfo, type MarketMap } from './market';

/**
 * GET /api/idle/state yanıtı (SAF; veritabanına dokunmaz).
 * Tüm tutarlar JS number'dır (double); büyük sayılar için istemci kendi kısaltmasını yapar (1,2 Mn vb.).
 */

export interface BuildingDto {
  id: BuildingId;
  name: string;
  description: string;
  art_key: string;
  base_cost: number;
  base_income: number;
  owned: number;
  next_cost: number;
  cost_x10: number;
  max_affordable: number;
  /** max_affordable adedin toplam fiyatı (0 ise 0) */
  cost_max: number;
  /** Tek binanın saniyelik geliri (tüm çarpanlar dahil) */
  income_each: number;
  income_total: number;
  /** Temel gelire uygulanan toplam çarpan (eşik × yükseltme × piyasa × genel × halka arz) */
  multiplier: number;
  /** Sonraki ×2 adet eşiği (25/50/100/200); hepsi geçildiyse null */
  milestone_next: number | null;
  upgrades_purchased: number;
  unlocked: boolean;
  market: MarketInfo | null;
}

export interface UpgradeDto {
  id: string;
  kind: 'building' | 'global';
  building_id: BuildingId | null;
  tier: number | null;
  name: string;
  description: string;
  cost: number;
  purchased: boolean;
  /** Gereksinimler sağlanıyor ve alınmamış (nakit hariç) */
  available: boolean;
  /** available && nakit yetiyor */
  affordable: boolean;
  requirement: string;
}

export interface OfflineDto {
  /** Bu çağrıda toplanan çevrimdışı kazanç (bir kez gösterilir; sonraki çağrıda 0) */
  earned: number;
  /** Uzakta geçen gerçek süre (sn); çevrimiçiyse 0 */
  seconds: number;
  /** Gelir hesaplanan süre (sn, sınırla kırpılmış) */
  credited_seconds: number;
  capped: boolean;
  cap_seconds: number;
}

export interface MilestoneDto {
  at: number;
  reached: boolean;
  /** Ödül oyun hesabına işlendi mi */
  awarded: boolean;
  reward: { coins: number; xp: number };
}

export interface IdleStateDto {
  server_now: string;
  cash: number;
  total_earned: number;
  income_per_sec: number;
  tap_value: number;
  buildings: BuildingDto[];
  upgrades: UpgradeDto[];
  prestige: PrestigeInfo & { bonus_after_pct: number };
  offline: OfflineDto;
  milestones: MilestoneDto[];
  /** Bu istekte verilen kilometre taşı ödülleri (tost bildirimi için) */
  rewards_granted: { at: number; coins: number; xp: number }[];
  boosts: {
    compound_pct: number;
    diversification_pct: number;
    diversification_active: boolean;
    types_owned: number;
    prestige_pct: number;
    /** Genel çarpan (bileşik × çeşitlendirme × halka arz) */
    global_multiplier: number;
  };
  offline_cap_s: number;
  tips: string[];
}

/** JSON için: küçük sayıları 4 ondalığa yuvarlar, büyükleri olduğu gibi bırakır */
export const num = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n) < 1e15 ? Math.round(n * 1e4) / 1e4 : n;
};

const pctPoints = (factor: number) => Math.round((factor - 1) * 10000) / 100;

// ---------------------------------------------------------------------------
// İpuçları (kısa, eğitici, duruma göre; en fazla 3)
// ---------------------------------------------------------------------------

const GENERAL_TIPS = [
  '72 Kuralı: yıllık %12 getiri, paranı yaklaşık 6 yılda ikiye katlar (72 ÷ 12 = 6).',
  'Bileşik getiri: kazancını yeniden yatırdığında büyüme her gün biraz daha hızlanır.',
  'Çeşitlendirme: farklı varlıklar aynı gün aynı yöne gitmez; Holding Kulesi bu yüzden daha dengelidir.',
  'Kripto yüksek getiri potansiyeli kadar yüksek oynaklık da taşır; tüm birikimini tek varlığa bağlama.',
  'Mevduat (Kumbara) piyasadan bağımsızdır: düşük ama istikrarlı getiri, portföyün sigortasıdır.',
];

export function buildTips(state: IdleState, market: MarketMap, acc: Accrual | null, now: Date): string[] {
  const tips: string[] = [];
  const types = typesOwned(state);
  const prestige = prestigeInfo(state);

  if (types === 0) {
    tips.push('İlk Kumbaranı al: küçük ama düzenli birikim, bileşik büyümenin ilk adımıdır.');
  }
  if (prestige.available) {
    tips.push(
      `Halka Arz hazır: ${prestige.shares_on_reset} pay → kalıcı +%${trNumber(prestige.shares_on_reset * PRESTIGE_SHARE_BONUS * 100, 0)} gelir. Sıfırdan başlamak, daha hızlı büyümek demek.`
    );
  }
  if (types > 0 && types < DIVERSIFICATION_MIN_TYPES) {
    tips.push(`Çeşitlendirme: ${DIVERSIFICATION_MIN_TYPES} farklı bina türü +%25 gelir (Çeşitlendirme Ustası). Şu an ${types} türün var.`);
  } else if (types >= DIVERSIFICATION_MIN_TYPES && !hasUpgrade(state, 'cesitlendirme')) {
    tips.push('Çeşitlendirme Ustası açıldı: 4 farklı bina türünle tüm gelir +%25.');
  }

  // En belirgin piyasa hareketi (sahip olunan binalarda)
  let strongest: { info: MarketInfo; delta: number } | null = null;
  for (const def of BUILDINGS) {
    const info = market[def.id];
    if (!info || info.reason || ownedOf(state, def.id) === 0) continue;
    const delta = Math.abs(info.multiplier - 1);
    if (delta >= 0.02 && (!strongest || delta > strongest.delta)) strongest = { info, delta };
  }
  if (strongest) {
    tips.push(
      strongest.info.multiplier < 1
        ? `${strongest.info.headline}. Tek varlığa bağlı gelir dalgalanır; çeşitlendirme riski azaltır.`
        : `${strongest.info.headline}. Yükselişler kalıcı değildir; dengeli dağılım önemlidir.`
    );
  }

  if (acc?.mode === 'offline' && acc.capped && !hasUpgrade(state, 'gece_vardiyasi')) {
    tips.push(`Çevrimdışı kazanç ${Math.round(acc.cap_s / 3600)} saatle sınırlı: Gece Vardiyası ile ${OFFLINE_CAP_EXTENDED_S / 3600} saate çıkar.`);
  }

  for (const def of BUILDINGS) {
    const owned = ownedOf(state, def.id);
    const next = nextOwnedMilestone(owned);
    if (owned > 0 && next !== null && next - owned <= 5) {
      tips.push(`${def.name} ${next} adede ulaşınca geliri ×2 olur — sabırlı birikim katlanarak büyür.`);
      break;
    }
  }

  if (!hasUpgrade(state, 'bilesik_faiz') && types > 0) {
    tips.push('Bileşik Faiz Kitabı: tüm gelir +%10. Küçük oranlar zamanla büyük fark yaratır.');
  }

  const dayIndex = Math.floor((now.getTime() + 3 * 3600 * 1000) / 86_400_000);
  tips.push(GENERAL_TIPS[dayIndex % GENERAL_TIPS.length]);
  return [...new Set(tips)].slice(0, 3);
}

// ---------------------------------------------------------------------------
// Durum DTO'su
// ---------------------------------------------------------------------------

export function emptyOffline(capS: number): OfflineDto {
  return { earned: 0, seconds: 0, credited_seconds: 0, capped: false, cap_seconds: capS };
}

export function offlineDto(acc: Accrual | null, capS: number): OfflineDto {
  if (!acc || acc.mode !== 'offline') return emptyOffline(capS);
  return {
    earned: num(acc.earned),
    seconds: Math.round(acc.elapsed_s),
    credited_seconds: Math.round(acc.credited_s),
    capped: acc.capped,
    cap_seconds: acc.cap_s,
  };
}

export function buildStateDto(opts: {
  state: IdleState;
  market: MarketMap;
  accrual: Accrual | null;
  now: Date;
  awarded: number[];
  granted?: { at: number; coins: number; xp: number }[];
}): IdleStateDto {
  const { state, market, accrual, now } = opts;
  const mult = multipliersOf(market);
  const global = globalMultipliers(state);
  const ips = incomePerSec(state, mult);
  const prestige = prestigeInfo(state);

  const buildings: BuildingDto[] = BUILDINGS.map((def) => {
    const owned = ownedOf(state, def.id);
    const max = maxAffordable(def.base_cost, owned, state.cash);
    const each = incomeEach(state, def.id, mult, global);
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      art_key: def.art_key,
      base_cost: def.base_cost,
      base_income: def.base_income,
      owned,
      next_cost: num(costFor(def.base_cost, owned, 1)),
      cost_x10: num(costFor(def.base_cost, owned, 10)),
      max_affordable: max,
      cost_max: num(costFor(def.base_cost, owned, max)),
      income_each: num(each),
      income_total: num(each * owned),
      multiplier: num(buildingMultiplier(state, def.id, mult, global)),
      milestone_next: nextOwnedMilestone(owned),
      upgrades_purchased: buildingUpgradeCount(state, def.id),
      unlocked: isUnlocked(state, def.id),
      market: market[def.id] ?? null,
    };
  });

  const upgrades: UpgradeDto[] = UPGRADES.map((u) => {
    const purchased = hasUpgrade(state, u.id);
    const available = isUpgradeAvailable(state, u);
    return {
      id: u.id,
      kind: u.kind,
      building_id: u.building_id,
      tier: u.tier,
      name: u.name,
      description: u.description,
      cost: u.cost,
      purchased,
      available,
      affordable: available && canAfford(state.cash, u.cost),
      requirement: u.requirement_text,
    };
  });

  const awarded = new Set(opts.awarded);
  return {
    server_now: now.toISOString(),
    cash: num(state.cash),
    total_earned: num(state.total_earned),
    income_per_sec: num(ips),
    tap_value: num(tapValue(ips)),
    buildings,
    upgrades,
    prestige: {
      ...prestige,
      bonus_after_pct: Math.round((prestige.shares + prestige.shares_on_reset) * PRESTIGE_SHARE_BONUS * 100 * 100) / 100,
    },
    offline: offlineDto(accrual, state.offline_cap_s),
    milestones: EARN_MILESTONES.map((m) => ({
      at: m.at,
      reached: state.total_earned >= m.at,
      awarded: awarded.has(m.at),
      reward: { ...m.reward },
    })),
    rewards_granted: opts.granted ?? [],
    boosts: {
      compound_pct: pctPoints(global.compound),
      diversification_pct: pctPoints(global.diversification),
      diversification_active: global.diversification_active,
      types_owned: typesOwned(state),
      prestige_pct: pctPoints(global.prestige),
      global_multiplier: num(global.total),
    },
    offline_cap_s: state.offline_cap_s,
    tips: buildTips(state, market, accrual, now),
  };
}
