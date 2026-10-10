import "../globals.css";
import { RootShell } from "@/components/root/RootShell";
import { rootMetadata } from "@/lib/seo/root-metadata";

// Layout raíz del sitio público en francés (/fr/**). Mismo cuerpo que el inglés, con `<html lang="fr-CA">`.
export const metadata = rootMetadata("fr");

export default function FrenchRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootShell locale="fr">{children}</RootShell>;
}
