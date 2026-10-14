import type { Metadata } from "next";
import ContactPage from "@/app/(site)/contact/page";
import { pageMetadata } from "@/lib/seo/metadata";

// Brouillon noindex (route "planned"): même composant que la page anglaise, rendu en français par la route.
export const metadata: Metadata = pageMetadata({
  path: "/fr/contact",
  title: "Nous joindre",
  description: "Communiquez avec l'équipe GarageOS pour toute question sur les forfaits, la configuration ou une démonstration pour votre atelier.",
});

export default ContactPage;
