// Content-Security-Policy: frontend ve admin uygulamalarının proxy.ts'i her sayfa isteğinde kullanır.
//
// Next 16 (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md):
//  - proxy her istekte yeni bir nonce üretir; nonce'u hem İSTEK başlığındaki CSP'ye (Next render sırasında
//    oradan okur ve kendi betiklerine ekler) hem `x-nonce` başlığına (kök layout next-themes betiğine verir)
//    hem de YANIT başlığına yazar. Nonce'lu CSP sayfaların dinamik render edilmesini gerektirir (kök layout
//    `headers()` okur).
//  - script-src: 'nonce-…' + 'strict-dynamic' — yalnızca nonce'lu betikler ve onların yüklediği parçalar
//    (Next chunk'ları) çalışır. 'self' yalnızca 'strict-dynamic' desteklemeyen eski tarayıcılar için geri dönüş.
//    Geliştirmede React hata ayıklaması için 'unsafe-eval' gerekir (production'da yok).
//  - style-src 'unsafe-inline': React `style={…}` öznitelikleri, lightweight-charts ve next-themes'in geçici
//    <style> etiketi satır içi stil kullanır; stil enjeksiyonu betik çalıştıramaz. (style-src'ye nonce EKLENMEZ:
//    nonce varken tarayıcılar 'unsafe-inline'ı yok sayar.)
//  - img-src https:: haber görselleri önceden bilinmeyen RSS alan adlarından gelir.
//  - connect-src: kendi origin'i + API origin'i (fetch ve SSE/EventSource). CoinGecko/Finnhub yalnızca
//    sunucu tarafında çağrılır, tarayıcıya izin verilmez.
//  - Yazı tipleri next/font ile kendi sunucumuzdan (/_next/static/media) gelir: Google Fonts'a izin YOK.

export interface CspOptions {
  nonce: string;
  /** NODE_ENV !== 'production' */
  isDev: boolean;
  /** NEXT_PUBLIC_API_URL (mutlak ise origin'i connect-src'ye eklenir; göreliyse 'self' yeterli) */
  apiUrl?: string | null;
  /** Varsayılan "'none'" (hiçbir sitede çerçevelenemez). OBS / yayın katmanı için '*'. */
  frameAncestors?: string;
}

/** API adresinin origin'i (mutlak değilse null). */
export function apiOriginOf(apiUrl: string | null | undefined): string | null {
  const raw = (apiUrl || '').trim() || 'http://localhost:5001/api';
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** Kriptografik olarak rastgele, istek başına nonce (base64). Edge ve Node çalışma ortamlarında çalışır. */
export function createNonce(): string {
  return btoa(crypto.randomUUID());
}

export function buildCsp({ nonce, isDev, apiUrl, frameAncestors = "'none'" }: CspOptions): string {
  const api = apiOriginOf(apiUrl);
  const connect = ["'self'", api, ...(isDev ? ['ws:', 'wss:'] : [])].filter(Boolean);
  // https bir API'de (ya da aynı origin'de) karışık içerik yükseltmesi güvenli; http://localhost'ta kırar
  const upgrade = !isDev && (!api || api.startsWith('https:'));
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    ...(upgrade ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}
