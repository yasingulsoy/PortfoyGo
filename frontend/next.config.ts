import path from "path";
import type { NextConfig } from "next";

// İsteğe bağlı: API'yi frontend ile aynı origin'den sun (oturum çerezi frontend alan adına yazılır).
// API_PROXY_TARGET=https://api.ornek.com ise /api/backend/:path* → ${API_PROXY_TARGET}/api/:path*
// ve NEXT_PUBLIC_API_URL=/api/backend yapılır. Rewrite'lar build sırasında okunur.
// (/api/asset/history gibi Next route'ları etkilenmez.)
const apiProxyTarget = process.env.API_PROXY_TARGET?.trim().replace(/\/+$/, "");

const isDev = process.env.NODE_ENV !== "production";

/** NEXT_PUBLIC_API_URL mutlak bir adresse origin'i (CSP connect-src için); göreliyse ('/api/backend') null. */
function apiOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:5001/api";
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Güvenlik başlıkları. CSP nonce'suz tutulur (Next hidrasyon betikleri satır içi olduğu için
 * script-src 'unsafe-inline'); 'unsafe-eval' ve HMR websocket'i (ws:) yalnızca geliştirmede.
 * HSTS yalnızca production derlemesinde (tarayıcılar HTTP üzerinden gelen HSTS'yi zaten yok sayar).
 */
function securityHeaders() {
  const connectSrc = ["'self'", apiOrigin(), "https://api.coingecko.com", ...(isDev ? ["ws:", "wss:"] : [])].filter(Boolean);
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Haber görselleri harici RSS alan adlarından gelir (önceden bilinmiyor) → https:
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const headers = [
    { key: "Content-Security-Policy", value: csp },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
