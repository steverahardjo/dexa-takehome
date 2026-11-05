import type { NextConfig } from "next";

/**
 * The backend is one public process: the gateway. Every `/api/<domain>/*` call
 * is forwarded to it, and the gateway routes to the internal services over TCP,
 * so the browser only ever talks to this origin and no CORS is involved.
 *
 * The gateway also owns authentication, which is why there is no separate
 * service URL for auth, employees or attendance any more.
 */
const gatewayUrl = process.env.GATEWAY_URL ?? "http://localhost:3003";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/login", destination: "/", permanent: false }];
  },
  async rewrites() {
    // Array form: a route handler under `app/api` still wins over the proxy.
    return [
      {
        source: "/api/:path*",
        destination: `${gatewayUrl}/:path*`,
      },
    ];
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  /* config options here */
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
