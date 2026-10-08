'use client';

import { useEffect, useState } from 'react';

/**
 * Geri sayımlar için şimdiki zaman (ms). Varsayılan olarak dakikada bir güncellenir.
 * Yalnızca istemcide oturum açıldıktan sonra render edilen bileşenlerde kullanılmalı.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
