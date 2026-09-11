import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
