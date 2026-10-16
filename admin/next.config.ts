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
