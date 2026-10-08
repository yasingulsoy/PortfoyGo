import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Frontend birim testleri (backend'in kendi vitest yapılandırması backend/ altındadır). */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'backend/**', '.next/**'],
    environment: 'jsdom',
    // tr-TR biçimlendirme / tarih testleri makineden bağımsız olsun
    env: { TZ: 'Europe/Istanbul' },
  },
});
