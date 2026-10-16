import { validateServerEnv } from './config/env';

// Zorunlu ortam değişkenleri yoksa (ör. JWT_SECRET) burada açık bir mesajla çıkılır
validateServerEnv();

// Hata takibi (yalnızca SENTRY_DSN tanımlıysa) — diğer modüllerden önce başlatılır
import { initSentry } from './observability/sentry';
initSentry('api');

// NOT: Route ve middleware kayıtları src/app.ts içindeki createApp()'e taşındı.
// Zamanlanmış işlerin TANIMLARI src/jobs/definitions.ts'tedir (API ve worker ortak kullanır); yeni iş oraya eklenir.
// Bu dosyada yalnızca sunucu başlatma + (RUN_JOBS açıksa) işlerin zamanlanması var.
import { createApp, getAllowedOrigins } from './app';
import { activeProviders } from './providers';
import { jobs } from './services/jobs';
import { CRON_TZ, registerAllJobs, runStartupJobs } from './jobs/definitions';
import { configureJobRuntime } from './jobs/runtime';
import { isRedisEnabled } from './infra/redis';
import { INSTANCE_ID, runJobsEnabled } from './infra/runtime';
import { logger } from './utils/logger';

const app = createApp();
const PORT = parseInt(process.env.PORT || '5001', 10);

// ---------------------------------------------------------------------------
// Zamanlanmış işler (services/jobs.ts kaydı). İşler her durumda KAYDEDİLİR (admin paneli listesi ve
// "Şimdi çalıştır"); RUN_JOBS açıksa (varsayılan) bu süreçte zamanlanır da. Ayrı worker (src/worker.ts)
// kullanılan dağıtımda API örneklerinde RUN_JOBS=0 yapın. Her çalıştırma PostgreSQL advisory lock ile
// korunur: aynı iş iki örnekte aynı anda çalışmaz (bkz. jobs/runtime.ts).
// ---------------------------------------------------------------------------
registerAllJobs(jobs);
configureJobRuntime(jobs);

if (runJobsEnabled()) {
  jobs.start(CRON_TZ);
  runStartupJobs(jobs);
} else {
  logger.info('[server] RUN_JOBS=0: zamanlanmış işler bu süreçte çalışmıyor (worker: npm run start:worker)');
  if (!isRedisEnabled()) {
    logger.warn(
      '[server] RUN_JOBS=0 ve REDIS_URL yok: worker\'ın ürettiği canlı olaylar (bildirim, Arena) bu örnekteki SSE ' +
        'istemcilerine ulaşmaz ve admin panelindeki iş durumları bu örnekte görünmez. Ayrı worker için REDIS_URL tanımlayın.'
    );
  }
}

app.listen(PORT, () => {
  console.log(`[server] API ${PORT} portunda çalışıyor (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
  console.log(`[server] CORS izinli origin sayısı: ${getAllowedOrigins().length}`);
  console.log(`[server] Veri sağlayıcıları: ${Object.entries(activeProviders()).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  console.log(
    `[server] Örnek ${INSTANCE_ID} · zamanlanmış işler: ${runJobsEnabled() ? 'bu süreçte' : 'kapalı (RUN_JOBS=0)'} · Redis: ${isRedisEnabled() ? 'açık' : 'kapalı'}`
  );
});
