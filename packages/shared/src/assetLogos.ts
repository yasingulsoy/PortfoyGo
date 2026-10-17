// Varlık logoları: depodaki yerel SVG'ler (frontend/public/logos ve admin/public/logos, birebir aynı).
// Manifest (assetLogos.generated.ts) scripts/logos/fetch-logos.mjs ile üretilir; burada yalnızca okuma
// yardımcıları vardır. Manifestte olmayan bir logo için ASLA istek atılmaz (404 yok) — çağıran baş harf gösterir.

import { ASSET_LOGO_ALIASES, ASSET_LOGO_FILES } from './assetLogos.generated';
import { isAssetType, type AssetType } from './types';

/** Logoların public kökü (her iki uygulamada da aynı yol). */
export const ASSET_LOGO_BASE = '/logos';

const has = (obj: Readonly<Record<string, string>>, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Sembolü manifest biçimine getirir: baş/son boşluk atılır, BÜYÜK harfe çevrilir. `toUpperCase` yerelden
 * bağımsızdır (tr-TR'de bile 'link' → 'LINK', 'LİNK' değil). Kripto listesi küçük harf ('btc') döndürür.
 */
export function normalizeLogoSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/** `${type}:${SEMBOL}` biçiminde kanonik manifest anahtarı (takma adlar çözülür) ya da logo yoksa null. */
export function assetLogoKey(type: string, symbol: string | null | undefined): string | null {
  if (!type || !symbol) return null;
  const key = `${type}:${normalizeLogoSymbol(symbol)}`;
  if (has(ASSET_LOGO_FILES, key)) return key;
  const target = has(ASSET_LOGO_ALIASES, key) ? ASSET_LOGO_ALIASES[key] : undefined;
  return target && has(ASSET_LOGO_FILES, target) ? target : null;
}

/** Bu varlık için yerel logo var mı? */
export function hasAssetLogo(type: string, symbol: string | null | undefined): boolean {
  return assetLogoKey(type, symbol) !== null;
}

/**
 * Yerel logo yolu (ör. `/logos/crypto/BTC.svg?v=1a2b3c4d`) ya da logo yoksa null.
 * `?v=` içerik özetidir: dosya değişince adres de değişir (uzun süreli önbellek güvenli).
 */
export function assetLogoSrc(type: string, symbol: string | null | undefined): string | null {
  const key = assetLogoKey(type, symbol);
  if (!key) return null;
  const sep = key.indexOf(':');
  const dir = key.slice(0, sep);
  const file = key.slice(sep + 1);
  return `${ASSET_LOGO_BASE}/${dir}/${encodeURIComponent(file)}.svg?v=${ASSET_LOGO_FILES[key]}`;
}

/**
 * "tip:SEMBOL" biçimindeki varlık bağlantısını ayrıştırır (ör. Global Lab `provider_symbol` = "commodity:GOLD").
 * Geçersiz / boş girdide null.
 */
export function parseAssetRef(ref: string | null | undefined): { type: AssetType; symbol: string } | null {
  const m = /^([a-z]+):([A-Za-z0-9._-]{1,30})$/.exec((ref ?? '').trim());
  if (!m) return null;
  const type = m[1];
  return isAssetType(type) ? { type, symbol: normalizeLogoSymbol(m[2]) } : null;
}

/** Bağlantının işaret ettiği varlığın yerel logosu varsa { type, symbol }, yoksa null (AssetAvatar için). */
export function assetRefWithLogo(ref: string | null | undefined): { type: AssetType; symbol: string } | null {
  const asset = parseAssetRef(ref);
  return asset && hasAssetLogo(asset.type, asset.symbol) ? asset : null;
}
