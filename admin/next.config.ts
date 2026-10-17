import path from "path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Tüm yanıtlara eklenen statik güvenlik başlıkları. Content-Security-Policy (istek başına nonce)
 * sayfa yanıtlarına src/proxy.ts'te eklenir (frontend ile aynı politika: packages/shared/src/csp.ts).
 * HSTS yalnızca production derlemesinde.
 */
function securityHeaders() {
  const headers = [
    // Yönetim paneli arama motorlarına kapalı
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
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
  agentRules: false,
  // Docker imajı için: .next/standalone (yalnızca gereken node_modules + server.js)
  output: "standalone",
  // npm workspaces: bağımlılıklar kökteki node_modules'ta → izleme kökü repo kökü
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Ortak paket (packages/shared) TypeScript kaynağı olarak derlenir
  transpilePackages: ["@portfoygo/shared"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders() },
      { source: "/logos/:path*", headers: logoSandboxHeaders },
      { source: "/logos/:type(stock|crypto|currency|commodity)/:file", headers: logoCacheHeaders },
    ];
  },
};

export default nextConfig;
