'use client';

import { useEffect } from 'react';
import { installGlobalErrorReporter, type ClientApp } from '../errors';

/**
 * Kök düzende bir kez çizilir: tarayıcıdaki yakalanmamış hataları ve reddedilmiş promise'leri
 * POST /api/client-errors ucuna bildirir (bkz. @portfoygo/shared/errors). Görsel çıktısı yoktur.
 */
export default function ClientErrorReporter({ app }: { app: ClientApp }) {
  useEffect(() => installGlobalErrorReporter(app), [app]);
  return null;
}
