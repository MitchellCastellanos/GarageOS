import type { AdminLocale } from "@/lib/admin-locale";
const en = {
  title: "Demo walkthrough", scenario: "Load quick demo scenario",
  scenarioHelp: "Adds one clearly marked synthetic client, vehicle, appointment, quote, work order and draft invoice. No real contact details or automatic messages.",
  loaded: "Scenario loaded. Use the real product screens below.", live: "You can also create your prospect as a real client in Clients.",
  enable: "Enable demo communications", enabled: "Demo communications enabled",
  communicationHelp: "SMS and email use the normal GarageOS send controls and real recipients. SMS demo activity is permanently excluded from Stripe billing. Sending still depends on configured providers and platform permissions.",
  confirmSend: "I have permission to send to the intended recipients. Enable real demo sending.",
  restart: "Restart walkthrough", restartHelp: "Returns this same shop to onboarding. Preserves branding, photos, business/fiscal details, services, hours, design and all live-entered records.",
  clear: "Also remove this synthetic scenario batch (including edits made to those records). Live records are kept.",
  confirmRestart: "I understand what will be reset.",
  liveLinks: "This scenario has financial, approval or live-record links. Nothing was reset. Restart without removing the scenario instead.",
  success: "Saved", error: "Action unavailable. Verify the live demo session and try again.",
  booking: "Open real Booking Page", bookingHelp: "Uses the shop’s published configuration and real booking renderer. Pro designs fall back to Classic on Core. Booking must be enabled in Settings.",
  clients: "Clients", appointments: "Appointments", quotes: "Quotes", orders: "Work orders", invoices: "Invoices", inbox: "Inbox", settings: "Booking Page settings", back: "Dashboard",
};
const fr: typeof en = {
  title: "Parcours de démonstration", scenario: "Charger un scénario de démonstration",
  scenarioHelp: "Ajoute un client, véhicule, rendez-vous, soumission, ordre de travail et facture brouillon clairement fictifs. Aucun vrai destinataire ni envoi automatique.",
  loaded: "Scénario chargé. Utilisez les écrans du produit réel ci-dessous.", live: "Vous pouvez aussi créer votre prospect comme vrai client dans Clients.",
  enable: "Activer les communications de la démo", enabled: "Communications de la démo activées",
  communicationHelp: "Les SMS et courriels utilisent les commandes normales et de vrais destinataires. Les SMS de démo sont définitivement exclus de la facturation Stripe. L’envoi dépend des fournisseurs configurés et des permissions de la plateforme.",
  confirmSend: "J’ai l’autorisation de contacter les destinataires prévus. Activer les vrais envois.",
  restart: "Recommencer le parcours", restartHelp: "Retourne ce même garage à l’intégration. Conserve l’image de marque, photos, renseignements commerciaux/fiscaux, services, horaires, design et toutes les données réelles.",
  clear: "Supprimer aussi ce lot fictif (y compris les modifications de ces fiches). Les données réelles sont conservées.",
  confirmRestart: "Je comprends ce qui sera réinitialisé.",
  liveLinks: "Ce scénario est lié à des opérations financières, approbations ou données réelles. Rien n’a été réinitialisé. Recommencez sans supprimer le scénario.",
  success: "Enregistré", error: "Action indisponible. Vérifiez la session de démo active et réessayez.",
  booking: "Ouvrir la vraie page de réservation", bookingHelp: "Utilise la configuration publiée et le moteur réel. Les designs Pro reviennent à Classic avec Core. Activez les réservations dans Paramètres.",
  clients: "Clients", appointments: "Rendez-vous", quotes: "Soumissions", orders: "Ordres de travail", invoices: "Factures", inbox: "Boîte de réception", settings: "Paramètres de réservation", back: "Tableau de bord",
};
export const salesDemoExperienceCopy = (locale: AdminLocale) => locale === "fr" ? fr : en;
