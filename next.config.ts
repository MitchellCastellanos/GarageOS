import type { NextConfig } from "next";
import { PRIVATE_HEADER_SOURCES, TOKEN_HEADER_SOURCES } from "./src/lib/privacy/private-paths";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allow a 4 MiB logo plus multipart overhead; Vercel caps requests at 4.5 MB.
      bodySizeLimit: "4.5mb",
    },
  },
  async headers() {
    return [
      // App, APIs and token links: never indexable (also covers non-HTML responses such as PDFs and 404s for a bad
      // token). Not a security control; access is protected by the token itself or the session.
      ...PRIVATE_HEADER_SOURCES.map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      })),
      // Token links must not leak their URL through Referer. `same-origin` (not `no-referrer`) on purpose: with
      // `no-referrer` browsers send `Origin: null` on same-origin POSTs, which would break Server Actions (quote approval).
      ...TOKEN_HEADER_SOURCES.map((source) => ({
        source,
        headers: [{ key: "Referrer-Policy", value: "same-origin" }],
      })),
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
