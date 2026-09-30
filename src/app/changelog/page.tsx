import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
import { Bilingual } from "@/components/marketing/Bilingual";
export const metadata: Metadata = { title: "Changelog · Nouveautés", description: "A summary of the workflows and public resources implemented in GarageOS." };
const ENTRIES = [
  { tag: "Product", title: "The complete shop workflow", items: ["Online booking and front-desk appointments, customers and vehicles with full service history.", "Digital inspections (photos, templates and shareable reports on Pro), estimates with a customer approval trail, and Work Orders with job status and Ready for Pickup.", "Inventory that follows Work Orders and tire storage (Pro), invoices with GST/QST kept per invoice, payments and refunds.", "A customer portal on every plan."], href: "/product", label: "See the Product page" },
  { tag: "Growth & control", title: "Reports, books and reminders", items: ["Overview reports on every plan; advanced reports with CSV export, Accounting Light and QuickBooks Online sync on Pro and Complete.", "Automated maintenance reminders and campaigns, branded email and two-way SMS.", "Roles and permissions, and data import from CSV or Excel."], href: "/features", label: "Explore features" },
  { tag: "Multi-Shop", title: "Several locations, one organization", items: ["Add locations, switch between them and manage who can access each one.", "Consolidated reports and a side-by-side location comparison on the Complete plan."], href: "/pricing", label: "Compare plans" },
  { tag: "Getting started", title: "A 14-day free trial", items: ["Choose your plan during setup and add a payment method — $0 today, with the exact first charge date and amount shown.", "Guides and a Quick Start checklist for setting up your shop."], href: "/get-started", label: "See how to start" },
];
const ENTRIES_FR = [
  { tag: "Produit", title: "Le flux de travail complet de l'atelier", items: ["Réservation en ligne et rendez-vous au comptoir, clients et véhicules avec historique d'entretien complet.", "Inspections numériques (photos, modèles et rapports partageables avec Pro), soumissions avec suivi d'approbation client, et bons de travail avec statut et « Prêt pour ramassage ».", "Inventaire lié aux bons de travail et entreposage de pneus (Pro), factures avec TPS/TVQ conservées par facture, paiements et remboursements.", "Un portail client avec tous les forfaits."], href: "/product", label: "Voir la page Produit" },
  { tag: "Croissance et contrôle", title: "Rapports, comptabilité et rappels", items: ["Rapports de vue d'ensemble avec tous les forfaits; rapports avancés avec export CSV, Comptabilité légère et synchronisation QuickBooks Online avec Pro et Complete.", "Rappels d'entretien automatisés et campagnes, courriels à votre image et textos bidirectionnels.", "Rôles et permissions, et importation de données à partir de CSV ou Excel."], href: "/features", label: "Explorer les fonctionnalités" },
  { tag: "Multi-Shop", title: "Plusieurs emplacements, une organisation", items: ["Ajoutez des emplacements, passez de l'un à l'autre et gérez qui a accès à chacun.", "Rapports consolidés et comparaison côte à côte des emplacements avec le forfait Complete."], href: "/pricing", label: "Comparer les forfaits" },
  { tag: "Pour commencer", title: "Un essai gratuit de 14 jours", items: ["Choisissez votre forfait pendant la configuration et ajoutez un mode de paiement — 0 $ aujourd'hui, avec la date et le montant exacts du premier paiement.", "Des guides et une liste de démarrage rapide pour configurer votre atelier."], href: "/get-started", label: "Voir comment commencer" },
];
function Entries({ entries }: { entries: typeof ENTRIES }) {
  return <section className="mx-auto max-w-3xl space-y-12 px-4 py-16 sm:px-6">{entries.map((entry) => <article key={entry.title} className="border-l-2 border-brand-blue pl-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{entry.tag}</p>
      <h2 className="mt-3 text-xl font-bold text-slate-900">{entry.title}</h2>
      <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed text-slate-600">{entry.items.map((item) => <li key={item}>{item}</li>)}</ul>
      <Link href={entry.href} className="mt-5 inline-block text-sm font-semibold text-brand-blue">{entry.label} →</Link>
    </article>)}</section>;
}
export default function ChangelogPage() {
  return <MarketingPageShell>
    <Bilingual
      en={<div lang="en"><PageHero eyebrow="Product" heading="What's in GarageOS" description="An overview of what GarageOS does today." /><Entries entries={ENTRIES} /></div>}
      fr={<div lang="fr"><PageHero eyebrow="Produit" heading="Ce que contient GarageOS" description="Un aperçu de ce que GarageOS fait aujourd'hui." /><Entries entries={ENTRIES_FR} /></div>}
    />
  </MarketingPageShell>;
}
