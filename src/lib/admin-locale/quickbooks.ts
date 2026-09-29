import type { AdminLocale } from "@/lib/admin-locale";

export interface QuickBooksDictionary {
  tab: string;
  title: string;
  subtitle: string;
  notConfigured: string;
  locked: { title: string; description: string; cta: string };
  notConnected: string;
  connect: string;
  reconnect: string;
  needsReconnect: string;
  disconnect: string;
  disconnectConfirm: string;
  status: { connected: string; company: string; environment: string; connectedOn: string; lastSync: string; never: string; sandboxNote: string };
  counts: { synced: string; errors: string; pending: string };
  notices: Record<string, string>;
  mapping: {
    title: string; hint: string; load: string; loading: string; income: string; deposit: string; taxCode: string; zeroTaxCode: string; none: string;
    startDate: string; startDateHint: string; save: string; saved: string; taxRequired: string;
  };
  sync: { now: string; syncing: string; retry: string; result: (s: { synced: number; errors: number; remaining: number }) => string; skipped: Record<string, string> };
  problems: { title: string; empty: string; type: Record<string, string>; attempts: (n: number) => string; warning: string; nextRetry: (d: string) => string };
  what: string[];
}

const en: QuickBooksDictionary = {
  tab: "QuickBooks",
  title: "QuickBooks Online",
  subtitle: "Send your customers, invoices, payments and refunds to QuickBooks Online so your bookkeeper doesn't retype them. GarageOS pushes; nothing is written back.",
  notConfigured: "QuickBooks isn't set up on this GarageOS installation yet. Contact GarageOS support to enable it.",
  locked: {
    title: "QuickBooks Online is included in Pro and Complete",
    description: "Connect your QuickBooks Online company and keep customers, invoices, payments and refunds in sync automatically.",
    cta: "See plans",
  },
  notConnected: "Not connected.",
  connect: "Connect to QuickBooks",
  reconnect: "Reconnect",
  needsReconnect: "QuickBooks access was revoked or expired. Reconnect to resume syncing.",
  disconnect: "Disconnect",
  disconnectConfirm: "Disconnect QuickBooks? Nothing is deleted in QuickBooks; syncing stops and GarageOS forgets its access.",
  status: { connected: "Connected", company: "Company", environment: "Environment", connectedOn: "Connected", lastSync: "Last sync", never: "Never", sandboxNote: "Sandbox mode — test data only." },
  counts: { synced: "Synced", errors: "Need attention", pending: "Waiting" },
  notices: {
    connected: "QuickBooks connected. Choose your accounts and tax code below, then sync.",
    denied: "QuickBooks access was declined.",
    invalid_state: "That connection link is no longer valid. Please start again.",
    expired_state: "That connection link expired. Please start again.",
    wrong_user: "That connection was started by someone else. Please start again.",
    exchange_failed: "QuickBooks didn't accept the authorization. Please try again.",
    not_configured: "QuickBooks isn't set up on this installation.",
    forbidden: "Only the shop owner can manage integrations.",
    upgrade: "QuickBooks requires the Pro plan.",
  },
  mapping: {
    title: "Mapping",
    hint: "GarageOS creates 'GarageOS Labour / Parts / Other' items on your income account and sends each invoice with the tax code you choose (QuickBooks computes the tax — we flag any difference).",
    load: "Load options from QuickBooks", loading: "Loading…", income: "Income account", deposit: "Bank account (payments & refunds)", taxCode: "Tax code for taxed invoices (e.g. GST/QST)",
    zeroTaxCode: "Tax code for tax-free invoices", none: "— not set —", startDate: "Sync invoices issued since", startDateHint: "Older invoices are never sent.", save: "Save mapping", saved: "Mapping saved",
    taxRequired: "Choose a tax code before syncing taxed invoices.",
  },
  sync: {
    now: "Sync now", syncing: "Syncing…", retry: "Retry failed",
    result: (s) => `${s.synced} sent to QuickBooks${s.errors ? `, ${s.errors} need attention` : ""}${s.remaining ? `, ${s.remaining} more waiting — sync again` : ""}.`,
    skipped: { NOT_ENTITLED: "Your plan doesn't include QuickBooks.", NOT_CONNECTED: "QuickBooks isn't connected.", ALREADY_RUNNING: "A sync is already running.", AUTH: "QuickBooks rejected access — try again or reconnect.", THROTTLED: "QuickBooks is rate limiting — try again in a minute.", NEEDS_RECONNECT: "Reconnect QuickBooks to continue.", ERROR: "QuickBooks returned an error." },
  },
  problems: {
    title: "Needs attention", empty: "Nothing needs attention.",
    type: { INVOICE: "Invoice", PAYMENT: "Payment", REFUND: "Refund", CUSTOMER: "Customer" },
    attempts: (n) => `${n} attempt${n === 1 ? "" : "s"}`, warning: "Warning", nextRetry: (d) => `next retry ${d}`,
  },
  what: ["Customers", "Invoices (with your tax code)", "Payments (by method)", "Refunds"],
};

const fr: QuickBooksDictionary = {
  tab: "QuickBooks",
  title: "QuickBooks Online",
  subtitle: "Envoyez vos clients, factures, paiements et remboursements vers QuickBooks Online pour que votre comptable n'ait rien à ressaisir. GarageOS envoie; rien n'est réécrit dans GarageOS.",
  notConfigured: "QuickBooks n'est pas encore configuré sur cette installation de GarageOS. Contactez le soutien GarageOS pour l'activer.",
  locked: {
    title: "QuickBooks Online est inclus dans Pro et Complete",
    description: "Connectez votre compagnie QuickBooks Online et gardez clients, factures, paiements et remboursements synchronisés automatiquement.",
    cta: "Voir les forfaits",
  },
  notConnected: "Non connecté.",
  connect: "Se connecter à QuickBooks",
  reconnect: "Reconnecter",
  needsReconnect: "L'accès à QuickBooks a été révoqué ou a expiré. Reconnectez pour reprendre la synchronisation.",
  disconnect: "Déconnecter",
  disconnectConfirm: "Déconnecter QuickBooks? Rien n'est supprimé dans QuickBooks; la synchronisation s'arrête et GarageOS oublie son accès.",
  status: { connected: "Connecté", company: "Compagnie", environment: "Environnement", connectedOn: "Connecté le", lastSync: "Dernière synchro", never: "Jamais", sandboxNote: "Mode bac à sable — données de test seulement." },
  counts: { synced: "Synchronisés", errors: "À vérifier", pending: "En attente" },
  notices: {
    connected: "QuickBooks connecté. Choisissez vos comptes et votre code de taxe ci-dessous, puis synchronisez.",
    denied: "L'accès à QuickBooks a été refusé.",
    invalid_state: "Ce lien de connexion n'est plus valide. Recommencez.",
    expired_state: "Ce lien de connexion a expiré. Recommencez.",
    wrong_user: "Cette connexion a été lancée par quelqu'un d'autre. Recommencez.",
    exchange_failed: "QuickBooks n'a pas accepté l'autorisation. Réessayez.",
    not_configured: "QuickBooks n'est pas configuré sur cette installation.",
    forbidden: "Seul le propriétaire peut gérer les intégrations.",
    upgrade: "QuickBooks nécessite le forfait Pro.",
  },
  mapping: {
    title: "Correspondances",
    hint: "GarageOS crée les articles « GarageOS Labour / Parts / Other » sur votre compte de revenus et envoie chaque facture avec le code de taxe choisi (QuickBooks calcule la taxe — nous signalons tout écart).",
    load: "Charger les options depuis QuickBooks", loading: "Chargement…", income: "Compte de revenus", deposit: "Compte bancaire (paiements et remboursements)", taxCode: "Code de taxe des factures taxables (ex. TPS/TVQ)",
    zeroTaxCode: "Code de taxe des factures sans taxes", none: "— non défini —", startDate: "Synchroniser les factures émises depuis", startDateHint: "Les factures plus anciennes ne sont jamais envoyées.", save: "Enregistrer", saved: "Correspondances enregistrées",
    taxRequired: "Choisissez un code de taxe avant de synchroniser des factures taxables.",
  },
  sync: {
    now: "Synchroniser maintenant", syncing: "Synchronisation…", retry: "Réessayer les échecs",
    result: (s) => `${s.synced} envoyé(s) à QuickBooks${s.errors ? `, ${s.errors} à vérifier` : ""}${s.remaining ? `, ${s.remaining} en attente — synchronisez à nouveau` : ""}.`,
    skipped: { NOT_ENTITLED: "Votre forfait n'inclut pas QuickBooks.", NOT_CONNECTED: "QuickBooks n'est pas connecté.", ALREADY_RUNNING: "Une synchronisation est déjà en cours.", AUTH: "QuickBooks a refusé l'accès — réessayez ou reconnectez.", THROTTLED: "QuickBooks limite le débit — réessayez dans une minute.", NEEDS_RECONNECT: "Reconnectez QuickBooks pour continuer.", ERROR: "QuickBooks a retourné une erreur." },
  },
  problems: {
    title: "À vérifier", empty: "Rien à vérifier.",
    type: { INVOICE: "Facture", PAYMENT: "Paiement", REFUND: "Remboursement", CUSTOMER: "Client" },
    attempts: (n) => `${n} tentative${n === 1 ? "" : "s"}`, warning: "Avertissement", nextRetry: (d) => `prochain essai ${d}`,
  },
  what: ["Clients", "Factures (avec votre code de taxe)", "Paiements (par mode)", "Remboursements"],
};

export const QUICKBOOKS_DICT: Record<AdminLocale, QuickBooksDictionary> = { en, fr, es: en };
