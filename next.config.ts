import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allow a 4 MiB logo plus multipart overhead; Vercel caps requests at 4.5 MB.
      bodySizeLimit: "4.5mb",
    },
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
