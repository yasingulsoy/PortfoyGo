'use client';

import { useCallback, useSyncExternalStore } from 'react';

// Aynı sekmedeki diğer abonelere değişikliği duyurmak için kullanılan olay.
const EVENT = 'pg:local-storage';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** localStorage'a güvenli yazma; gizli pencere / kota hatalarında sessizce vazgeçer. */
export function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // depolama kullanılamıyor — yalnızca bu oturumda geçerli kalır
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(EVENT, callback);
  };
}

/**
 * localStorage'daki bir anahtarı ham string olarak okur ve değişikliklere abone olur.
 * Sunucuda ve hidrasyon sırasında `null` döner; effect içinde setState gerektirmez.
 */
export function useLocalStorage(key: string): [string | null, (value: string | null) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const set = useCallback((v: string | null) => writeLocal(key, v), [key]);
  return [value, set];
}
