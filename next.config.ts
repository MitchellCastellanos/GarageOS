import type { NextConfig } from "next";
import { PRIVATE_HEADER_SOURCES, TOKEN_HEADER_SOURCES } from "./src/lib/privacy/private-paths";
import { LEGACY_GUIDE_REDIRECTS } from "./src/lib/help/legacy-redirects";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allow a 4 MiB logo plus multipart overhead; Vercel caps requests at 4.5 MB.
      bodySizeLimit: "4.5mb",
    },
  },
  // 301 permanentes: las guías históricas viven ahora en el Centro de ayuda (mapa en src/lib/help/legacy-map.ts).
  async redirects() {
    return LEGACY_GUIDE_REDIRECTS.map((r) => ({ ...r, statusCode: 301 }));
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
      // Shareable video pages (/watch/{en,fr}[/teaser]?t=<token>): the page URL carries an attribution token, so it must not
      // leave the origin through Referer (the MP4 host may be a third-party CDN). `same-origin` rather than `no-referrer` for the
      // reason above (`Origin: null` on same-origin POSTs would break /api/track's same-site check and any origin-checked POST).
      // Never indexable or cached (metadata already says noindex; this also covers errors/non-HTML). `/watch` is deliberately NOT
      // a private prefix: it stays crawlable in robots.txt so crawlers can see the noindex.
      {
        source: "/watch/:path*",
        headers: [
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      { source: "/watch/:path*", has: [{ type: "query", key: "t" }], headers: [{ key: "Cache-Control", value: "private, no-store" }] },
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
