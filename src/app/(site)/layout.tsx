import type { Metadata } from "next";
import { Oswald } from "next/font/google";
import { Suspense } from "react";
import "../globals.css";
import { APP_NAME } from "@/config/app";
import { getSiteUrl } from "@/lib/seo/site";
import AnalyticsBeacon from "@/components/AnalyticsBeacon";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-oswald",
  display: "swap",
});

const description = "Auto shop management software for independent garages.";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description,
  // Sin `alternates.canonical` ni `openGraph.url` aquí: Next los hereda a TODAS las páginas hijas y cada una
  // pasaría a declarar la home como original. Cada página pública los define con pageMetadata().
  openGraph: {
    title: APP_NAME,
    description,
    siteName: APP_NAME,
    locale: "en_CA",
    alternateLocale: ["fr_CA"],
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: APP_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${oswald.variable}`}>
      <body className="min-h-full font-sans antialiased">
        {children}
        <Suspense fallback={null}>
          <AnalyticsBeacon />
        </Suspense>
      </body>
    </html>
  );
}
