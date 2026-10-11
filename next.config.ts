import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright는 서버(API route)에서만 쓰므로 번들에서 제외
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
