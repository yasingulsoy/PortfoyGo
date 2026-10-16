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
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "assets.coingecko.com" },
      { protocol: "https", hostname: "coin-images.coingecko.com" },
    ],
  },
};

export default nextConfig;
