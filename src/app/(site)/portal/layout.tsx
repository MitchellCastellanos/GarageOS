import type { Metadata } from "next";

// Enlaces con token secreto: no indexar, no cachear y no filtrar la URL (el token) por Referer a terceros.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
