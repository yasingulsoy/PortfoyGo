/** Uygulamalar arasında paylaşılan temel tipler. */

export type AssetType = 'stock' | 'crypto' | 'currency' | 'commodity';

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: 'Hisse',
  crypto: 'Kripto',
  currency: 'Döviz',
  commodity: 'Emtia',
};

/** API'den serbest metin olarak gelen varlık tipini daraltır (ör. admin tablolarındaki `asset_type`). */
export const isAssetType = (v: unknown): v is AssetType =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(ASSET_TYPE_LABELS, v);
