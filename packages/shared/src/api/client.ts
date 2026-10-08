// Backend (Express) API istemcisinin çekirdeği: frontend ve admin uygulamaları ortak kullanır.

// NEXT_PUBLIC_* değişkenleri her uygulamanın kendi derlemesinde gömülür.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

/**
 * Oturum: backend giriş yanıtında httpOnly `pg_session` çerezini set eder; JavaScript token'ı hiç
 * görmez. Tüm istekler `credentials: 'include'` ile gider. Durum değiştiren isteklerde backend
 * CSRF koruması olarak `X-Requested-With: PortfoyGo` başlığını ister (her istekte gönderilir).
 */
const CSRF_HEADERS = { 'X-Requested-With': 'PortfoyGo' } as const;

/** Önceki sürümlerden kalan localStorage/çerez kayıtları (token artık tarayıcı JS'inde tutulmaz). */
const LEGACY_KEYS = ['token', 'user', 'portfolio'];

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * İstemci tarafı oturum durumu. Yalnızca bir oturum kurulduysa (giriş / profil başarılı)
 * 401 yanıtı "oturum düştü" olarak ele alınır ve giriş sayfasına yönlendirilir.
 */
let sessionActive = false;
let loggingOut = false;

export const session = {
  isActive: () => sessionActive,
  setActive(active: boolean) {
    sessionActive = active;
    if (active) loggingOut = false;
  },
  /** Eski sürümden kalan token/kullanıcı kayıtlarını siler. */
  clearLegacy() {
    if (typeof window === 'undefined') return;
    try {
      for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    } catch {}
    document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
  },
};

function handleUnauthorized() {
  if (typeof window === 'undefined' || loggingOut || !sessionActive) return;
  sessionActive = false;
  const path = window.location.pathname;
  window.dispatchEvent(new CustomEvent('auth:logout'));
  if (['/login', '/register', '/forgot-password', '/verify-email'].includes(path)) return;
  loggingOut = true;
  window.location.replace(`/login?redirect=${encodeURIComponent(path)}`);
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit & { /** 401'de oturumu kapatıp yönlendirme yapılmasın */ silent401?: boolean } = {},
): Promise<T> {
  const { silent401 = false, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...CSRF_HEADERS,
    ...(headers as Record<string, string> | undefined),
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, { ...rest, headers: finalHeaders, credentials: 'include' });
  } catch {
    throw new ApiError('Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.', 0);
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && !silent401) handleUnauthorized();
    const message = (body && (body.message || body.error)) || 'Beklenmeyen bir hata oluştu.';
    throw new ApiError(message, response.status);
  }
  return body as T;
}

/** SWR için fetcher: { success, data } zarfını açar. */
export async function swrFetcher<T>(endpoint: string): Promise<T> {
  const json = await apiFetch<any>(endpoint);
  if (json && typeof json === 'object' && 'data' in json) return json.data as T;
  return json as T;
}

export const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
