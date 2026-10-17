import type { NextConfig } from "next";
import { AUTH_PRIVATE_HEADERS } from "./src/lib/auth";

const nextConfig: NextConfig = {
  async headers() {
    return ["/moderation", "/advisor"].map(source => ({ source, headers: Object.entries(AUTH_PRIVATE_HEADERS).map(([key, value]) => ({ key, value })) }));
  },
};

export default nextConfig;
