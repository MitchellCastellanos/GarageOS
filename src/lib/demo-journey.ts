/**
 * Catálogo de assets del recorrido visual de /demo (taller ficticio «Garage Laurent»).
 * Fuente única reutilizable (homepage/Producto más adelante). La página pública funciona solo con
 * archivos estáticos: lo que NO esté en public/demo/garage-laurent/manifest.json no se muestra
 * (nunca hay imágenes rotas ni capturas inventadas). El manifiesto lo escribe prepare-assets.mjs.
 */
import { minPlanFor, type CapabilityKey, type Plan } from "@/config/entitlements";
import type { MarketingLocale } from "@/lib/marketing-locale";
import type { Localized } from "@/lib/marketing-plans";
import manifestJson from "../../public/demo/garage-laurent/manifest.json";
import messagesJson from "../../public/demo/garage-laurent/messages.json";

export const DEMO_BASE_PATH = "/demo/garage-laurent";

const L = (en: string, fr: string): Localized => ({ en, fr });

export type DemoSectionId = "hero" | "booking" | "inspection" | "approval" | "work" | "invoice" | "follow-up" | "more";
export type DemoDevice = "desktop" | "mobile" | "document";

export type DemoAssetKey =
  | "01-dashboard-desktop" | "02-agenda-desktop" | "03-booking-desktop" | "04-booking-mobile" | "05-booking-form-mobile"
  | "06-confirmation-email" | "07-client-vehicle-history-desktop" | "08-inspection-admin-desktop" | "09-inspection-report-mobile"
  | "10-estimate-editor-desktop" | "11-estimate-customer-mobile" | "12-approval-history-desktop" | "13-work-order-desktop"
  | "14-ready-email" | "15-invoice-pdf-page" | "16-invoice-email" | "17-payment-record-desktop" | "18-customer-portal-mobile"
  | "19-maintenance-reminder-email" | "20-campaign-email" | "21-campaign-editor-desktop" | "22-sms-inbox-desktop"
  | "23-inventory-desktop" | "24-reports-desktop" | "25-tire-storage-desktop";

export interface DemoAssetDef {
  section: DemoSectionId;
  device: DemoDevice;
  /** Capacidad que habilita la función mostrada → insignia de plan mínimo (vía entitlements). */
  capability?: CapabilityKey;
  caption: Localized;
  alt: Localized;
}

const a = (section: DemoSectionId, device: DemoDevice, caption: Localized, alt: Localized, capability?: CapabilityKey): DemoAssetDef =>
  ({ section, device, caption, alt, capability });

// El nombre de archivo es la clave: PNG fuente en docs/demo-journey/captures/{fr,en}/<clave>.png,
// WebP en public/demo/garage-laurent/{fr,en}/<clave>.webp.
export const DEMO_ASSETS: Record<DemoAssetKey, DemoAssetDef> = {
  "01-dashboard-desktop": a("hero", "desktop", L("The shop dashboard: today's work, customers and revenue at a glance.", "Le tableau de bord de l'atelier : travaux du jour, clients et revenus d'un coup d'œil."), L("GarageOS dashboard of Garage Laurent with today's activity", "Tableau de bord GarageOS de Garage Laurent avec l'activité du jour")),
  "02-agenda-desktop": a("booking", "desktop", L("Online bookings land in the agenda, assigned to each mechanic.", "Les réservations en ligne arrivent dans l'agenda, assignées à chaque mécanicien."), L("Day agenda with mechanics and appointments", "Agenda du jour avec mécaniciens et rendez-vous")),
  "03-booking-desktop": a("booking", "desktop", L("The customer's booking page, with the shop's own logo, photos and colours.", "La page de réservation du client, avec le logo, les photos et les couleurs de l'atelier."), L("Garage Laurent online booking page", "Page de réservation en ligne de Garage Laurent"), "bookingPage.advancedDesign"),
  "04-booking-mobile": a("booking", "mobile", L("The same page on a phone.", "La même page sur un téléphone."), L("Booking page on a phone", "Page de réservation sur un téléphone")),
  "05-booking-form-mobile": a("booking", "mobile", L("Service, date and contact details in a few taps.", "Service, date et coordonnées en quelques touches."), L("Booking form on a phone", "Formulaire de réservation sur un téléphone")),
  "06-confirmation-email": a("booking", "document", L("The confirmation email the customer receives, in the shop's identity.", "Le courriel de confirmation que reçoit le client, à l'image de l'atelier."), L("Appointment confirmation email", "Courriel de confirmation de rendez-vous")),
  "07-client-vehicle-history-desktop": a("follow-up", "desktop", L("Customer, vehicle and every linked visit in one record.", "Client, véhicule et chaque visite liée dans un seul dossier."), L("Customer and vehicle history", "Historique du client et du véhicule")),
  "08-inspection-admin-desktop": a("inspection", "desktop", L("The mechanic's checklist, with photos attached to findings.", "La liste de vérification du mécanicien, avec photos jointes aux constats."), L("Digital inspection with attached photos", "Inspection numérique avec photos jointes"), "dvi.photos"),
  "09-inspection-report-mobile": a("inspection", "mobile", L("What the customer sees. Photos are illustrative.", "Ce que voit le client. Les photos sont illustratives."), L("Customer inspection report on a phone", "Rapport d'inspection du client sur un téléphone"), "dvi.customerReport"),
  "10-estimate-editor-desktop": a("approval", "desktop", L("The estimate built from the findings: lines, taxes and total.", "La soumission préparée à partir des constats : lignes, taxes et total."), L("Estimate editor with lines and totals", "Éditeur de soumission avec lignes et totaux")),
  "11-estimate-customer-mobile": a("approval", "mobile", L("The customer reviews and decides on their phone, no login.", "Le client examine et décide sur son téléphone, sans connexion."), L("Customer estimate page on a phone", "Page de soumission du client sur un téléphone")),
  "12-approval-history-desktop": a("approval", "desktop", L("Every decision is recorded with what the customer saw.", "Chaque décision est consignée avec ce que le client a vu."), L("Estimate approval history", "Historique d'approbation de la soumission")),
  "13-work-order-desktop": a("work", "desktop", L("The Work Order: approved lines, mechanic and status.", "Le bon de travail : lignes approuvées, mécanicien et statut."), L("Work Order with lines, mechanic and status", "Bon de travail avec lignes, mécanicien et statut")),
  "14-ready-email": a("work", "document", L("The “ready for pickup” email.", "Le courriel « prêt à récupérer »."), L("Ready for pickup email", "Courriel « prêt à récupérer »")),
  "15-invoice-pdf-page": a("invoice", "document", L("The invoice PDF, with the shop's logo, details and GST/QST.", "La facture PDF, avec le logo, les coordonnées et la TPS/TVQ de l'atelier."), L("Garage Laurent invoice PDF, first page", "Facture PDF de Garage Laurent, première page")),
  "16-invoice-email": a("invoice", "document", L("The invoice email.", "Le courriel de facture."), L("Invoice email", "Courriel de facture")),
  "17-payment-record-desktop": a("invoice", "desktop", L("The payment the shop collected, recorded on the invoice.", "Le paiement encaissé par l'atelier, consigné sur la facture."), L("Recorded payment on an invoice", "Paiement consigné sur une facture")),
  "18-customer-portal-mobile": a("follow-up", "mobile", L("The customer portal: vehicles, estimates and invoices.", "Le portail client : véhicules, soumissions et factures."), L("Customer portal on a phone", "Portail client sur un téléphone")),
  "19-maintenance-reminder-email": a("follow-up", "document", L("The next maintenance, sent when it is due.", "Le prochain entretien, envoyé à l'échéance."), L("Maintenance reminder email", "Courriel de rappel d'entretien"), "reminders.automation"),
  "20-campaign-email": a("more", "document", L("A campaign email to bring customers back.", "Un courriel de campagne pour ramener les clients."), L("Campaign email", "Courriel de campagne"), "communications.campaigns"),
  "21-campaign-editor-desktop": a("more", "desktop", L("The campaign editor.", "L'éditeur de campagne."), L("Campaign editor", "Éditeur de campagne"), "communications.campaigns"),
  "22-sms-inbox-desktop": a("more", "desktop", L("The text-message inbox.", "La boîte de messages texte."), L("SMS inbox", "Boîte de messages texte")),
  "23-inventory-desktop": a("more", "desktop", L("Parts, stock levels and movements.", "Pièces, niveaux de stock et mouvements."), L("Inventory", "Inventaire"), "inventory.manage"),
  "24-reports-desktop": a("more", "desktop", L("Reports for a chosen date range.", "Rapports pour une période choisie."), L("Reports", "Rapports"), "reports.advanced"),
  "25-tire-storage-desktop": a("more", "desktop", L("Stored tire sets and their location.", "Jeux de pneus entreposés et leur emplacement."), L("Tire storage", "Entreposage de pneus"), "tireStorage.manage"),
};

export const DEMO_ASSET_KEYS = Object.keys(DEMO_ASSETS) as DemoAssetKey[];

// ── Manifiesto estático (dimensiones reales; lo escribe prepare-assets.mjs) ─────────────────

interface ManifestEntry {
  width: number;
  height: number;
  /** Reutiliza el asset genuino de otro idioma cuando la vista no tiene variante propia. */
  reuseFrom?: MarketingLocale;
  /** Etiqueta honesta opcional, p. ej. «Another sample visit» o «Staged example». */
  badge?: Localized;
}
interface DemoManifest {
  assets: Record<MarketingLocale, Partial<Record<string, ManifestEntry>>>;
  invoicePdf: Record<MarketingLocale, boolean>;
}
const manifest = manifestJson as unknown as DemoManifest;

export interface ResolvedDemoAsset {
  key: DemoAssetKey;
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  device: DemoDevice;
  badge?: string;
  /** Plan mínimo derivado de entitlements; undefined si la función está en todos los planes. */
  plan?: Plan;
  /** true si se muestra el asset genuino del otro idioma. */
  reused: boolean;
}

export function resolveDemoAsset(key: DemoAssetKey, locale: MarketingLocale): ResolvedDemoAsset | null {
  const def = DEMO_ASSETS[key];
  const own = manifest.assets[locale]?.[key];
  if (!own) return null;
  const from = own.reuseFrom ?? locale;
  const src = manifest.assets[from]?.[key];
  if (!src) return null;
  return {
    key, src: `${DEMO_BASE_PATH}/${from}/${key}.webp`, width: src.width, height: src.height,
    alt: def.alt[locale], caption: def.caption[locale], device: def.device,
    badge: own.badge?.[locale], plan: def.capability ? minPlanFor(def.capability) : undefined, reused: from !== locale,
  };
}

export function invoicePdfUrl(locale: MarketingLocale): string | null {
  return manifest.invoicePdf[locale] ? `${DEMO_BASE_PATH}/${locale}/invoice-camille.pdf` : null;
}

// ── Mensajes SMS (formateadores reales; ver scripts/demo-journey/build-messages.ts) ──────────

export type DemoMessageKey = "confirmation" | "quote" | "ready" | "invoice" | "maintenance";
export interface DemoMessage { text: string; link: string | null; anchor: string }
export function demoMessage(key: DemoMessageKey, locale: MarketingLocale): DemoMessage {
  return (messagesJson as unknown as Record<MarketingLocale, Record<DemoMessageKey, DemoMessage>>)[locale][key];
}

// ── Copy del recorrido ──────────────────────────────────────────────────────────────────────

export interface DemoSectionCopy { id: Exclude<DemoSectionId, "hero">; nav: Localized; title: Localized; benefit: Localized; points: Localized[] }

export const DEMO_SECTIONS: DemoSectionCopy[] = [
  { id: "booking", nav: L("Booking", "Réservation"), title: L("Customers book online, in your shop's look", "Vos clients réservent en ligne, à l'image de votre atelier"),
    benefit: L("Your own logo, photos and colours on a booking page that fills the agenda for you.", "Votre logo, vos photos et vos couleurs sur une page de réservation qui remplit l'agenda pour vous."),
    points: [L("Times follow your hours and each mechanic's availability", "Les heures suivent vos horaires et la disponibilité de chaque mécanicien"), L("The customer gets a confirmation right away", "Le client reçoit une confirmation tout de suite")] },
  { id: "inspection", nav: L("Inspection", "Inspection"), title: L("Inspect, and show what you found", "Inspectez, et montrez ce que vous avez trouvé"),
    benefit: L("A digital checklist for the mechanic and a clear report for the customer.", "Une liste numérique pour le mécanicien et un rapport clair pour le client."),
    points: [L("Photos attach to each finding", "Les photos se joignent à chaque constat"), L("The findings become the estimate", "Les constats deviennent la soumission")] },
  { id: "approval", nav: L("Approval", "Approbation"), title: L("From estimate to approval, in one text message", "De la soumission à l'approbation, en un texto"),
    benefit: L("The customer receives a link, reviews the estimate on their phone and decides.", "Le client reçoit un lien, examine la soumission sur son téléphone et décide."),
    points: [L("No account or login for the customer", "Aucun compte ni connexion pour le client"), L("The decision is recorded with what they saw", "La décision est consignée avec ce qu'ils ont vu")] },
  { id: "work", nav: L("Work", "Travaux"), title: L("Run the work from one Work Order", "Menez le travail depuis un seul bon de travail"),
    benefit: L("Approved lines, the mechanic and the status stay together, and the customer is told when it is ready.", "Les lignes approuvées, le mécanicien et le statut restent ensemble, et le client est avisé quand c'est prêt."),
    points: [L("The front desk sees the status live", "La réception voit le statut en direct"), L("The ready-for-pickup message goes out by text or email", "Le message « prêt à récupérer » part par texto ou courriel")] },
  { id: "invoice", nav: L("Invoice", "Facture"), title: L("Your invoice, with your shop's identity.", "Votre facture, à l'image de votre atelier."),
    benefit: L("The customer gets a text with a link and opens an invoice that carries your logo, details and taxes.", "Le client reçoit un texto avec un lien et ouvre une facture qui porte votre logo, vos coordonnées et vos taxes."),
    points: [L("GST and QST are fixed on the invoice for your books", "La TPS et la TVQ sont figées sur la facture pour votre comptabilité"), L("GarageOS records the payment your shop collected; it does not process cards", "GarageOS consigne le paiement encaissé par votre atelier; il ne traite pas les cartes")] },
  { id: "follow-up", nav: L("Follow-up", "Suivi"), title: L("Keep the vehicle's story, and bring it back", "Gardez l'histoire du véhicule, et ramenez-le"),
    benefit: L("Every visit is linked to the customer and the vehicle, and the next maintenance is already scheduled.", "Chaque visite est liée au client et au véhicule, et le prochain entretien est déjà prévu."),
    points: [L("A customer portal with their vehicles and documents", "Un portail client avec ses véhicules et ses documents"), L("A reminder is tied to the vehicle", "Un rappel est lié au véhicule")] },
  { id: "more", nav: L("More", "Plus"), title: L("Win customers back, and run the shop", "Regagnez vos clients, et gérez l'atelier"),
    benefit: L("Campaigns for retention, plus the owner tools behind the scenes.", "Des campagnes de fidélisation, et les outils du propriétaire en coulisse."),
    points: [] },
];

export interface DemoUiCopy {
  heroTitle: string; heroBody: string; fictional: string; explore: string; trial: string; jumpLabel: string;
  enlarge: string; close: string; fullSize: string; fitScreen: string; viewerLabel: string; exampleMessage: string;
  sampleVisit: string; openPdf: string; openPreview: string; showMore: string; reusedNote: string; plan: (p: string) => string;
  langNote: string; phoneLabel: string; arrowLabel: string; finalTitle: string; finalBody: string; compare: string; contact: string;
  galleryTitle: string; paymentNote: string; shopSide: string; customerSide: string; step: string;
}

export const DEMO_UI: Record<MarketingLocale, DemoUiCopy> = {
  en: {
    heroTitle: "See your shop in action.", heroBody: "Explore Garage Laurent, a fictional Quebec shop, from booking to the next visit.",
    fictional: "Fictional demonstration", explore: "Explore the visit", trial: "Start free trial", jumpLabel: "Jump to a step",
    enlarge: "Enlarge", close: "Close", fullSize: "Full size", fitScreen: "Fit to screen", viewerLabel: "Image viewer", exampleMessage: "Example message",
    sampleVisit: "Another sample visit", openPdf: "Open the sample PDF", openPreview: "Preview the invoice", showMore: "Show more screens",
    reusedNote: "Shown in French: the shop's content is in Quebec French.", plan: (p) => `${p} plan and up`,
    langNote: "Shop names and records are in Quebec French, even when the GarageOS interface is in English.",
    phoneLabel: "Text message example", arrowLabel: "leads to", finalTitle: "See it in your own shop", finalBody: "Start a free trial, compare plans, or tell us what you would like to review.",
    compare: "Compare plans", contact: "Contact us", galleryTitle: "Owner tools", paymentNote: "GarageOS records payments your shop collected (card terminal, cash, e-Transfer or cheque).",
    shopSide: "What the shop sees", customerSide: "What the customer receives", step: "Step",
  },
  fr: {
    heroTitle: "Voyez votre atelier en action.", heroBody: "Explorez Garage Laurent, un atelier québécois fictif, de la réservation à la prochaine visite.",
    fictional: "Démonstration fictive", explore: "Explorer la visite", trial: "Essai gratuit", jumpLabel: "Aller à une étape",
    enlarge: "Agrandir", close: "Fermer", fullSize: "Taille réelle", fitScreen: "Ajuster à l'écran", viewerLabel: "Visionneuse d'images", exampleMessage: "Message d'exemple",
    sampleVisit: "Autre visite d'exemple", openPdf: "Ouvrir le PDF d'exemple", openPreview: "Aperçu de la facture", showMore: "Voir plus d'écrans",
    reusedNote: "", plan: (p) => `Forfait ${p} et plus`,
    langNote: "", phoneLabel: "Exemple de message texte", arrowLabel: "mène à", finalTitle: "Voyez-le dans votre propre atelier", finalBody: "Démarrez un essai gratuit, comparez les forfaits ou dites-nous ce que vous aimeriez examiner.",
    compare: "Comparer les forfaits", contact: "Nous joindre", galleryTitle: "Outils du propriétaire", paymentNote: "GarageOS consigne les paiements encaissés par votre atelier (terminal, comptant, virement ou chèque).",
    shopSide: "Ce que voit l'atelier", customerSide: "Ce que reçoit le client", step: "Étape",
  },
};
