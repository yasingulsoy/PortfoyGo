import path from "path";
import type { NextConfig } from "next";

// İsteğe bağlı: API'yi frontend ile aynı origin'den sun (oturum çerezi frontend alan adına yazılır).
// API_PROXY_TARGET=https://api.ornek.com ise /api/backend/:path* → ${API_PROXY_TARGET}/api/:path*
// ve NEXT_PUBLIC_API_URL=/api/backend yapılır. Rewrite'lar build sırasında okunur.
// (/api/asset/history gibi Next route'ları etkilenmez.)
const apiProxyTarget = process.env.API_PROXY_TARGET?.trim().replace(/\/+$/, "");

const isDev = process.env.NODE_ENV !== "production";

/**
 * Tüm yanıtlara eklenen statik güvenlik başlıkları. Content-Security-Policy (istek başına nonce) ve
 * X-Frame-Options sayfa yanıtlarına src/proxy.ts'te eklenir (/yayin/** OBS katmanı çerçevelenebilir kalır).
 * HSTS yalnızca production derlemesinde (tarayıcılar HTTP üzerinden gelen HSTS'yi zaten yok sayar).
 */
function securityHeaders() {
  const headers = [
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ];
  if (!isDev) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
  }
  return headers;
}

/**
 * public/logos (varlık logoları, scripts/logos/fetch-logos.mjs): uygulama adresleri içerik özetli (?v=…) kullanır,
 * bu yüzden SVG'ler uzun süre önbelleklenebilir. Doğrudan açılan bir SVG'de betik / dış kaynak / form çalışamaz
 * (dosyalar zaten temizlenmiş; bu ek savunma hattıdır).
 */
const logoCacheHeaders = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
const logoSandboxHeaders = [{ key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; sandbox" }];

const nextConfig: NextConfig = {
  // next dev'in kökte AGENTS.md üretmesini kapat
  agentRules: false,
  // Docker imajı için: .next/standalone (yalnızca gereken node_modules + server.js)
  output: "standalone",
  // npm workspaces: bağımlılıklar kökteki node_modules'ta → izleme kökü repo kökü
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Ortak paket (packages/shared) TypeScript kaynağı olarak derlenir
  transpilePackages: ["@portfoygo/shared"],
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [{ source: "/api/backend/:path*", destination: `${apiProxyTarget}/api/:path*` }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders() },
      { source: "/logos/:path*", headers: logoSandboxHeaders },
      { source: "/logos/:type(stock|crypto|currency|commodity)/:file", headers: logoCacheHeaders },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "assets.coingecko.com" },
      { protocol: "https", hostname: "coin-images.coingecko.com" },
    ],
  },
};

export default nextConfig;
