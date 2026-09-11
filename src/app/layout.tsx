import type { Metadata } from "next";
import { Oswald } from "next/font/google";
import "./globals.css";
import { APP_NAME, getAppUrl } from "@/config/app";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-oswald",
  display: "swap",
});

const description = "Gestión diaria para talleres mecánicos independientes.";

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description,
  alternates: {
    canonical: getAppUrl(),
  },
  openGraph: {
    title: APP_NAME,
    description,
    url: getAppUrl(),
    siteName: APP_NAME,
    locale: "fr_CA",
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
    <html lang="es" className={`h-full ${oswald.variable}`}>
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}
