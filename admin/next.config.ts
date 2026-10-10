import path from "path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/** NEXT_PUBLIC_API_URL mutlak bir adresse origin'i (CSP connect-src için); göreliyse null. */
function apiOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:5001/api";
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Güvenlik başlıkları (frontend/next.config.ts ile aynı politika). 'unsafe-eval' ve HMR
 * websocket'i (ws:) yalnızca geliştirmede; HSTS yalnızca production derlemesinde.
 */
function securityHeaders() {
  const connectSrc = ["'self'", apiOrigin(), "https://api.coingecko.com", ...(isDev ? ["ws:", "wss:"] : [])].filter(Boolean);
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const headers = [
    // Yönetim paneli arama motorlarına kapalı
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
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
  agentRules: false,
  // Docker imajı için: .next/standalone (yalnızca gereken node_modules + server.js)
  output: "standalone",
  // npm workspaces: bağımlılıklar kökteki node_modules'ta → izleme kökü repo kökü
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Ortak paket (packages/shared) TypeScript kaynağı olarak derlenir
  transpilePackages: ["@portfoygo/shared"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

export default nextConfig;
