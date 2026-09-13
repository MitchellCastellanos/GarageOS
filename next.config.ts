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

  // TODO(garageos): temporal mientras se termina de adaptar el código
  // importado (ver docs/reuse-audit.md). Quitar antes de producción.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
