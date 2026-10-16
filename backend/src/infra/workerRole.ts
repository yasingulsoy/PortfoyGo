/**
 * src/worker.ts'in İLK importu: süreç rolünü, diğer modüller (logger vb.) yüklenmeden önce 'worker' yapar.
 * (TypeScript import'ları sırayla require eder; bu dosya ilk olduğu için logger `service` alanını doğru okur.)
 */
if (!process.env.APP_ROLE) {
  process.env.APP_ROLE = 'worker';
}

export {};
