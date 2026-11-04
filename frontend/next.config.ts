import type { NextConfig } from "next";

/**
 * `/api/*` is proxied at request time by `app/api/[...path]/route.ts`, which
 * reads `API_URL`. Keeping it out of `next.config.ts` means the built app can
 * point at a different API host without a rebuild.
 */
const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/login", destination: "/", permanent: false }];
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
