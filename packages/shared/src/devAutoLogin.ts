/**
 * Yalnızca yerel geliştirme: oturum yoksa giriş ekranı atlanır ve demo hesabıyla otomatik giriş yapılır.
 *
 * Güvenlik: bu yalnızca `next dev` (NODE_ENV=development) altında çalışır; production derlemesinde ölü koddur.
 * Asıl kapı backend'dedir — /api/auth/dev-login yalnızca yerel veritabanına bağlıyken açıktır (aksi halde 404),
 * yani bu yardımcı canlı ortamda hiçbir şey yapamaz.
 *
 * Kapatmak için: NEXT_PUBLIC_DEV_AUTO_LOGIN=0, adres çubuğuna `?manuel` eklemek ya da çıkış yapmak
 * (çıkıştan sonra aynı sekmede otomatik giriş durur; giriş ekranı test edilebilir). Otomasyon (Playwright /
 * E2E) tarayıcılarında çalışmaz.
 */
export const DEV_AUTO_LOGIN_USER = 'demo';

const PAUSE_KEY = 'pg_dev_auto_login_off';

export function devAutoLoginEnabled(): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  if (process.env.NEXT_PUBLIC_DEV_AUTO_LOGIN === '0') return false;
  if (typeof window === 'undefined') return false;
  if (navigator.webdriver) return false;
  if (new URLSearchParams(window.location.search).has('manuel')) return false;
  try {
    if (window.sessionStorage.getItem(PAUSE_KEY) === '1') return false;
  } catch {
    // depolama kapalıysa otomatik giriş yine çalışır
  }
  return true;
}

/** Çıkış sonrası: bu sekmede otomatik girişi durdur (giriş ekranı görünsün). */
export function pauseDevAutoLogin(): void {
  if (process.env.NODE_ENV !== 'development') return;
  try {
    window.sessionStorage.setItem(PAUSE_KEY, '1');
  } catch {
    // yok say
  }
}

/** Elle giriş yapıldığında duraklatmayı kaldır. */
export function resumeDevAutoLogin(): void {
  if (process.env.NODE_ENV !== 'development') return;
  try {
    window.sessionStorage.removeItem(PAUSE_KEY);
  } catch {
    // yok say
  }
}
