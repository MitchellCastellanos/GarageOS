import "../globals.css";
import { RootShell } from "@/components/root/RootShell";
import { rootMetadata } from "@/lib/seo/root-metadata";

// Layout raíz de todo lo que no es francés público: marketing en inglés, panel (/admin), plataforma, portal, páginas
// de reserva, etc. El francés público vive en el grupo (fr), con su propio layout raíz (`<html lang="fr-CA">`).
export const metadata = rootMetadata("en");

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootShell locale="en">{children}</RootShell>;
}
