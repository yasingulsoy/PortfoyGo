import type { NextConfig } from "next";

// İsteğe bağlı: API'yi frontend ile aynı origin'den sun (oturum çerezi frontend alan adına yazılır).
// API_PROXY_TARGET=https://api.ornek.com ise /api/backend/:path* → ${API_PROXY_TARGET}/api/:path*
// ve NEXT_PUBLIC_API_URL=/api/backend yapılır. Rewrite'lar build sırasında okunur.
// (/api/asset/history gibi Next route'ları etkilenmez.)
const apiProxyTarget = process.env.API_PROXY_TARGET?.trim().replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // next dev'in kökte AGENTS.md üretmesini kapat
  agentRules: false,
  // Ortak paket (packages/shared) TypeScript kaynağı olarak derlenir
  transpilePackages: ["@portfoygo/shared"],
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [{ source: "/api/backend/:path*", destination: `${apiProxyTarget}/api/:path*` }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "assets.coingecko.com" },
      { protocol: "https", hostname: "coin-images.coingecko.com" },
    ],
  },
};

export default nextConfig;
