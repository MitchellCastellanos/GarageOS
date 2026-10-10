import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allow a 4 MiB logo plus multipart overhead; Vercel caps requests at 4.5 MB.
      bodySizeLimit: "4.5mb",
    },
  },
  async headers() {
    return [
      // Approved video posters/thumbnails (≈35-57 KB each): cache a day at the edge/browser, revalidate in the background.
      { source: "/video/:file*.jpg", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      // Attributed video pages and the tracking endpoints must never be cached or indexed.
      { source: "/api/video/:path*", headers: [{ key: "Cache-Control", value: "no-store" }, { key: "X-Robots-Tag", value: "noindex" }] },
    ];
  },
  serverExternalPackages: ["@react-pdf/renderer", "googleapis", "canvas", "sharp", "pdf-lib"],

  images: {
    // Disposable browser QA uses fake loopback storage. Production keeps its
    // existing image optimizer and remote-host allowlist unchanged.
    unoptimized: process.env.NODE_ENV === "development" && process.env.GARAGEOS_LOCAL_QA === "1",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
