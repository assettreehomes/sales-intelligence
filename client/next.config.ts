import type { NextConfig } from "next";

const trimSlash = (url: string) => url.replace(/\/+$/, "");
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL;
const SUPABASE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Proxy the backend and Supabase through the dashboard's own address
  // (see lib/endpoints.ts).
  async rewrites() {
    return [
      ...(API_ORIGIN
        ? [{ source: "/proxy/api/:path*", destination: `${trimSlash(API_ORIGIN)}/:path*` }]
        : []),
      ...(SUPABASE_ORIGIN
        ? [{ source: "/proxy/supabase/:path*", destination: `${trimSlash(SUPABASE_ORIGIN)}/:path*` }]
        : []),
    ];
  },
  async headers() {
    return [
      {
        source: "/proxy/:path*",
        headers: [{ key: "x-vercel-enable-rewrite-caching", value: "0" }],
      },
    ];
  },
};

export default nextConfig;
