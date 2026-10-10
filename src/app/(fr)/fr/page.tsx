import type { Metadata } from "next";
import { HomeView } from "@/components/marketing/HomeView";
import { MARKETING_DICTIONARIES } from "@/lib/marketing-locale";
import { pageMetadata } from "@/lib/seo/metadata";

// Même cache que la page d'accueil anglaise (liste de vidéos publiées).
export const revalidate = 300;

// Texte tiré du dictionnaire français pour ne pas dupliquer (ni faire diverger) la terminologie.
export const metadata: Metadata = pageMetadata({
  path: "/fr",
  title: "Logiciel de gestion pour ateliers mécaniques",
  description: MARKETING_DICTIONARIES.fr.meta.description,
});

export default function HomePageFr() {
  return <HomeView />;
}
