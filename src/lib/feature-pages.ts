/**
 * Páginas de detalle de Features (EN/FR). Todo el contenido sale de funciones que existen en el repositorio (textos de
 * `marketing-pages.ts`, guías de Help y `entitlements.ts`); las cifras de planes se derivan de las constantes. Sin
 * testimonios, estadísticas, precios ni promesas de resultados. El francés es una versión preliminar (ver
 * docs/fr-wave1-review.md): sus páginas siguen noindex hasta su aprobación.
 */
import { PLAN_LIMITS } from "@/config/entitlements";
import { helpPathForGuide } from "@/lib/help";
import type { MarketingLocale } from "@/lib/marketing-locale";

type L<T = string> = Record<MarketingLocale, T>;

export interface FeaturePage {
  id: "booking" | "inspections" | "quotes" | "communications";
  slug: L;
  meta: L<{ title: string; description: string }>;
  hero: L<{ eyebrow: string; h1: string; intro: string }>;
  benefits: L<{ title: string; body: string }[]>;
  steps: L<{ title: string; body: string }[]>;
  plans: L<string>;
  /** Enlaces relacionados: `href` en inglés (la ruta francesa equivalente se resuelve con `featurePath`). */
  related: { href: string; label: L }[];
}

const sms = PLAN_LIMITS;
const n = (v: number) => v.toLocaleString("en-CA");
const nfr = (v: number) => v.toLocaleString("fr-CA");

export const FEATURE_PAGES: readonly FeaturePage[] = [
  {
    id: "booking",
    slug: { en: "online-booking", fr: "reservation-en-ligne" },
    meta: {
      en: { title: "Online booking for auto repair shops", description: "Let customers request an appointment on a booking page with your logo and colors, within the hours, mechanics and notice rules you set." },
      fr: { title: "Réservation en ligne pour ateliers mécaniques", description: "Laissez vos clients demander un rendez-vous sur une page à vos couleurs, selon les heures, les mécaniciens et les délais que vous fixez." },
    },
    hero: {
      en: { eyebrow: "Features · Appointments", h1: "Online booking for auto repair shops", intro: "Give customers a booking page that carries your logo and colors, and keep control of when and with whom they can book." },
      fr: { eyebrow: "Fonctionnalités · Rendez-vous", h1: "Réservation en ligne pour ateliers mécaniques", intro: "Offrez à vos clients une page de réservation à votre image, tout en gardant le contrôle sur le moment et le mécanicien." },
    },
    benefits: {
      en: [
        { title: "Your booking page, in your brand", body: "Customers request a time on a page with your shop's logo, colors and contact information — not a GarageOS page." },
        { title: "Times that follow your rules", body: "Set opening and closing times for each day, the interval between start times, the minimum notice and how far ahead customers can book. A time is only offered if it fits the shop's and the mechanic's working hours and leaves enough time for the service." },
        { title: "Choose who can take appointments", body: "Pick the mechanics available for online appointments and check their individual working hours. Existing appointments remove slots automatically." },
        { title: "Straight into the shop calendar", body: "Online requests and front-desk appointments live in the same calendar, with the client, vehicle, service and assigned mechanic. Customers are notified by email and, when your shop has a number, by text." },
      ],
      fr: [
        { title: "Votre page de réservation, à votre image", body: "Les clients demandent un rendez-vous sur une page qui porte le logo, les couleurs et les coordonnées de votre atelier — pas celles de GarageOS." },
        { title: "Des plages qui respectent vos règles", body: "Fixez les heures d'ouverture et de fermeture de chaque jour, l'intervalle entre les heures de début, le préavis minimal et jusqu'à quand les clients peuvent réserver. Une plage n'est offerte que si elle respecte les horaires de l'atelier et du mécanicien et laisse assez de temps pour le service." },
        { title: "Choisissez qui prend les rendez-vous", body: "Sélectionnez les mécaniciens disponibles pour les rendez-vous en ligne et vérifiez leurs horaires respectifs. Les rendez-vous existants retirent automatiquement des plages." },
        { title: "Directement dans le calendrier de l'atelier", body: "Les demandes en ligne et les rendez-vous pris à la réception se retrouvent dans le même calendrier, avec le client, le véhicule, le service et le mécanicien assigné. Les clients sont avisés par courriel et, si votre atelier a un numéro, par texto." },
      ],
    },
    steps: {
      en: [
        { title: "Set the booking rules", body: "In Settings, enable online booking and set hours, start-time interval, notice and booking window." },
        { title: "Choose the mechanics", body: "Select who can receive online appointments and review their working hours." },
        { title: "Share your public page", body: "Open your booking page, check the offered times for a working day, then share the address with customers." },
        { title: "Review in the calendar", body: "Check each appointment's client, vehicle, service and mechanic, and confirm the result of the notification." },
      ],
      fr: [
        { title: "Définissez les règles de réservation", body: "Dans les Paramètres, activez la réservation en ligne et réglez les heures, l'intervalle, le préavis et la période réservable." },
        { title: "Choisissez les mécaniciens", body: "Sélectionnez ceux qui peuvent recevoir des rendez-vous en ligne et vérifiez leurs horaires." },
        { title: "Partagez votre page publique", body: "Ouvrez votre page de réservation, vérifiez les plages offertes pour une journée de travail, puis partagez l'adresse avec vos clients." },
        { title: "Vérifiez dans le calendrier", body: "Consultez le client, le véhicule, le service et le mécanicien de chaque rendez-vous, et vérifiez le résultat de l'avis envoyé." },
      ],
    },
    plans: {
      en: "Online booking is included in every plan. Pro and Complete add the advanced booking page (templates and typography) and sending from your own domain.",
      fr: "La réservation en ligne est incluse dans tous les forfaits. Pro et Complete ajoutent la page de réservation avancée (modèles et typographie) et l'envoi depuis votre propre domaine.",
    },
    related: [
      { href: helpPathForGuide("configure-online-booking")!, label: { en: "Guide: configure online booking", fr: "Guide : configurer la réservation en ligne" } },
      { href: "/features/sms-and-email", label: { en: "SMS & email communications", fr: "Communications SMS et courriel" } },
      { href: "/product", label: { en: "The full shop workflow", fr: "Le flux de travail complet de l'atelier" } },
      { href: "/pricing", label: { en: "Compare plans", fr: "Comparer les forfaits" } },
    ],
  },
  {
    id: "inspections",
    slug: { en: "digital-vehicle-inspections", fr: "inspections-numeriques" },
    meta: {
      en: { title: "Digital vehicle inspections for garages", description: "Record each vehicle's condition on a checklist, turn the findings into an estimate and, on Pro, add photos and share a report with the customer." },
      fr: { title: "Inspections numériques de véhicules", description: "Notez l'état de chaque véhicule sur une liste de vérification, transformez les constats en devis et, avec Pro, ajoutez des photos et partagez un rapport." },
    },
    hero: {
      en: { eyebrow: "Features · Inspect & authorize", h1: "Digital vehicle inspections", intro: "Replace paper checklists with a record your whole team can read — and turn what you find into a clear estimate." },
      fr: { eyebrow: "Fonctionnalités · Inspecter et faire approuver", h1: "Inspections numériques de véhicules", intro: "Remplacez les listes papier par un dossier que toute l'équipe peut consulter — et transformez vos constats en devis clair." },
    },
    benefits: {
      en: [
        { title: "A standard checklist on every plan", body: "Mark each item Good, Needs attention or Service required, add a note, and add custom items for anything the checklist doesn't cover." },
        { title: "From findings to an estimate", body: "Create an estimate directly from the findings to price the recommended work, so nothing noted in the bay is retyped at the desk." },
        { title: "Photos and templates on Pro", body: "On Pro and Complete, attach photos to the findings that matter and use your own reusable inspection templates." },
        { title: "A report the customer can open", body: "On Pro and Complete, share a link to a customer-friendly report — findings first, then photos and the full checklist. Stop sharing at any time and the old link stops working." },
      ],
      fr: [
        { title: "Une liste standard dans tous les forfaits", body: "Marquez chaque élément Bon, À surveiller ou Service requis, ajoutez une note, et ajoutez des éléments personnalisés pour ce que la liste ne couvre pas." },
        { title: "Des constats au devis", body: "Créez un devis directement à partir des constats pour chiffrer les travaux recommandés : rien de ce qui est noté à l'atelier n'est ressaisi à la réception." },
        { title: "Photos et modèles avec Pro", body: "Avec Pro et Complete, joignez des photos aux constats importants et utilisez vos propres modèles d'inspection réutilisables." },
        { title: "Un rapport que le client peut ouvrir", body: "Avec Pro et Complete, partagez un lien vers un rapport lisible pour le client — les constats d'abord, puis les photos et la liste complète. Cessez le partage quand vous voulez : l'ancien lien cesse de fonctionner." },
      ],
    },
    steps: {
      en: [
        { title: "Start from the vehicle", body: "Open Inspections and create one for the customer's vehicle." },
        { title: "Record what you find", body: "Set the condition of each item and add notes (and photos on Pro and Complete)." },
        { title: "Create the estimate", body: "Price the recommended work from the findings." },
        { title: "Share the report", body: "On Pro and Complete, send the customer the report link before they decide." },
      ],
      fr: [
        { title: "Partez du véhicule", body: "Ouvrez Inspections et créez-en une pour le véhicule du client." },
        { title: "Notez ce que vous constatez", body: "Réglez l'état de chaque élément et ajoutez des notes (et des photos avec Pro et Complete)." },
        { title: "Créez le devis", body: "Chiffrez les travaux recommandés à partir des constats." },
        { title: "Partagez le rapport", body: "Avec Pro et Complete, envoyez au client le lien du rapport avant qu'il décide." },
      ],
    },
    plans: {
      en: "The standard checklist and estimates from findings are on every plan. Photos, reusable templates and the shareable customer report are on Pro and Complete.",
      fr: "La liste standard et les devis à partir des constats sont inclus dans tous les forfaits. Les photos, les modèles réutilisables et le rapport partageable avec le client sont offerts avec Pro et Complete.",
    },
    related: [
      { href: helpPathForGuide("digital-vehicle-inspections")!, label: { en: "Guide: run a digital inspection", fr: "Guide : réaliser une inspection numérique" } },
      { href: "/features/quotes-and-approvals", label: { en: "Quotes & approvals", fr: "Devis et approbations" } },
      { href: "/pricing", label: { en: "Compare plans", fr: "Comparer les forfaits" } },
    ],
  },
  {
    id: "quotes",
    slug: { en: "quotes-and-approvals", fr: "devis-et-approbations" },
    meta: {
      en: { title: "Quotes and customer approvals for auto repair", description: "Send itemized estimates with Canadian taxes, let customers accept or decline online, and keep a time-stamped record of what they saw and decided." },
      fr: { title: "Devis et approbations des clients", description: "Envoyez des devis détaillés avec les taxes canadiennes, laissez les clients accepter ou refuser en ligne et conservez un enregistrement horodaté." },
    },
    hero: {
      en: { eyebrow: "Features · Estimates & invoices", h1: "Quotes and customer approvals", intro: "Send a clear, itemized estimate, let the customer decide from their phone, and keep a record of exactly what they saw." },
      fr: { eyebrow: "Fonctionnalités · Devis et factures", h1: "Devis et approbations des clients", intro: "Envoyez un devis clair et détaillé, laissez le client décider depuis son téléphone et gardez la trace de ce qu'il a vu." },
    },
    benefits: {
      en: [
        { title: "Itemized, with Canadian taxes", body: "Services and parts with quantities and prices, and Canadian taxes calculated for you. Drafts stay editable until you send them." },
        { title: "Customers answer online", body: "Send by email or text. The customer opens a secure page — or their customer portal — and accepts or declines. If they answer another way, record the decision yourself." },
        { title: "A time-stamped approval record", body: "GarageOS keeps a time-stamped entry of the decision, the channel it came through and a snapshot of what was approved, so there is a reference if a customer later asks what they agreed to." },
        { title: "From approval to Work Order and invoice", body: "Approved estimates become Work Orders, and a conversion action turns an estimate into a draft invoice you can review before sending." },
      ],
      fr: [
        { title: "Détaillé, avec les taxes canadiennes", body: "Services et pièces avec quantités et prix, et taxes canadiennes calculées pour vous. Les brouillons restent modifiables jusqu'à l'envoi." },
        { title: "Le client répond en ligne", body: "Envoyez par courriel ou texto. Le client ouvre une page sécurisée — ou son portail client — et accepte ou refuse. S'il répond autrement, consignez la décision vous-même." },
        { title: "Un enregistrement horodaté de l'approbation", body: "GarageOS conserve une entrée horodatée de la décision, du canal utilisé et d'un instantané de ce qui a été approuvé : vous avez une référence si un client demande plus tard ce à quoi il a consenti." },
        { title: "De l'approbation à l'ordre de travail et à la facture", body: "Les devis approuvés deviennent des ordres de travail, et une action de conversion transforme un devis en brouillon de facture à réviser avant l'envoi." },
      ],
    },
    steps: {
      en: [
        { title: "Prepare the estimate", body: "Create a draft for the right client and vehicle; add service and parts lines." },
        { title: "Send it", body: "Send by email or text. Sending alone does not mean the customer approved it." },
        { title: "Record the decision", body: "The customer accepts or declines online, or you record their answer." },
        { title: "Carry on to the job", body: "Create the Work Order, then the invoice, from the approved estimate." },
      ],
      fr: [
        { title: "Préparez le devis", body: "Créez un brouillon pour le bon client et le bon véhicule; ajoutez les lignes de service et de pièces." },
        { title: "Envoyez-le", body: "Envoyez par courriel ou texto. L'envoi seul ne signifie pas que le client a approuvé." },
        { title: "Consignez la décision", body: "Le client accepte ou refuse en ligne, ou vous consignez sa réponse." },
        { title: "Poursuivez avec le travail", body: "Créez l'ordre de travail, puis la facture, à partir du devis approuvé." },
      ],
    },
    plans: {
      en: "Estimates, customer approvals, Work Orders and invoices are included in every plan. GarageOS records payments your shop collects; it does not process card payments.",
      fr: "Les devis, les approbations des clients, les ordres de travail et les factures sont inclus dans tous les forfaits. GarageOS consigne les paiements que votre atelier encaisse; il ne traite pas les paiements par carte.",
    },
    related: [
      { href: helpPathForGuide("estimate-to-invoice")!, label: { en: "Guide: from estimate to invoice", fr: "Guide : du devis à la facture" } },
      { href: "/features/digital-vehicle-inspections", label: { en: "Digital vehicle inspections", fr: "Inspections numériques de véhicules" } },
      { href: "/features/sms-and-email", label: { en: "SMS & email communications", fr: "Communications SMS et courriel" } },
      { href: "/integrations", label: { en: "Integrations, including QuickBooks Online", fr: "Intégrations, dont QuickBooks Online" } },
    ],
  },
  {
    id: "communications",
    slug: { en: "sms-and-email", fr: "communications-sms-courriel" },
    meta: {
      en: { title: "SMS and email for auto repair shops", description: "Send appointment, estimate, invoice and reminder messages under your shop's name, and text customers from a dedicated shop number." },
      fr: { title: "Communications SMS et courriel pour ateliers", description: "Envoyez vos messages de rendez-vous, de devis, de facture et de rappel au nom de votre atelier, et écrivez par texto depuis un numéro dédié." },
    },
    hero: {
      en: { eyebrow: "Features · Communicate & retain", h1: "SMS and email communications", intro: "Keep customers informed under your own shop name — by email, and by text from a dedicated shop number." },
      fr: { eyebrow: "Fonctionnalités · Communiquer et fidéliser", h1: "Communications SMS et courriel", intro: "Gardez vos clients informés au nom de votre atelier — par courriel et par texto depuis un numéro dédié." },
    },
    benefits: {
      en: [
        { title: "Email under your shop's name", body: "Appointment, estimate, invoice and reminder emails go out with your shop's name, logo and reply address. Pro and Complete can send from their own domain." },
        { title: "Two-way SMS in one inbox", body: "Text customers from a dedicated shop number and read their replies in one inbox. STOP requests are honored automatically." },
        { title: "A monthly SMS allowance on every plan", body: `SMS use is counted in segments. Included each month: ${n(sms.CORE.smsSegmentsPerMonth)} on Core, ${n(sms.PRO.smsSegmentsPerMonth)} on Pro and ${n(sms.COMPLETE.smsSegmentsPerMonth)} on Complete.` },
        { title: "Updates at the right moments", body: "Notify the customer when an appointment is booked and when their vehicle is ready for pickup, and send maintenance reminders — automatic on Pro and Complete, by the customer's preferred channel." },
      ],
      fr: [
        { title: "Des courriels au nom de votre atelier", body: "Les courriels de rendez-vous, de devis, de facture et de rappel partent avec le nom, le logo et l'adresse de réponse de votre atelier. Pro et Complete peuvent envoyer depuis leur propre domaine." },
        { title: "SMS bidirectionnel dans une seule boîte", body: "Écrivez à vos clients par texto depuis un numéro dédié à l'atelier et lisez leurs réponses dans une seule boîte. Les demandes STOP sont respectées automatiquement." },
        { title: "Une allocation mensuelle de SMS dans chaque forfait", body: `L'utilisation des SMS se mesure en segments. Inclus chaque mois : ${nfr(sms.CORE.smsSegmentsPerMonth)} avec Core, ${nfr(sms.PRO.smsSegmentsPerMonth)} avec Pro et ${nfr(sms.COMPLETE.smsSegmentsPerMonth)} avec Complete.` },
        { title: "Des avis aux bons moments", body: "Avisez le client lorsqu'un rendez-vous est pris et quand son véhicule est prêt, et envoyez des rappels d'entretien — automatiques avec Pro et Complete, par le canal préféré du client." },
      ],
    },
    steps: {
      en: [
        { title: "Set up delivery", body: "In Settings → Notifications, review your mailboxes and, if you want, your own sending domain." },
        { title: "Send from the workflow", body: "Appointments, estimates, invoices and reminders send from where you already work." },
        { title: "Read replies", body: "Customer text replies arrive in the SMS inbox." },
        { title: "Check the result", body: "Check the delivery result of a send instead of assuming a saved message was delivered." },
      ],
      fr: [
        { title: "Configurez l'envoi", body: "Dans Paramètres → Notifications, vérifiez vos boîtes d'envoi et, si vous le souhaitez, votre propre domaine d'envoi." },
        { title: "Envoyez depuis le flux de travail", body: "Les rendez-vous, devis, factures et rappels s'envoient depuis là où vous travaillez déjà." },
        { title: "Lisez les réponses", body: "Les réponses des clients par texto arrivent dans la boîte SMS." },
        { title: "Vérifiez le résultat", body: "Vérifiez le résultat de livraison d'un envoi plutôt que de supposer qu'un message enregistré a été livré." },
      ],
    },
    plans: {
      en: "Branded email and two-way SMS are on every plan, with a monthly SMS allowance that grows with the plan. Sending from your own domain and automatic reminders are on Pro and Complete.",
      fr: "Les courriels à votre image et le SMS bidirectionnel sont inclus dans tous les forfaits, avec une allocation mensuelle de SMS qui augmente selon le forfait. L'envoi depuis votre propre domaine et les rappels automatiques sont offerts avec Pro et Complete.",
    },
    related: [
      { href: helpPathForGuide("branded-communications")!, label: { en: "Guide: branded communications", fr: "Guide : communications à votre image" } },
      { href: helpPathForGuide("maintenance-reminders")!, label: { en: "Guide: maintenance reminders", fr: "Guide : rappels d'entretien" } },
      { href: "/features/online-booking", label: { en: "Online booking", fr: "Réservation en ligne" } },
      { href: "/integrations", label: { en: "Integrations: branded email and two-way SMS", fr: "Intégrations : courriels à votre image et SMS bidirectionnel" } },
    ],
  },
];

const BASE: L = { en: "/features", fr: "/fr/fonctionnalites" };

export function featurePath(locale: MarketingLocale, page: FeaturePage): string {
  return `${BASE[locale]}/${page.slug[locale]}`;
}
export function findFeaturePage(locale: MarketingLocale, slug: string): FeaturePage | undefined {
  return FEATURE_PAGES.find((p) => p.slug[locale] === slug);
}
/** Resuelve un enlace relacionado escrito con la ruta inglesa a la ruta del idioma de la página. */
export function relatedHref(locale: MarketingLocale, href: string): string {
  const match = FEATURE_PAGES.find((p) => href === `/features/${p.slug.en}`);
  return match ? featurePath(locale, match) : href;
}
