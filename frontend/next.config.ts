import type { NextConfig } from "next";

/**
 * The backend runs as three containers. The browser only talks to this origin;
 * these rewrites forward `/api/<domain>/*` to the service that owns it, so no
 * CORS setup is needed and the phone's QR flow keeps working over the LAN.
 */
const authServiceUrl = process.env.AUTH_SERVICE_URL ?? "http://localhost:3001";
const employeeServiceUrl =
  process.env.EMPLOYEE_SERVICE_URL ?? "http://localhost:3002";
const adminServiceUrl =
  process.env.ADMIN_SERVICE_URL ?? "http://localhost:3003";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/login", destination: "/", permanent: false }];
  },
  async rewrites() {
    return {
      afterFiles: [
        {
          source: "/api/auth/:path*",
          destination: `${authServiceUrl}/auth/:path*`,
        },
        {
          source: "/api/admin/:path*",
          destination: `${adminServiceUrl}/admin/:path*`,
        },
        {
          source: "/api/employee/:path*",
          destination: `${employeeServiceUrl}/employee/:path*`,
        },
      ],
      // `fallback` runs after the filesystem routes, so the two QR route
      // handlers keep adding `lanHosts` and stay reachable while the rest of
      // `/api/attendance/*` is proxied.
      fallback: [
        {
          source: "/api/attendance/:path*",
          destination: `${employeeServiceUrl}/attendance/:path*`,
        },
      ],
    };
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
