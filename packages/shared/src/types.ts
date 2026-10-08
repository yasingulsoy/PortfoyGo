/** Uygulamalar arasında paylaşılan temel tipler. */

export type AssetType = 'stock' | 'crypto' | 'currency' | 'commodity';

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: 'Hisse',
  crypto: 'Kripto',
  currency: 'Döviz',
  commodity: 'Emtia',
};
