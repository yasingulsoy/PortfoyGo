// YALNIZCA sunucu bileşenleri (sayfa, generateMetadata, opengraph-image): herkese açık profil isteği.
// Oturum çerezi GÖNDERİLMEZ — yanıt herkes için aynıdır.
//
// Önbellek: Next veri önbelleği (fetch `next.revalidate`) 404 yanıtlarını saklamadığından, profil gizlendiğinde
// eski (herkese açık) veriyi sunmaya devam edebiliyordu. Bu yüzden istek `no-store` yapılır ve SONUÇ (açık / gizli /
// yok) süreç içi küçük bir TTL önbelleğinde 30 sn tutulur: gizlilik değişikliği en geç 30 sn'de yansır, aynı profile
// gelen yoğun trafik (ör. paylaşılan bağlantı + OG görseli) backend'e dakikada birkaç istekten fazla yük bindirmez.
// Hatalar önbelleğe alınmaz. Aynı render içindeki çağrılar (generateMetadata + sayfa) React cache ile tekilleşir.

import { cache } from 'react';
import type { PublicProfileResult } from '@/types';
import { normalizePublicProfile, serverApiBase } from './publicProfile';

const TTL_MS = 30_000;
const MAX_ENTRIES = 500;
const store = new Map<string, { at: number; value: PublicProfileResult }>();

function remember(key: string, value: PublicProfileResult): PublicProfileResult {
  if (value.status === 'error') return value;
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { at: Date.now(), value });
  return value;
}

async function load(name: string): Promise<PublicProfileResult> {
  try {
    const res = await fetch(`${serverApiBase()}/public/users/${encodeURIComponent(name)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const body = await res.json().catch(() => null);
    if (res.status === 404) return { status: body?.code === 'PROFILE_PRIVATE' ? 'private' : 'not_found' };
    if (res.status === 400) return { status: 'not_found' };
    if (!res.ok) return { status: 'error' };
    const profile = normalizePublicProfile(body?.data);
    return profile ? { status: 'ok', profile } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

export const getPublicProfile = cache(async (username: string): Promise<PublicProfileResult> => {
  const name = username.trim();
  if (!name || name.length > 50) return { status: 'not_found' };
  const key = name.toLowerCase();
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  if (hit) store.delete(key);
  return remember(key, await load(name));
});
