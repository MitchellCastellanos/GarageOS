/**
 * Contenido bilingüe (EN/FR) de las páginas públicas Features, Product e Integrations (Block 14).
 * Cada función/etiqueta de plan sale de src/config/entitlements.ts (`gate`), así que la insignia "Pro"/"Complete"
 * nunca contradice lo que el código hace cumplir. Solo se anuncia lo que existe en el producto.
 */
import { minPlanFor, type CapabilityKey, type Plan } from "@/config/entitlements";
import type { Localized } from "@/lib/marketing-plans";
import type { MarketingLocale } from "@/lib/marketing-locale";

const L = (en: string, fr: string): Localized => ({ en, fr });

export interface PageItem {
  icon: string;
  title: Localized;
  description: Localized;
  /** Capacidad que la habilita; determina la insignia de plan (Core = sin insignia). */
  gate?: CapabilityKey;
}
export interface PageGroup {
  id: string;
  title: Localized;
  description: Localized;
  items: PageItem[];
}

/** Plan mínimo de un ítem (Core si no tiene gate). */
export function itemMinPlan(item: { gate?: CapabilityKey }): Plan {
  return item.gate ? minPlanFor(item.gate) : "CORE";
}

export const PLAN_BADGE: Record<Exclude<Plan, "CORE">, Localized> = {
  PRO: L("Pro & Complete", "Pro et Complete"),
  COMPLETE: L("Complete", "Complete"),
};

// ── Features ────────────────────────────────────────────────

export const FEATURES_HERO: Record<MarketingLocale, { eyebrow: string; heading: string; description: string; meta: { title: string; description: string } }> = {
  en: {
    eyebrow: "Features",
    heading: "Every tool your shop actually uses.",
    description: "From the first booking to the next reminder, GarageOS connects the customer, the vehicle, the work and the money. Plan badges show what needs Pro or Complete.",
    meta: { title: "Features", description: "Everything GarageOS gives your shop — booking, inspections, estimates and approvals, Work Orders, inventory, invoicing, reports, QuickBooks and Multi-Shop." },
  },
  fr: {
    eyebrow: "Fonctionnalités",
    heading: "Tous les outils que votre atelier utilise vraiment.",
    description: "De la première réservation au prochain rappel, GarageOS relie le client, le véhicule, le travail et l'argent. Les pastilles indiquent ce qui demande Pro ou Complete.",
    meta: { title: "Fonctionnalités", description: "Tout ce que GarageOS offre à votre atelier — réservation, inspections, soumissions et approbations, bons de travail, inventaire, facturation, rapports, QuickBooks et multi-atelier." },
  },
};

export const FEATURE_GROUPS: PageGroup[] = [
  {
    id: "schedule",
    title: L("Schedule & customers", "Rendez-vous et clients"),
    description: L("Bring the job in and keep the customer and vehicle record straight from the start.", "Accueillez le travail et gardez le dossier du client et du véhicule impeccable dès le départ."),
    items: [
      { icon: "calendar", title: L("Online booking", "Réservation en ligne"), description: L("A booking page in your shop's logo and colors where customers request a time that fits your hours.", "Une page de réservation à vos couleurs où les clients demandent une heure qui respecte vos horaires.") },
      { icon: "calendar", title: L("Front-desk appointments", "Rendez-vous à la réception"), description: L("Schedule and manage appointments from the shop calendar, with mechanic assignment.", "Planifiez et gérez les rendez-vous depuis le calendrier de l'atelier, avec assignation d'un mécanicien.") },
      { icon: "users", title: L("Customers & vehicles", "Clients et véhicules"), description: L("Every customer and vehicle in one place, with communication preferences and full service history.", "Chaque client et chaque véhicule au même endroit, avec préférences de communication et historique complet.") },
      { icon: "upload", title: L("Import your data", "Importez vos données"), description: L("Bring customers and vehicles over from CSV or Excel with a preview, duplicate detection and an error report. Pro adds inventory and larger files.", "Transférez clients et véhicules depuis un fichier CSV ou Excel avec aperçu, détection des doublons et rapport d'erreurs. Pro ajoute l'inventaire et les fichiers plus volumineux."), gate: undefined },
      { icon: "smartphone", title: L("Customer portal", "Portail client"), description: L("A secure link where customers see their vehicles, appointments, estimates, invoices and history on their phone — and answer estimates.", "Un lien sécurisé où les clients voient leurs véhicules, rendez-vous, soumissions, factures et historique sur leur téléphone — et répondent aux soumissions.") },
    ],
  },
  {
    id: "inspect",
    title: L("Inspect & authorize", "Inspecter et faire approuver"),
    description: L("Turn what the vehicle needs into a clear estimate and a documented customer decision.", "Transformez les besoins du véhicule en soumission claire et en décision documentée du client."),
    items: [
      { icon: "clipboard", title: L("Digital inspections (DVI)", "Inspections numériques (DVI)"), description: L("A standard checklist with condition and notes per item, and an estimate created from the findings.", "Une liste de vérification standard avec état et notes par élément, et une soumission créée à partir des constats.") },
      { icon: "camera", title: L("Advanced DVI", "DVI avancé"), description: L("Photos on findings, reusable inspection templates and a report you can share with the customer.", "Photos sur les constats, modèles d'inspection réutilisables et rapport à partager avec le client."), gate: "dvi.photos" },
      { icon: "file", title: L("Itemized estimates", "Soumissions détaillées"), description: L("Services and parts with quantities and prices, with Canadian taxes calculated for you.", "Services et pièces avec quantités et prix, taxes canadiennes calculées pour vous.") },
      { icon: "shield", title: L("Customer approval trail", "Suivi de l'approbation du client"), description: L("Customers accept or decline online; GarageOS keeps a time-stamped record of exactly what they saw.", "Les clients acceptent ou refusent en ligne; GarageOS conserve un enregistrement horodaté de ce qu'ils ont vu.") },
    ],
  },
  {
    id: "run",
    title: L("Run the job", "Exécuter le travail"),
    description: L("Keep the front desk and the shop floor aligned on what's approved and what's next.", "Gardez la réception et l'atelier alignés sur ce qui est approuvé et sur la suite."),
    items: [
      { icon: "wrench", title: L("Work Orders", "Bons de travail"), description: L("Approved estimates become Work Orders with the customer's concern, parts and labour lines and an assigned mechanic.", "Les soumissions approuvées deviennent des bons de travail avec la demande du client, les pièces, la main-d'œuvre et le mécanicien assigné.") },
      { icon: "bell", title: L("Job status & Ready for Pickup", "Statut des travaux et « Prêt à récupérer »"), description: L("Track each job from check-in to done and tell the customer by email or text when the vehicle is ready.", "Suivez chaque travail de la réception à la fin et avisez le client par courriel ou texto quand le véhicule est prêt.") },
      { icon: "package", title: L("Inventory that follows the job", "Un inventaire qui suit le travail"), description: L("Track stock and movements; parts used on a Work Order come off inventory automatically, and returns put them back.", "Suivez le stock et les mouvements; les pièces utilisées dans un bon de travail sortent automatiquement de l'inventaire, et les retours les remettent."), gate: "inventory.manage" },
      { icon: "tire", title: L("Tire storage", "Entreposage de pneus"), description: L("Check seasonal tire sets in and out with location, condition and history, tied to the customer and vehicle.", "Enregistrez l'entrée et la sortie des pneus saisonniers avec emplacement, état et historique, liés au client et au véhicule."), gate: "tireStorage.manage" },
    ],
  },
  {
    id: "retain",
    title: L("Communicate & retain", "Communiquer et fidéliser"),
    description: L("Keep customers informed today, and bring them back for the next visit.", "Gardez les clients informés aujourd'hui et ramenez-les pour la prochaine visite."),
    items: [
      { icon: "mail", title: L("Branded email", "Courriels à votre image"), description: L("Appointment, estimate and invoice emails go out under your shop's name, logo and reply address.", "Les courriels de rendez-vous, de soumission et de facture partent sous le nom, le logo et l'adresse de réponse de votre atelier.") },
      { icon: "message", title: L("Two-way SMS inbox", "Boîte SMS bidirectionnelle"), description: L("Text customers from a dedicated shop number and read their replies in one inbox. A monthly SMS allowance is included.", "Envoyez des textos aux clients depuis un numéro dédié à l'atelier et lisez leurs réponses dans une seule boîte. Une allocation mensuelle de SMS est incluse.") },
      { icon: "calendarClock", title: L("Maintenance reminders", "Rappels d'entretien"), description: L("Attach the next service to the customer and vehicle and send the reminder when it's due.", "Associez le prochain entretien au client et au véhicule et envoyez le rappel à l'échéance.") },
      { icon: "repeat", title: L("Automated reminders", "Rappels automatisés"), description: L("Recurring rules create reminders from the services you complete and send them by the customer's preferred channel.", "Des règles récurrentes créent des rappels à partir des services effectués et les envoient par le canal préféré du client."), gate: "reminders.automation" },
      { icon: "megaphone", title: L("Campaigns", "Campagnes"), description: L("Reach segments such as customers due for service, with consent and opt-outs respected.", "Rejoignez des segments comme les clients dont l'entretien approche, en respectant le consentement et les désabonnements."), gate: "communications.campaigns" },
      { icon: "globe", title: L("Your own domain & sender", "Votre propre domaine et expéditeur"), description: L("Send from your own domain and customize the booking page with templates and typography.", "Envoyez depuis votre propre domaine et personnalisez la page de réservation avec des modèles et une typographie."), gate: "branding.customDomain" },
    ],
  },
  {
    id: "money",
    title: L("Invoice & get paid", "Facturer et être payé"),
    description: L("Close out the job cleanly, with taxes and payments recorded the way accountants expect.", "Terminez le travail proprement, avec taxes et paiements consignés comme les comptables l'attendent."),
    items: [
      { icon: "receipt", title: L("Invoices & receipts", "Factures et reçus"), description: L("Branded PDF invoices created from the estimate or Work Order, with GST/QST and other taxes fixed on each invoice.", "Factures PDF à votre image créées à partir de la soumission ou du bon de travail, avec TPS/TVQ et autres taxes figées sur chaque facture.") },
      { icon: "card", title: L("Payments & refunds", "Paiements et remboursements"), description: L("Record card, cash, Interac e-Transfer and cheque payments collected by your shop, and issue full or partial refunds. GarageOS records payments; it doesn't process cards.", "Consignez les paiements par carte, comptant, virement Interac et chèque encaissés par votre atelier, et émettez des remboursements complets ou partiels. GarageOS consigne les paiements; il ne traite pas les cartes.") },
      { icon: "banknote", title: L("Cash drawer", "Caisse"), description: L("Keep a simple record of cash in and out alongside your invoices.", "Tenez un registre simple des entrées et sorties d'argent comptant en parallèle de vos factures.") },
    ],
  },
  {
    id: "books",
    title: L("Reports & books", "Rapports et comptabilité"),
    description: L("See how the business is doing, and hand your accountant clean numbers.", "Voyez comment va l'entreprise et remettez des chiffres propres à votre comptable."),
    items: [
      { icon: "chart", title: L("Overview reports", "Rapports d'aperçu"), description: L("Paid revenue, outstanding balances, jobs opened and new customers for this month, last month or the last 30 days.", "Revenus encaissés, soldes à recevoir, travaux ouverts et nouveaux clients pour ce mois-ci, le mois dernier ou les 30 derniers jours.") },
      { icon: "chart", title: L("Advanced reports", "Rapports avancés"), description: L("Sales, receivables aging, jobs and quotes, customers and inventory for any date range, with CSV export.", "Ventes, âge des comptes à recevoir, travaux et soumissions, clients et inventaire pour toute période, avec export CSV."), gate: "reports.advanced" },
      { icon: "book", title: L("Accounting Light", "Comptabilité allégée"), description: L("Sales and tax summaries (GST/QST), payments and refunds by method, an activity log and accountant-ready CSV exports. Not a general ledger.", "Sommaires des ventes et des taxes (TPS/TVQ), paiements et remboursements par mode, journal d'activité et exports CSV pour le comptable. Ce n'est pas un grand livre."), gate: "accounting.light" },
      { icon: "plug", title: L("QuickBooks Online sync", "Synchronisation QuickBooks Online"), description: L("Connect QuickBooks Online and sync customers, invoices, payments and refunds without retyping.", "Connectez QuickBooks Online et synchronisez clients, factures, paiements et remboursements sans ressaisie."), gate: "quickbooks.sync" },
    ],
  },
  {
    id: "team",
    title: L("Team & Multi-Shop", "Équipe et multi-atelier"),
    description: L("Give each person the right access — and run several locations as one business.", "Donnez à chacun le bon accès — et gérez plusieurs emplacements comme une seule entreprise."),
    items: [
      { icon: "userCog", title: L("Roles & access", "Rôles et accès"), description: L("Owner, mechanic and viewer roles keep finances and settings with the people who need them.", "Les rôles propriétaire, mécanicien et lecture seule gardent les finances et les paramètres entre les mains de ceux qui en ont besoin.") },
      { icon: "lock", title: L("Fine-grained permissions", "Permissions détaillées"), description: L("Grant or revoke specific abilities per team member, such as reports or campaigns.", "Accordez ou retirez des capacités précises par membre de l'équipe, comme les rapports ou les campagnes."), gate: "permissions.advanced" },
      { icon: "building", title: L("Multi-Shop", "Multi-atelier"), description: L("Add locations under one organization, switch between them in a click and manage who can access each one. Every location keeps its own customers, work and invoices.", "Ajoutez des emplacements sous une même organisation, passez de l'un à l'autre en un clic et gérez qui a accès à chacun. Chaque emplacement garde ses propres clients, travaux et factures."), gate: "organization.multiLocation" },
      { icon: "chart", title: L("Consolidated reporting", "Rapports consolidés"), description: L("See every location together or one at a time, and compare sales, jobs and customers side by side.", "Voyez tous les emplacements ensemble ou un à la fois, et comparez ventes, travaux et clients côte à côte."), gate: "reports.multiLocation" },
    ],
  },
];

// ── Product ─────────────────────────────────────────────────

export interface ProductStep { icon: string; title: Localized; description: Localized }

export const PRODUCT_COPY: Record<MarketingLocale, {
  meta: { title: string; description: string };
  eyebrow: string; heading: string; description: string;
  workflowTitle: string; workflowIntro: string; step: string;
  customerTitle: string; customerIntro: string;
  frontEyebrow: string; frontTitle: string; frontBody: string; simpleTitle: string; simpleBody: string;
  managementTitle: string; managementIntro: string;
  seeFeatures: string; seePricing: string; walkthrough: string;
}> = {
  en: {
    meta: { title: "Product", description: "GarageOS connects the customer, vehicle, inspection, estimate, approval, Work Order and payment in one workflow — from booking to the next visit." },
    eyebrow: "Product",
    heading: "One system from booking to the next visit.",
    description: "GarageOS connects the customer, vehicle, inspection, estimate, approval, work and payment in one workflow.",
    workflowTitle: "The main workflow",
    workflowIntro: "Every job follows the same connected path — so nothing gets lost between the front desk, the shop floor and the customer.",
    step: "Step",
    customerTitle: "The customer-facing experience",
    customerIntro: "Customers experience your shop, not GarageOS. Every touchpoint carries your brand.",
    frontEyebrow: "Front-desk-first",
    frontTitle: "Built to run from the front desk.",
    frontBody: "GarageOS is designed around the owner and front desk running the day — scheduling, inspections, estimates, approvals, invoicing and customer updates — without requiring every mechanic to work in complex software on the shop floor.",
    simpleTitle: "Simple where it needs to be",
    simpleBody: "Give each team member the access their role requires — owners and front desk get the full workflow, mechanics get what's relevant to the job in front of them.",
    managementTitle: "The management layer",
    managementIntro: "Around the job, GarageOS gives owners visibility and control over the whole business.",
    seeFeatures: "See all features", seePricing: "Compare plans", walkthrough: "Walk through a sample visit",
  },
  fr: {
    meta: { title: "Produit", description: "GarageOS relie le client, le véhicule, l'inspection, la soumission, l'approbation, le bon de travail et le paiement dans un seul flux — de la réservation à la prochaine visite." },
    eyebrow: "Produit",
    heading: "Un seul système, de la réservation à la prochaine visite.",
    description: "GarageOS relie le client, le véhicule, l'inspection, la soumission, l'approbation, le travail et le paiement dans un seul flux de travail.",
    workflowTitle: "Le flux de travail principal",
    workflowIntro: "Chaque travail suit le même parcours connecté — rien ne se perd entre la réception, l'atelier et le client.",
    step: "Étape",
    customerTitle: "L'expérience côté client",
    customerIntro: "Vos clients vivent votre atelier, pas GarageOS. Chaque point de contact porte votre image.",
    frontEyebrow: "Pensé pour la réception",
    frontTitle: "Conçu pour se gérer depuis la réception.",
    frontBody: "GarageOS est pensé autour du propriétaire et de la réception qui mènent la journée — rendez-vous, inspections, soumissions, approbations, facturation et communications — sans obliger chaque mécanicien à travailler dans un logiciel complexe dans l'atelier.",
    simpleTitle: "Simple là où il le faut",
    simpleBody: "Donnez à chaque membre de l'équipe l'accès que son rôle exige — propriétaires et réception ont tout le flux, les mécaniciens voient ce qui concerne le travail devant eux.",
    managementTitle: "La couche de gestion",
    managementIntro: "Autour du travail, GarageOS donne aux propriétaires visibilité et contrôle sur toute l'entreprise.",
    seeFeatures: "Voir toutes les fonctionnalités", seePricing: "Comparer les forfaits", walkthrough: "Parcourir une visite type",
  },
};

export const PRODUCT_WORKFLOW: ProductStep[] = [
  { icon: "calendar", title: L("Book", "Réserver"), description: L("Customers request an appointment on your branded booking page, or your front desk schedules it. The customer, vehicle and service are captured from the start.", "Les clients demandent un rendez-vous sur votre page de réservation, ou la réception le planifie. Le client, le véhicule et le service sont saisis dès le départ.") },
  { icon: "clipboard", title: L("Inspect", "Inspecter"), description: L("Record the vehicle's condition on a digital inspection — with photos and a shareable report on Pro — and turn the findings into an estimate.", "Notez l'état du véhicule dans une inspection numérique — avec photos et rapport partageable sur Pro — et transformez les constats en soumission.") },
  { icon: "file", title: L("Approve", "Faire approuver"), description: L("Send a clear, itemized estimate. The customer's decision is recorded with what they saw and when.", "Envoyez une soumission claire et détaillée. La décision du client est consignée avec ce qu'il a vu et quand.") },
  { icon: "wrench", title: L("Repair", "Réparer"), description: L("Approved work becomes a Work Order with a job status the front desk can see, and parts that come off inventory on Pro.", "Le travail approuvé devient un bon de travail avec un statut visible à la réception, et des pièces qui sortent de l'inventaire avec Pro.") },
  { icon: "receipt", title: L("Pay", "Payer"), description: L("Invoice the completed work with Canadian taxes, record the payment your shop collected and keep the history together.", "Facturez le travail terminé avec les taxes canadiennes, consignez le paiement encaissé par votre atelier et gardez l'historique réuni.") },
  { icon: "calendarClock", title: L("Return", "Revenir"), description: L("Set a maintenance reminder tied to the vehicle — automatic on Pro — so the next service doesn't get forgotten.", "Créez un rappel d'entretien lié au véhicule — automatique avec Pro — pour ne pas oublier le prochain entretien.") },
];

export const PRODUCT_CUSTOMER: ProductStep[] = [
  { icon: "calendar", title: L("Branded booking", "Réservation à votre image"), description: L("Customers book on a page with your logo, colors and contact information.", "Les clients réservent sur une page avec votre logo, vos couleurs et vos coordonnées.") },
  { icon: "file", title: L("Estimates & approvals", "Soumissions et approbations"), description: L("A clear estimate the customer can accept or decline from their phone.", "Une soumission claire que le client peut accepter ou refuser depuis son téléphone.") },
  { icon: "clipboard", title: L("Inspection reports", "Rapports d'inspection"), description: L("Findings and photos the customer can review before they approve (Pro).", "Constats et photos que le client peut consulter avant d'approuver (Pro).") },
  { icon: "smartphone", title: L("Customer portal", "Portail client"), description: L("Vehicles, appointments, estimates, invoices and service history in one secure place.", "Véhicules, rendez-vous, soumissions, factures et historique d'entretien au même endroit sécurisé.") },
  { icon: "message", title: L("Status updates", "Mises à jour de statut"), description: L("Email or text updates, including when the vehicle is ready for pickup.", "Mises à jour par courriel ou texto, y compris quand le véhicule est prêt.") },
];

export const PRODUCT_MANAGEMENT: ProductStep[] = [
  { icon: "package", title: L("Inventory & tire storage", "Inventaire et pneus"), description: L("Stock that follows your Work Orders, and seasonal tire sets you can find.", "Un stock qui suit vos bons de travail, et des pneus saisonniers faciles à retrouver.") },
  { icon: "chart", title: L("Reports & books", "Rapports et comptabilité"), description: L("Sales, receivables and job reports, Accounting Light and QuickBooks Online sync.", "Rapports de ventes, de comptes à recevoir et de travaux, Comptabilité allégée et synchronisation QuickBooks Online.") },
  { icon: "building", title: L("Multi-Shop", "Multi-atelier"), description: L("Several locations, one organization, consolidated reporting.", "Plusieurs emplacements, une organisation, des rapports consolidés.") },
  { icon: "users", title: L("Team & data", "Équipe et données"), description: L("Roles and permissions, and import from your old system.", "Rôles et permissions, et importation depuis votre ancien système.") },
];

// ── Integrations ────────────────────────────────────────────

export interface IntegrationItem {
  icon: string;
  title: Localized;
  status: Localized;
  description: Localized;
  gate?: CapabilityKey;
}

export const INTEGRATIONS_COPY: Record<MarketingLocale, {
  meta: { title: string; description: string };
  eyebrow: string; heading: string; description: string;
  availableTitle: string; availableIntro: string;
  notTitle: string; notIntro: string;
  ask: string; askLink: string; askTail: string;
}> = {
  en: {
    meta: { title: "Integrations", description: "What GarageOS connects to today: QuickBooks Online, email and SMS delivery, and data import." },
    eyebrow: "Product",
    heading: "Integrations",
    description: "What GarageOS connects to today — and where you'll keep using the tools you already have.",
    availableTitle: "Available today",
    availableIntro: "Built into GarageOS and set up from your Settings.",
    notTitle: "Not part of GarageOS today",
    notIntro: "Honest about what isn't there yet, so you can plan around it.",
    ask: "Need a specific integration for your shop?", askLink: "Let us know", askTail: "— it helps us prioritize what we build next.",
  },
  fr: {
    meta: { title: "Intégrations", description: "Ce à quoi GarageOS se connecte aujourd'hui : QuickBooks Online, envoi de courriels et de SMS, et importation de données." },
    eyebrow: "Produit",
    heading: "Intégrations",
    description: "Ce à quoi GarageOS se connecte aujourd'hui — et où vous continuerez à utiliser vos outils actuels.",
    availableTitle: "Disponible aujourd'hui",
    availableIntro: "Intégré à GarageOS et configuré depuis vos Paramètres.",
    notTitle: "Ne fait pas partie de GarageOS aujourd'hui",
    notIntro: "Transparents sur ce qui n'existe pas encore, pour que vous puissiez planifier.",
    ask: "Besoin d'une intégration précise pour votre atelier?", askLink: "Écrivez-nous", askTail: "— cela nous aide à prioriser ce que nous construisons.",
  },
};

export const INTEGRATIONS_AVAILABLE: IntegrationItem[] = [
  { icon: "plug", title: L("QuickBooks Online", "QuickBooks Online"), status: L("Pro & Complete", "Pro et Complete"), gate: "quickbooks.sync",
    description: L("Connect your QuickBooks Online company from Settings and sync customers, invoices, payments and refunds with your Canadian tax codes. Sync starts from the date you choose; documents aren't sent twice.", "Connectez votre entreprise QuickBooks Online depuis les Paramètres et synchronisez clients, factures, paiements et remboursements avec vos codes de taxes canadiens. La synchronisation commence à la date choisie; aucun document n'est envoyé deux fois.") },
  { icon: "mail", title: L("Branded email", "Courriels à votre image"), status: L("All plans", "Tous les forfaits"),
    description: L("Appointment, estimate, invoice and reminder emails sent from your shop's name and reply address. Pro and Complete can send from their own domain.", "Courriels de rendez-vous, de soumission, de facture et de rappel envoyés au nom de votre atelier et avec votre adresse de réponse. Pro et Complete peuvent envoyer depuis leur propre domaine.") },
  { icon: "message", title: L("Two-way SMS", "SMS bidirectionnel"), status: L("All plans", "Tous les forfaits"),
    description: L("Text customers from a dedicated shop number (delivered through Twilio) and read replies in your inbox. STOP requests are honored automatically. A monthly allowance is included.", "Envoyez des textos aux clients depuis un numéro dédié à l'atelier (acheminé par Twilio) et lisez les réponses dans votre boîte. Les demandes STOP sont respectées automatiquement. Une allocation mensuelle est incluse.") },
  { icon: "upload", title: L("Data import", "Importation de données"), status: L("All plans", "Tous les forfaits"),
    description: L("Bring customers and vehicles from CSV or Excel exports of your previous system. Pro and Complete also import inventory.", "Transférez clients et véhicules depuis les exports CSV ou Excel de votre ancien système. Pro et Complete importent aussi l'inventaire.") },
];

export const INTEGRATIONS_NOT_AVAILABLE: IntegrationItem[] = [
  { icon: "card", title: L("Card payment processing", "Traitement des paiements par carte"), status: L("Not available", "Non disponible"),
    description: L("GarageOS records payments your shop collects. It doesn't charge cards or connect invoices to a payment processor — keep using your terminal or provider.", "GarageOS consigne les paiements que votre atelier encaisse. Il ne débite pas les cartes et ne relie pas les factures à un processeur de paiement — continuez d'utiliser votre terminal ou votre fournisseur.") },
  { icon: "calendar", title: L("External calendar sync", "Synchronisation de calendrier externe"), status: L("Not available", "Non disponible"),
    description: L("Manage appointments in the GarageOS calendar. Syncing with Google or Outlook calendars isn't included.", "Gérez les rendez-vous dans le calendrier GarageOS. La synchronisation avec les calendriers Google ou Outlook n'est pas incluse.") },
  { icon: "plug", title: L("Public API", "API publique"), status: L("Not available", "Non disponible"),
    description: L("There is no public API today.", "Il n'existe pas d'API publique aujourd'hui.") },
];
