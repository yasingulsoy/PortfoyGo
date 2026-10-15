import pool from '../../config/database';
import { DAY_MS, istanbulDayStart } from '../../utils/priceBuckets';
import { logger } from '../../utils/logger';
import {
  BUILDINGS,
  MARKET_CACHE_MS,
  MARKET_MULT_MAX,
  MARKET_MULT_MIN,
  MARKET_STALE_DAYS,
  type BuildingDef,
  type BuildingId,
} from './config';
import type { MarketMultipliers } from './math';

/**
 * Piyasa etkisi: piyasaya bağlı binaların günlük çarpanı, price_history'deki en son İKİ İstanbul günü
 * kovasından (granularity = 'day') hesaplanır:
 *
 *   değişim  = (son gün − önceki gün) / önceki gün
 *   çarpan   = sınırla(1 + k × değişim, 0,6, 1,8)   (3 ondalığa yuvarlanır; hesapta da bu değer kullanılır)
 *
 *  - tek varlık (doviz: currency:USD, altin: commodity:GOLD → yedek commodity:GAU, kripto: crypto:BTC)
 *  - hisse sepeti: son kovası en yeni stok günüyle aynı olan tüm hisselerin eşit ağırlıklı ortalaması
 *  - holding: verisi olan bağlı binaların (doviz, altin, hisse, kripto) değişimlerinin ortalaması
 *
 * Veri yoksa (≥ 2 kova yok) çarpan 1 ve reason 'veri yok'; son kova MARKET_STALE_DAYS günden eskiyse
 * çarpan 1 ve reason 'veri eski'. Sonuç 5 dakika önbelleklenir (gün kovaları 15 dk'da bir güncellenir).
 * Okuma hatası oyunu bozmaz: tüm çarpanlar 1 ('veri yok').
 */

export interface MarketInfo {
  /** currency | commodity | stock | crypto | mixed (holding) */
  asset_type: string;
  /** USD | GOLD | GAU | BASKET | BTC | ALL */
  symbol: string;
  label: string;
  /** Son iki gün kovası arasındaki değişim, yüzde (1.23 = %1,23); veri yoksa null */
  change_pct: number | null;
  multiplier: number;
  /** 'veri yok' | 'veri eski' (yalnızca çarpan 1'e düşürüldüyse) */
  reason?: string;
  /** Son kovanın İstanbul günü (YYYY-MM-DD) */
  as_of: string | null;
  /** Sepet / holding: hesaba giren seri sayısı */
  components?: number;
  /** Hazır Türkçe cümle: "Bugün altın %1,2 yükseldi → Altın Madeni ×1,07" */
  headline: string;
}

export type MarketMap = Record<BuildingId, MarketInfo | null>;

export interface DayRow {
  asset_type: string;
  symbol: string;
  bucket_start: Date;
  price: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Türkçe ondalık biçim (virgül) */
export function trNumber(n: number, digits: number): string {
  return n.toFixed(digits).replace('.', ',');
}

export function marketMultiplier(changeFraction: number, k: number): number {
  if (!Number.isFinite(changeFraction)) return 1;
  return round3(Math.min(MARKET_MULT_MAX, Math.max(MARKET_MULT_MIN, 1 + k * changeFraction)));
}

/** İstanbul günü (YYYY-MM-DD) — kova başlangıcı İstanbul gece yarısıdır */
function istanbulDayKey(d: Date): string {
  return new Date(d.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

interface Series {
  latest: DayRow;
  prev: DayRow;
}

function groupSeries(rows: DayRow[]): Map<string, DayRow[]> {
  const map = new Map<string, DayRow[]>();
  for (const r of rows) {
    if (!(r.price > 0) || !(r.bucket_start instanceof Date) || Number.isNaN(r.bucket_start.getTime())) continue;
    const key = `${r.asset_type}:${r.symbol.toUpperCase()}`;
    let arr = map.get(key);
    if (!arr) map.set(key, (arr = []));
    arr.push(r);
  }
  for (const arr of map.values()) arr.sort((a, b) => b.bucket_start.getTime() - a.bucket_start.getTime());
  return map;
}

function seriesOf(arr: DayRow[] | undefined): Series | null {
  if (!arr || arr.length < 2) return null;
  return { latest: arr[0], prev: arr[1] };
}

const changeOf = (s: Series) => (s.latest.price - s.prev.price) / s.prev.price;

function headlineFor(def: BuildingDef, subject: string, changePct: number | null, multiplier: number, asOf: string | null, now: Date, reason?: string): string {
  if (changePct === null || reason) {
    return `${def.name}: piyasa verisi ${reason === 'veri eski' ? 'güncel değil' : 'yok'} → ×1,00`;
  }
  const when = asOf === istanbulDayKey(istanbulDayStart(now)) ? 'Bugün' : 'Son işlem gününde';
  const pct = trNumber(Math.abs(changePct), 1);
  const verb = Math.abs(changePct) < 0.05 ? `yatay seyretti (%${pct})` : `%${pct} ${changePct > 0 ? 'yükseldi' : 'düştü'}`;
  return `${when} ${subject} ${verb} → ${def.name} ×${trNumber(multiplier, 2)}`;
}

/**
 * Satırlardan bina → piyasa bilgisi (SAF). rows: her seri için en az son iki gün kovası.
 */
export function computeMarket(rows: DayRow[], now: Date): MarketMap {
  const groups = groupSeries(rows);
  const freshFrom = istanbulDayStart(now).getTime() - MARKET_STALE_DAYS * DAY_MS;
  const isFresh = (s: Series) => s.latest.bucket_start.getTime() >= freshFrom;

  const out = {} as MarketMap;
  /** composite için: bina → kesirli değişim (yalnızca geçerli veriler) */
  const linkChanges: number[] = [];

  const build = (
    def: BuildingDef,
    base: { asset_type: string; symbol: string; label: string; subject: string; k: number },
    change: number | null,
    asOf: string | null,
    reason: string | undefined,
    components?: number
  ): MarketInfo => {
    const multiplier = change === null || reason ? 1 : marketMultiplier(change, base.k);
    const changePct = change === null ? null : round2(change * 100);
    const info: MarketInfo = {
      asset_type: base.asset_type,
      symbol: base.symbol,
      label: base.label,
      change_pct: reason ? (reason === 'veri eski' ? changePct : null) : changePct,
      multiplier,
      as_of: asOf,
      headline: headlineFor(def, base.subject, reason ? null : changePct, multiplier, asOf, now, reason),
    };
    if (reason) info.reason = reason;
    if (components !== undefined) info.components = components;
    return info;
  };

  for (const def of BUILDINGS) {
    const link = def.market;
    if (!link) {
      out[def.id] = null;
      continue;
    }
    if (link.kind === 'asset') {
      let used: { symbol: string; series: Series } | null = null;
      let stale: { symbol: string; series: Series } | null = null;
      for (const sym of link.symbols) {
        const s = seriesOf(groups.get(`${link.asset_type}:${sym}`));
        if (!s) continue;
        if (isFresh(s)) {
          used = { symbol: sym, series: s };
          break;
        }
        stale ??= { symbol: sym, series: s };
      }
      const base = { asset_type: link.asset_type, label: link.label, subject: link.subject, k: link.k };
      if (used) {
        const change = changeOf(used.series);
        linkChanges.push(change);
        out[def.id] = build(def, { ...base, symbol: used.symbol }, change, istanbulDayKey(used.series.latest.bucket_start), undefined);
      } else if (stale) {
        out[def.id] = build(def, { ...base, symbol: stale.symbol }, changeOf(stale.series), istanbulDayKey(stale.series.latest.bucket_start), 'veri eski');
      } else {
        out[def.id] = build(def, { ...base, symbol: link.symbols[0] }, null, null, 'veri yok');
      }
      continue;
    }
    if (link.kind === 'basket') {
      const all: Series[] = [];
      for (const [key, arr] of groups) {
        if (!key.startsWith(`${link.asset_type}:`)) continue;
        const s = seriesOf(arr);
        if (s) all.push(s);
      }
      const base = { asset_type: link.asset_type, symbol: 'BASKET', label: link.label, subject: link.subject, k: link.k };
      if (all.length === 0) {
        out[def.id] = build(def, base, null, null, 'veri yok', 0);
        continue;
      }
      const latestMs = Math.max(...all.map((s) => s.latest.bucket_start.getTime()));
      const members = all.filter((s) => s.latest.bucket_start.getTime() === latestMs);
      const change = members.reduce((sum, s) => sum + changeOf(s), 0) / members.length;
      const asOf = istanbulDayKey(new Date(latestMs));
      if (latestMs < freshFrom) {
        out[def.id] = build(def, base, change, asOf, 'veri eski', members.length);
      } else {
        linkChanges.push(change);
        out[def.id] = build(def, base, change, asOf, undefined, members.length);
      }
      continue;
    }
    // composite (holding): diğer bağların ortalaması — BUILDINGS sırasında en sonda olmalı
    const base = { asset_type: 'mixed', symbol: 'ALL', label: link.label, subject: link.subject, k: link.k };
    if (linkChanges.length === 0) {
      out[def.id] = build(def, base, null, null, 'veri yok', 0);
    } else {
      const change = linkChanges.reduce((a, b) => a + b, 0) / linkChanges.length;
      const asOfs = BUILDINGS.map((b) => out[b.id]?.as_of).filter((d): d is string => !!d && d.length > 0);
      out[def.id] = build(def, base, change, asOfs.sort().pop() ?? null, undefined, linkChanges.length);
    }
  }
  return out;
}

export function multipliersOf(map: MarketMap): MarketMultipliers {
  const out: MarketMultipliers = {};
  for (const def of BUILDINGS) {
    const m = map[def.id];
    if (m) out[def.id] = m.multiplier;
  }
  return out;
}

/** Sorgulanacak tek varlık serileri (sepet: tüm hisseler ayrıca) */
function assetKeys(): { types: string[]; symbols: string[] } {
  const types: string[] = [];
  const symbols: string[] = [];
  for (const def of BUILDINGS) {
    if (def.market?.kind !== 'asset') continue;
    for (const s of def.market.symbols) {
      types.push(def.market.asset_type);
      symbols.push(s);
    }
  }
  return { types, symbols };
}

/** Gün kovalarını okur (her seri için son 2; son 14 gün içinden) */
export async function loadDayRows(now: Date): Promise<DayRow[]> {
  const { types, symbols } = assetKeys();
  const basketTypes = BUILDINGS.filter((b) => b.market?.kind === 'basket').map((b) => (b.market as { asset_type: string }).asset_type);
  const from = new Date(istanbulDayStart(now).getTime() - 14 * DAY_MS);
  const r = await pool.query(
    `SELECT asset_type, symbol, bucket_start, price
       FROM (
         SELECT p.asset_type, p.symbol, p.bucket_start, p.price,
                ROW_NUMBER() OVER (PARTITION BY p.asset_type, p.symbol ORDER BY p.bucket_start DESC) AS rn
           FROM price_history p
          WHERE p.granularity = 'day'
            AND p.price > 0
            AND p.bucket_start >= $1::timestamptz
            AND p.bucket_start <= $2::timestamptz
            AND (
              p.asset_type = ANY($3::text[])
              OR (p.asset_type, p.symbol) IN (SELECT u.t, u.s FROM unnest($4::text[], $5::text[]) AS u(t, s))
            )
       ) x
      WHERE rn <= 2`,
    [from.toISOString(), now.toISOString(), basketTypes, types, symbols]
  );
  return r.rows.map((row: any) => ({
    asset_type: String(row.asset_type),
    symbol: String(row.symbol),
    bucket_start: row.bucket_start instanceof Date ? row.bucket_start : new Date(String(row.bucket_start)),
    price: Number(row.price),
  }));
}

let cache: { at: number; value: MarketMap } | null = null;

export function clearMarketCache(): void {
  cache = null;
}

/** Bina → piyasa bilgisi (5 dk önbellekli). Hata olursa tüm çarpanlar 1. */
export async function getMarket(now: Date = new Date()): Promise<MarketMap> {
  if (cache && now.getTime() - cache.at >= 0 && now.getTime() - cache.at < MARKET_CACHE_MS) return cache.value;
  try {
    const value = computeMarket(await loadDayRows(now), now);
    cache = { at: now.getTime(), value };
    return value;
  } catch (err) {
    logger.warn({ err }, '[idle] piyasa çarpanları okunamadı');
    return computeMarket([], now);
  }
}
