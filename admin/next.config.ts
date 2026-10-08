import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Ortak paket (packages/shared) TypeScript kaynağı olarak derlenir
  transpilePackages: ["@portfoygo/shared"],
  // Yönetim paneli arama motorlarına kapalı
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
