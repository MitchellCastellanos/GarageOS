/**
 * Contenido bilingüe (EN/FR) del recorrido de adquisición: Get Started, Demo y Quick Start (Block 14).
 * Refleja el flujo real: cuenta → verificar correo → plan + método de pago (prueba de 14 días, $0 hoy) → configuración.
 */
import type { MarketingLocale } from "@/lib/marketing-locale";
import { ADMIN } from "@/lib/routes";
import { TRIAL_DAYS, type Localized } from "@/lib/marketing-plans";

const L = (en: string, fr: string): Localized => ({ en, fr });

// ── Get Started ─────────────────────────────────────────────

export const GET_STARTED_COPY: Record<MarketingLocale, {
  meta: { title: string; description: string };
  eyebrow: string; heading: string; description: string; step: string;
  ctaTitle: string; ctaBody: string; create: string; compare: string; signIn: string;
}> = {
  en: {
    meta: { title: "Get Started", description: `Here's exactly what happens when you start your ${TRIAL_DAYS}-day GarageOS trial.` },
    eyebrow: "Get Started", heading: "Bring your whole shop into one connected workflow.",
    description: `Start a ${TRIAL_DAYS}-day free trial, choose your plan and set up your shop around the way your team works.`, step: "Step",
    ctaTitle: "Ready to see it in your shop?", ctaBody: `Start your ${TRIAL_DAYS}-day free trial — $0 today.`,
    create: "Start free trial", compare: "Compare plans", signIn: "Already have an account? Sign in",
  },
  fr: {
    meta: { title: "Commencer", description: `Voici exactement ce qui se passe quand vous démarrez votre essai de ${TRIAL_DAYS} jours avec GarageOS.` },
    eyebrow: "Commencer", heading: "Réunissez tout votre atelier dans un seul flux de travail.",
    description: `Démarrez un essai gratuit de ${TRIAL_DAYS} jours, choisissez votre forfait et configurez l'atelier selon la façon de travailler de votre équipe.`, step: "Étape",
    ctaTitle: "Prêt à le voir dans votre atelier?", ctaBody: `Démarrez votre essai gratuit de ${TRIAL_DAYS} jours — 0 $ aujourd'hui.`,
    create: "Essai gratuit", compare: "Comparer les forfaits", signIn: "Vous avez déjà un compte? Connectez-vous",
  },
};

export const GET_STARTED_STEPS: { icon: string; title: Localized; time: Localized; description: Localized }[] = [
  { icon: "users", title: L("Create your account", "Créez votre compte"), time: L("2 minutes", "2 minutes"),
    description: L("Tell us your shop name, your name and an email — or continue with Google — and confirm your email address.", "Indiquez le nom de votre atelier, votre nom et un courriel — ou continuez avec Google — puis confirmez votre adresse courriel.") },
  { icon: "card", title: L("Choose your plan and start the trial", "Choisissez votre forfait et démarrez l'essai"), time: L("2 minutes", "2 minutes"),
    description: L(`Pick Core, Pro or Complete, monthly or annual, and add a payment method. You pay $0 today; we show the exact date and amount of your first charge, and billing starts automatically after ${TRIAL_DAYS} days.`, `Choisissez Core, Pro ou Complete, mensuel ou annuel, et ajoutez un mode de paiement. Vous payez 0 $ aujourd'hui; nous affichons la date et le montant exacts de votre premier prélèvement, et la facturation démarre automatiquement après ${TRIAL_DAYS} jours.`) },
  { icon: "palette", title: L("Set up your shop", "Configurez votre atelier"), time: L("A few minutes", "Quelques minutes"),
    description: L("Add your logo, hours and services. Your booking page, approvals, status updates, invoices and customer portal carry your shop's brand.", "Ajoutez votre logo, vos heures et vos services. Votre page de réservation, vos approbations, mises à jour de statut, factures et portail client portent l'image de votre atelier.") },
  { icon: "users", title: L("Add your team and customers", "Ajoutez votre équipe et vos clients"), time: L("A few minutes", "Quelques minutes"),
    description: L("Invite mechanics and front-desk staff with their own logins and access levels, then import your customers and vehicles from CSV or Excel — or add them as you go.", "Invitez mécaniciens et réceptionnistes avec leurs propres accès, puis importez vos clients et véhicules depuis un fichier CSV ou Excel — ou ajoutez-les au fil du temps.") },
  { icon: "dashboard", title: L("Run your first job end to end", "Menez votre premier travail de bout en bout"), time: L("From day one", "Dès le premier jour"),
    description: L("Book the appointment, inspect the vehicle, send an estimate and capture the customer's approval. Move the approved work through the Work Order, invoice, payment and next maintenance reminder — all connected to the same customer and vehicle.", "Réservez le rendez-vous, inspectez le véhicule, envoyez un devis et obtenez l'approbation du client. Faites avancer le travail approuvé dans l'ordre de travail, la facture, le paiement et le prochain rappel d'entretien — le tout relié au même client et au même véhicule.") },
];

// ── Demo ────────────────────────────────────────────────────

export const DEMO_COPY: Record<MarketingLocale, {
  meta: { title: string; description: string };
  eyebrow: string; heading: string; description: string; stepOf: (i: number, n: number) => string;
  outroTitle: string; outroBody: string; start: string; contact: string;
}> = {
  en: {
    meta: { title: "Demo", description: "See your shop in action: follow Garage Laurent, a fictional Quebec shop, from booking through inspection, approval, work, invoice and the next visit." },
    eyebrow: "Product walkthrough", heading: "One vehicle. The whole workflow.",
    description: "Follow a customer visit from booking through inspection, approval, repair, payment and the next reminder. This walkthrough uses sample situations and doesn't create shop records.",
    stepOf: (i, n) => `Step ${i} of ${n}`,
    outroTitle: "See it in your own shop", outroBody: `Start a ${TRIAL_DAYS}-day free trial — $0 today — or contact us with the areas you'd like to review.`,
    start: "Start free trial", contact: "Contact us",
  },
  fr: {
    meta: { title: "Démo", description: "Voyez votre atelier en action : suivez Garage Laurent, un atelier québécois fictif, de la réservation à l'inspection, l'approbation, les travaux, la facture et la prochaine visite." },
    eyebrow: "Visite du produit", heading: "Un véhicule. Tout le flux de travail.",
    description: "Suivez une visite client de la réservation à l'inspection, l'approbation, la réparation, le paiement et le prochain rappel. Cette visite utilise des situations fictives et ne crée aucun dossier.",
    stepOf: (i, n) => `Étape ${i} de ${n}`,
    outroTitle: "Voyez-le dans votre propre atelier", outroBody: `Démarrez un essai gratuit de ${TRIAL_DAYS} jours — 0 $ aujourd'hui — ou écrivez-nous pour les sujets que vous souhaitez examiner.`,
    start: "Essai gratuit", contact: "Nous joindre",
  },
};

export const DEMO_STEPS: { chip: Localized; title: Localized; example: Localized; body: Localized; href: string; label: Localized }[] = [
  { chip: L("Booked", "Réservé"), title: L("Book the visit", "Réserver la visite"),
    example: L("A returning customer requests a seasonal tire change.", "Un client fidèle demande un changement de pneus saisonnier."),
    body: L("The customer picks a time on your branded booking page, or your front desk finds the customer and vehicle and books it. Online times follow your hours and mechanics' availability.", "Le client choisit une heure sur votre page de réservation, ou la réception trouve le client et le véhicule et réserve. Les heures en ligne suivent vos horaires et la disponibilité des mécaniciens."),
    href: "/guides/configure-online-booking", label: L("See booking setup", "Voir la configuration de la réservation") },
  { chip: L("Checked in", "Reçu"), title: L("Check in and inspect", "Accueillir et inspecter"),
    example: L("The vehicle arrives and the mechanic walks around it.", "Le véhicule arrive et le mécanicien en fait le tour."),
    body: L("Open the customer and vehicle, confirm the concern and mileage, then record the condition on a digital inspection. On Pro, add photos to each finding.", "Ouvrez le client et le véhicule, confirmez la demande et le kilométrage, puis notez l'état dans une inspection numérique. Avec Pro, ajoutez des photos à chaque constat."),
    href: "/guides/digital-vehicle-inspections", label: L("See inspections", "Voir les inspections") },
  { chip: L("Estimating", "Devis"), title: L("Prepare the estimate", "Préparer le devis"),
    example: L("The findings become a priced list of work and parts.", "Les constats deviennent une liste de travaux et de pièces avec prix."),
    body: L("Create the estimate from the findings, review quantities, prices and taxes, then send it to the customer by email or text.", "Créez le devis à partir des constats, vérifiez quantités, prix et taxes, puis envoyez-la au client par courriel ou texto."),
    href: "/guides/estimate-to-invoice", label: L("See the estimate workflow", "Voir le flux de devis") },
  { chip: L("Approved", "Approuvé"), title: L("Capture the approval", "Obtenir l'approbation"),
    example: L("The customer reviews the estimate on their phone and accepts.", "Le client examine le devis sur son téléphone et accepte."),
    body: L("The decision is recorded with a snapshot of exactly what the customer saw and when — and your team is notified.", "La décision est consignée avec une copie de ce que le client a vu et quand — et votre équipe est avisée."),
    href: "/guides/approval-history", label: L("See the approval record", "Voir le suivi d'approbation") },
  { chip: L("In service", "En cours"), title: L("Do the work", "Faire le travail"),
    example: L("The mechanic works from the approved Work Order.", "Le mécanicien travaille à partir de l'ordre de travail approuvé."),
    body: L("The Work Order carries the approved lines and a job status the front desk can see. On Pro, parts used come off inventory automatically.", "L'ordre de travail reprend les lignes approuvées et un statut visible à la réception. Avec Pro, les pièces utilisées sortent automatiquement de l'inventaire."),
    href: "/guides/work-orders", label: L("See Work Orders", "Voir les ordres de travail") },
  { chip: L("Ready for pickup", "Prêt à récupérer"), title: L("Tell the customer", "Aviser le client"),
    example: L("The job is finished and the vehicle is ready.", "Le travail est terminé et le véhicule est prêt."),
    body: L("Mark the job Ready for Pickup and the customer gets a branded email or text. They can also see it in their customer portal.", "Marquez le travail « Prêt à récupérer » et le client reçoit un courriel ou un texto à votre image. Il peut aussi le voir dans son portail client."),
    href: "/guides/customer-portal", label: L("See the customer portal", "Voir le portail client") },
  { chip: L("Paid", "Payé"), title: L("Invoice and record payment", "Facturer et consigner le paiement"),
    example: L("The completed job is invoiced with GST and QST.", "Le travail terminé est facturé avec TPS et TVQ."),
    body: L("Create the invoice from the Work Order, send it, and record the payment your shop collected (card, cash, e-Transfer or cheque). Taxes are fixed on the invoice for your books.", "Créez la facture à partir de l'ordre de travail, envoyez-la et consignez le paiement encaissé par votre atelier (carte, comptant, virement ou chèque). Les taxes sont figées sur la facture pour votre comptabilité."),
    href: "/guides/estimate-to-invoice", label: L("See invoicing", "Voir la facturation") },
  { chip: L("Reminder set", "Rappel créé"), title: L("Bring them back", "Les ramener"),
    example: L("The service done today has a natural next visit.", "Le service d'aujourd'hui a une prochaine visite naturelle."),
    body: L("A maintenance reminder is tied to the vehicle — created automatically from the work you completed on Pro — and sent when it's due.", "Un rappel d'entretien est lié au véhicule — créé automatiquement à partir du travail terminé avec Pro — et envoyé à l'échéance."),
    href: "/guides/maintenance-reminders", label: L("See reminders", "Voir les rappels") },
];

// ── Quick Start ─────────────────────────────────────────────

export const QUICK_START_COPY: Record<MarketingLocale, {
  meta: { title: string; description: string };
  eyebrow: string; heading: string; description: string;
  newTitle: string; newBody: string; newLink: string;
}> = {
  en: {
    meta: { title: "Quick Start", description: "A practical setup checklist for running your first job end to end in GarageOS." },
    eyebrow: "Resources", heading: "Quick Start",
    description: "Follow this checklist to go from a new account to your first job, start to finish. Links open the matching screen in your shop.",
    newTitle: "New to GarageOS?", newBody: `Start a ${TRIAL_DAYS}-day free trial first — you'll land on this checklist after signing up.`, newLink: "See Get Started →",
  },
  fr: {
    meta: { title: "Démarrage rapide", description: "Une liste de vérification pratique pour mener votre premier travail de bout en bout dans GarageOS." },
    eyebrow: "Ressources", heading: "Démarrage rapide",
    description: "Suivez cette liste pour passer d'un nouveau compte à votre premier travail, du début à la fin. Les liens ouvrent l'écran correspondant dans votre atelier.",
    newTitle: "Nouveau sur GarageOS?", newBody: `Commencez d'abord par un essai gratuit de ${TRIAL_DAYS} jours — vous retrouverez cette liste après votre inscription.`, newLink: "Voir Commencer →",
  },
};

export const QUICK_START_STEPS: { title: Localized; description: Localized; href: string; label: Localized }[] = [
  { title: L("Set your shop identity", "Définissez l'identité de votre atelier"), description: L("Add your shop name, logo, contact details, timezone and language.", "Ajoutez le nom de l'atelier, le logo, les coordonnées, le fuseau horaire et la langue."), href: `${ADMIN.settings}?tab=general`, label: L("Open shop settings", "Ouvrir les paramètres") },
  { title: L("Set your hours and online booking", "Réglez vos heures et la réservation en ligne"), description: L("Configure opening hours, booking rules and which mechanics can receive appointments.", "Configurez les heures d'ouverture, les règles de réservation et les mécaniciens qui peuvent recevoir des rendez-vous."), href: `${ADMIN.settings}?tab=calendar`, label: L("Open booking settings", "Ouvrir la réservation") },
  { title: L("Add your services", "Ajoutez vos services"), description: L("List the services your shop offers so they're ready on appointments and estimates.", "Listez les services de votre atelier pour les retrouver dans les rendez-vous et les devis."), href: `${ADMIN.settings}?tab=services`, label: L("Open service catalog", "Ouvrir le catalogue") },
  { title: L("Invite your team", "Invitez votre équipe"), description: L("Add mechanics and front-desk staff with their own logins and roles.", "Ajoutez mécaniciens et réceptionnistes avec leurs propres accès et rôles."), href: `${ADMIN.settings}?tab=team`, label: L("Open team settings", "Ouvrir l'équipe") },
  { title: L("Import or add your customers and vehicles", "Importez ou ajoutez vos clients et véhicules"), description: L("Import from CSV or Excel, or create a customer and attach their vehicle.", "Importez depuis CSV ou Excel, ou créez un client et rattachez son véhicule."), href: ADMIN.import, label: L("Open import", "Ouvrir l'importation") },
  { title: L("Create your first appointment", "Créez votre premier rendez-vous"), description: L("Schedule the visit from the front desk, or let the customer book it online.", "Planifiez la visite à la réception, ou laissez le client réserver en ligne."), href: ADMIN.appointments, label: L("Open appointments", "Ouvrir les rendez-vous") },
  { title: L("Inspect, estimate and record approval", "Inspectez, faites un devis et consignez l'approbation"), description: L("Record the inspection, build the estimate and send it for the customer's decision.", "Notez l'inspection, préparez le devis et envoyez-le pour la décision du client."), href: ADMIN.quotes, label: L("Open estimates", "Ouvrir les devis") },
  { title: L("Run the Work Order", "Exécutez l'ordre de travail"), description: L("Follow the job through its status to Ready for Pickup.", "Suivez le travail à travers son statut jusqu'à « Prêt à récupérer »."), href: ADMIN.workOrders, label: L("Open Work Orders", "Ouvrir les ordres de travail") },
  { title: L("Invoice and record payment", "Facturez et consignez le paiement"), description: L("Create the invoice, send it, then record the payment your shop collected.", "Créez la facture, envoyez-la, puis consignez le paiement encaissé par votre atelier."), href: ADMIN.invoices, label: L("Open invoices", "Ouvrir les factures") },
  { title: L("Send your customer their portal link", "Envoyez son lien de portail au client"), description: L("From the customer's page, email a secure link to their vehicles, estimates and invoices.", "Depuis la fiche du client, envoyez-lui par courriel un lien sécurisé vers ses véhicules, devis et factures."), href: ADMIN.clients, label: L("Open customers", "Ouvrir les clients") },
  { title: L("Set a maintenance reminder", "Créez un rappel d'entretien"), description: L("Attach a follow-up to the vehicle so the next visit isn't forgotten.", "Associez un suivi au véhicule pour ne pas oublier la prochaine visite."), href: ADMIN.reminders, label: L("Open reminders", "Ouvrir les rappels") },
  { title: L("Optional: inventory, reports and more", "Facultatif : inventaire, rapports et plus"), description: L("On Pro: track parts used on Work Orders, tire storage, advanced reports, Accounting Light and QuickBooks.", "Avec Pro : suivi des pièces utilisées, entreposage de pneus, rapports avancés, Comptabilité allégée et QuickBooks."), href: ADMIN.reports, label: L("Open reports", "Ouvrir les rapports") },
  { title: L("Optional (Complete): add another location", "Facultatif (Complete) : ajoutez un emplacement"), description: L("Create locations under one organization and switch between them.", "Créez des emplacements sous une même organisation et passez de l'un à l'autre."), href: ADMIN.organization, label: L("Open Organization", "Ouvrir l'organisation") },
];
