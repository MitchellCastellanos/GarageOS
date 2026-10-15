// EN/FR copy for the National Lead Radar. The French dictionary is typed against the English one (a missing key fails the build);
// tests/lead-radar-domain.test.ts also enforces that no value is empty and that placeholders match.
import { autoEn, autoFr } from "@/lib/admin-locale/lead-radar-automation";

const en = {
  nav: "Lead Radar",
  title: "National Lead Radar", subtitle: "Discover automotive repair shops across Canada, review them, and hand approved ones to the Sales CRM.",
  errors: {
    LEAD_RADAR_DISABLED: "Live discovery is switched off. A Super Admin must enable it (database setting and LEAD_RADAR_ENABLED=1).", INVALID_RELEASE: "Use a release id such as 2026-09-23.1, or “latest”.",
    INVALID_SCOPE: "Choose at least one province or territory and valid categories.", LARGE_SCOPE_NOT_ACKNOWLEDGED: "This is a nationwide or large extraction. Tick the acknowledgement to continue.",
    MANIFEST_INVALID: "The manifest file is not valid.", MANIFEST_PLAN_MISMATCH: "This manifest was produced from a different plan. Download this run’s plan and extract again.",
    MANIFEST_RELEASE_MISMATCH: "The manifest is for a different Overture release than this run.", RUN_NOT_PLANNED: "This run already started.", NOT_FOUND: "Not found.",
    CHUNK_TOO_LARGE: "That chunk is too large.", CHUNK_SEQ_INVALID: "Invalid chunk number.", CHUNK_OUT_OF_ORDER: "A chunk is missing. Resume from the last confirmed chunk.", CHUNK_FAILED: "That chunk could not be saved. Nothing was applied; retry it.",
    RUN_CANCELLED: "This run is cancelled. Resume it to continue.", RUN_NOT_INGESTING: "This run is not receiving data.", RUN_INCOMPLETE: "Not every record has been received yet.",
    RUN_NOT_CANCELLABLE: "This run can no longer be cancelled.", RUN_NOT_RESUMABLE: "This run cannot be resumed.",
    INVALID_BUDGET: "Enter a monthly budget between what this month already committed and CAD 25.00.", INVALID_FX: "Enter a USD→CAD rate between 1.000 and 3.000.", INVALID: "Check the form and try again.",
    BATCH_SIZE: "Select between 1 and 200 candidates.", ASSIGNMENT_FORBIDDEN: "You cannot hold the unassigned pool.", IMPORT_FAILED: "The import failed and was rolled back. Nothing was changed.",
    unexpected: "Something went wrong. Nothing was changed.",
  } as Record<string, string>,
  status: {
    live: "Live discovery is ON", disabled: "Live discovery is OFF", disabledHelp: "Nothing is fetched, staged or imported while it is off. Review of already-staged candidates still works.",
    envMissing: "Environment switch LEAD_RADAR_ENABLED is not set to 1.", dbOff: "Database switch is off.",
  },
  tiles: {
    total: "Candidates discovered", newProspects: "New to the CRM", existing: "Match an existing prospect", ambiguous: "Ambiguous matches", pending: "Pending review", approved: "Approved",
    rejected: "Rejected", imported: "Imported", importedUnassigned: "Imported, still unassigned", failed: "Import errors",
  },
  source: { title: "Data source", name: "Overture Maps — Places", release: "Latest release staged", lastExtraction: "Last completed extraction", never: "No extraction yet", licenseNote: "Licences are verified per record; only permissive licences are importable." },
  coverage: {
    title: "Coverage by province and territory", province: "Province / territory", total: "Candidates", primary: "Primary targets", pending: "Pending", approved: "Approved", imported: "Imported",
    lastSeen: "Last update", gap: "Gap", gapNever: "Never extracted", gapStale: "Older than 90 days", ok: "Covered", cityTitle: "Top cities", territoryTitle: "By GarageOS territory",
    allProvinces: "All provinces", city: "City", count: "Candidates", territory: "Territory",
  },
  controls: {
    title: "Start a discovery job", scope: "Geographic scope", provinces: "Provinces and territories", cities: "Cities (optional, comma-separated)", citiesHelp: "Leave empty for the whole province.",
    categories: "Automotive categories", release: "Overture release", releaseHelp: "“latest” lets the extractor find the newest release; or pin one (2026-09-23.1) to reproduce an extraction.",
    minConfidence: "Minimum source confidence (0–1)", preview: "Preview workload", previewing: "Calculating…", create: "Create run", creating: "Creating…",
    workload: "Estimated workload", rowGroups: "Parquet row groups", megabytes: "Download (upper bound)", mb: "MB", cost: "Per-record licence fee: none (open data). Paid provider requests: 0.",
    overlap: "These provinces were already requested by an earlier run for the same categories. Re-running the same area on the same release downloads the same data again; a newer release is a legitimate refresh.",
    large: "This is a nationwide or large extraction.", acknowledge: "I understand this reads a large amount of public data from my own machine and approve it.", created: "Run created.",
    howTo: "The extraction runs on your own machine (never on Vercel). Download the plan, run the extractor, then upload its output on the run page.",
    groups: { REPAIR: "Repair shops, tires, brakes, transmission", BODY_GLASS: "Collision, body, glass, restoration", DEALER: "Dealerships", PARTS: "Parts stores", OTHER_AUTOMOTIVE: "Car wash, detailing, towing, other" } as Record<string, string>,
  },
  settings: {
    title: "Settings and permissions", enabled: "Enable live discovery (database switch)", managers: "Let Sales Managers review and import candidates", managersHelp: "Off by default. Managers can never create runs, change settings or see the budget controls.",
    budget: "Monthly budget (CAD)", budgetHelp: "Hard cap CAD 25.00 for all paid providers combined. It can be lowered here, never raised.", fx: "USD → CAD rate used for estimates", fxHelp: "Keep it above the market rate (conservative).",
    save: "Save settings", saving: "Saving…", saved: "Settings saved.",
  },
  budget: {
    title: "Monthly budget", month: "Month", limit: "Limit", reserved: "Reserved", spent: "Spent", remaining: "Remaining", byProvider: "By provider", byRun: "By job", history: "History",
    none: "No billable operations this month.", open: "Open reservations", release: "Release", releaseHelp: "Only release a reservation whose request provably never left.", provider: "Provider", amount: "Amount (CAD)",
    enforced: "Enforced by the app: every paid provider request. Not enforceable by the app: Vercel, Neon, storage, bandwidth and your own machine’s costs. Open data has no per-record fee.",
  },
  runs: {
    title: "Discovery runs", empty: "No runs yet.", release: "Release", scope: "Scope", status: "Status", progress: "Progress", rejected: "Rejected", started: "Created", open: "Open", errors: "Diagnostics",
    states: { PLANNED: "Planned", INGESTING: "Receiving data", COMPLETED: "Completed", CANCELLED: "Cancelled", FAILED: "Failed" } as Record<string, string>,
    downloadPlan: "Download plan", planHelp: "Run: python3 scripts/lead-radar/overture_extract.py --plan plan.json --out ./out", upload: "Upload extraction", manifestFile: "manifest.json", recordsFile: "records.ndjson",
    start: "Start upload", uploading: "Uploading…", chunk: "Chunk", of: "of", resume: "Resume", cancel: "Cancel run", confirmCancel: "Cancel this run? Staged candidates are kept.", complete: "Finish run",
    uploaded: "Upload complete.", hashMismatch: "records.ndjson does not match the manifest checksum.", countMismatch: "records.ndjson has a different number of records than the manifest.",
    pickFiles: "Choose both files.", diag: { MALFORMED_JSON: "Malformed line", SCHEMA_INVALID: "Invalid record", SCHEMA_VERSION_UNSUPPORTED: "Unsupported schema version", MISSING_NAME: "Missing name", OUTSIDE_CANADA: "Outside Canada", OUT_OF_SCOPE_PROVINCE: "Outside selected provinces", OUT_OF_SCOPE_CITY: "Outside selected cities" } as Record<string, string>,
    back: "Back to Lead Radar", staged: "New candidates", received: "Records received",
  },
  candidates: {
    title: "Candidate review", search: "Search name, phone or website", province: "Province", allProvinces: "All provinces", city: "City", tier: "Tier", allTiers: "All tiers", category: "Category", allCategories: "All categories",
    review: "Review", allReview: "All", match: "CRM match", allMatch: "All", imp: "Import status", allImp: "All", chain: "Chain signal", anyChain: "Any", lane: "Qualification lane", anyLane: "Any lane", reason: "Qualification reason", anyReason: "Any reason", minCompleteness: "Min. completeness", hasPhone: "Has phone", hasWebsite: "Has website", hasEmail: "Has email", licenseBlocked: "Licence blocked",
    apply: "Apply filters", reset: "Reset", empty: "No candidates match.", results: "{n} candidates",
    colName: "Business", colPlace: "Location", colContact: "Contact", colClass: "Classification", colQuality: "Quality", colMatch: "CRM match", colStatus: "Status",
    tiers: { PRIMARY: "Primary target", SECONDARY: "Secondary", AMBIGUOUS: "Needs a human look", EXCLUDED: "Excluded" } as Record<string, string>,
    reviewStates: { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected" } as Record<string, string>,
    matchStates: { NEW: "New", EXISTING_STRONG: "Matches an existing prospect", AMBIGUOUS: "Ambiguous match", BRANCH_OF_EXISTING: "Branch of an existing business" } as Record<string, string>,
    importStates: { NOT_IMPORTED: "Not imported", CREATED: "Prospect created", LINKED: "Linked to existing", SENT_TO_REVIEW: "Sent to duplicate review", SKIPPED: "Skipped", FAILED: "Import failed" } as Record<string, string>,
    chainSignals: { CHAIN_SIGNAL: "Chain / brand signal", NO_CHAIN_SIGNAL: "No chain signal (independence not verified)" } as Record<string, string>,
    flags: {
      NO_ADDRESS: "No street address", NO_POSTAL: "No postal code", NO_PHONE: "No phone", NO_WEBSITE: "No website", NO_EMAIL: "No email", WEBSITE_IS_SOCIAL: "Only a social page", LOW_CONFIDENCE: "Low source confidence",
      ADDRESS_INCOMPLETE: "Incomplete address", EMAIL_UNVERIFIED: "Email published by source — not consent", EMAIL_SUPPRESSED: "Email on suppression list (removed)", LICENSE_BLOCKED: "Licence not permitted",
      GEO_REGION_MISSING: "Region missing", GEO_POSTAL_MISMATCH: "Region and postal code disagree", GEO_FROM_POSTAL: "Province inferred from postal code", GEO_COUNTRY_MISSING: "Country missing", GEO_UNRESOLVED: "Province unknown",
    } as Record<string, string>,
    reasons: { BRAND_LINKED: "Linked to a brand", CHAIN_NAME: "Known chain name", NOT_OPERATING: "Not operating", NOT_AUTOMOTIVE: "Not automotive", UNKNOWN_SUBCATEGORY: "Unrecognised category", POSSIBLE_DEALER_SERVICE: "May be a dealership service department", ALSO_DEALER: "Also listed as a dealer", GENERIC_AUTOMOTIVE_SERVICE: "Generic automotive service" } as Record<string, string>,
    eligibility: { eligible: "Can be imported once approved", LICENSE_BLOCKED: "Blocked: licence not permitted", EXCLUDED_TIER: "Blocked: not an automotive target", INSUFFICIENT_CONTACT: "Blocked: no phone or address" } as Record<string, string>,
    provenance: "Provenance", release: "Release", licenses: "Licences", datasets: "Contributing datasets", completeness: "Completeness", confidence: "Source confidence", unverified: "Unverified source data — not confirmed by GarageOS.",
    select: "Select", selectAll: "Select all on page", selected: "{n} selected", approve: "Approve", reject: "Reject", undo: "Back to pending", note: "Reviewer note (optional)",
    working: "Working…", reviewed: "Updated {n}; unchanged {u}; blocked {b}; already imported {a}.", importBtn: "Import approved ({n})", importConfirm: "Import every approved candidate into the Sales CRM as UNASSIGNED prospects? No message is sent.",
    imported: "Imported: {c} created, {l} linked, {r} sent to duplicate review, {f} failed.", existingLink: "Open CRM prospect", existingHidden: "An existing record outside your team scope", changedSinceImport: "Source changed since import (CRM not modified)",
    noAssign: "Importing never assigns a seller and never sends anything.",
  },
  handoff: {
    title: "CRM handoff", empty: "No imports yet.", created: "Created", linked: "Linked to existing", review: "Held for duplicate review", skipped: "Skipped", unassigned: "Unassigned",
    assign: "Open assignment preview", prospects: "Open prospects", field: "Field planner", sample: "Imported prospects", territory: "Territory", openProspect: "Open",
    help: "Imported prospects stay unassigned. A manager previews and explicitly confirms assignment in the existing assignment screen; territory, FIELD/REMOTE rules and seller capacity apply there.",
    batch: "Import",
  },
  automation: autoEn,
  compliance: {
    title: "Compliance", casl: "A published email address is not consent. Importing never creates a sending basis, sequence, message, SMS, call or visit.", attribution: "Business data © Overture Maps Foundation and its source contributors.",
  },
};

type Dict = typeof en;

const fr: Dict = {
  nav: "Radar de leads",
  title: "Radar national de leads", subtitle: "Découvrez les ateliers de réparation automobile partout au Canada, révisez-les et transmettez les approuvés au CRM des ventes.",
  errors: {
    LEAD_RADAR_DISABLED: "La découverte en direct est désactivée. Un super administrateur doit l’activer (réglage de base de données et LEAD_RADAR_ENABLED=1).", INVALID_RELEASE: "Utilisez un identifiant de version comme 2026-09-23.1, ou « latest ».",
    INVALID_SCOPE: "Choisissez au moins une province ou un territoire et des catégories valides.", LARGE_SCOPE_NOT_ACKNOWLEDGED: "Il s’agit d’une extraction nationale ou volumineuse. Cochez la confirmation pour continuer.",
    MANIFEST_INVALID: "Le fichier manifeste n’est pas valide.", MANIFEST_PLAN_MISMATCH: "Ce manifeste provient d’un autre plan. Téléchargez le plan de cette exécution et extrayez de nouveau.",
    MANIFEST_RELEASE_MISMATCH: "Le manifeste correspond à une autre version d’Overture que cette exécution.", RUN_NOT_PLANNED: "Cette exécution a déjà commencé.", NOT_FOUND: "Introuvable.",
    CHUNK_TOO_LARGE: "Ce bloc est trop volumineux.", CHUNK_SEQ_INVALID: "Numéro de bloc invalide.", CHUNK_OUT_OF_ORDER: "Un bloc manque. Reprenez au dernier bloc confirmé.", CHUNK_FAILED: "Ce bloc n’a pas pu être enregistré. Rien n’a été appliqué; réessayez.",
    RUN_CANCELLED: "Cette exécution est annulée. Reprenez-la pour continuer.", RUN_NOT_INGESTING: "Cette exécution ne reçoit pas de données.", RUN_INCOMPLETE: "Tous les enregistrements n’ont pas encore été reçus.",
    RUN_NOT_CANCELLABLE: "Cette exécution ne peut plus être annulée.", RUN_NOT_RESUMABLE: "Cette exécution ne peut pas être reprise.",
    INVALID_BUDGET: "Entrez un budget mensuel entre ce que le mois a déjà engagé et 25,00 $ CA.", INVALID_FX: "Entrez un taux USD→CAD entre 1,000 et 3,000.", INVALID: "Vérifiez le formulaire et réessayez.",
    BATCH_SIZE: "Sélectionnez entre 1 et 200 candidats.", ASSIGNMENT_FORBIDDEN: "Vous ne pouvez pas gérer le bassin non assigné.", IMPORT_FAILED: "L’importation a échoué et a été annulée. Rien n’a été modifié.",
    unexpected: "Une erreur est survenue. Rien n’a été modifié.",
  },
  status: {
    live: "La découverte en direct est ACTIVE", disabled: "La découverte en direct est INACTIVE", disabledHelp: "Rien n’est récupéré, placé en attente ni importé tant qu’elle est inactive. La révision des candidats déjà en attente reste possible.",
    envMissing: "Le commutateur d’environnement LEAD_RADAR_ENABLED n’est pas à 1.", dbOff: "Le commutateur de base de données est désactivé.",
  },
  tiles: {
    total: "Candidats découverts", newProspects: "Nouveaux pour le CRM", existing: "Correspondent à un prospect existant", ambiguous: "Correspondances ambiguës", pending: "En attente de révision", approved: "Approuvés",
    rejected: "Rejetés", imported: "Importés", importedUnassigned: "Importés, non assignés", failed: "Erreurs d’importation",
  },
  source: { title: "Source de données", name: "Overture Maps — Lieux", release: "Dernière version chargée", lastExtraction: "Dernière extraction terminée", never: "Aucune extraction", licenseNote: "Les licences sont vérifiées par enregistrement; seules les licences permissives sont importables." },
  coverage: {
    title: "Couverture par province et territoire", province: "Province / territoire", total: "Candidats", primary: "Cibles principales", pending: "En attente", approved: "Approuvés", imported: "Importés",
    lastSeen: "Dernière mise à jour", gap: "Écart", gapNever: "Jamais extrait", gapStale: "Plus de 90 jours", ok: "Couvert", cityTitle: "Principales villes", territoryTitle: "Par territoire GarageOS",
    allProvinces: "Toutes les provinces", city: "Ville", count: "Candidats", territory: "Territoire",
  },
  controls: {
    title: "Lancer une découverte", scope: "Portée géographique", provinces: "Provinces et territoires", cities: "Villes (facultatif, séparées par des virgules)", citiesHelp: "Laissez vide pour toute la province.",
    categories: "Catégories automobiles", release: "Version d’Overture", releaseHelp: "« latest » laisse l’extracteur trouver la plus récente; ou fixez-en une (2026-09-23.1) pour reproduire une extraction.",
    minConfidence: "Confiance minimale de la source (0–1)", preview: "Prévisualiser la charge", previewing: "Calcul en cours…", create: "Créer l’exécution", creating: "Création…",
    workload: "Charge estimée", rowGroups: "Groupes de lignes Parquet", megabytes: "Téléchargement (borne supérieure)", mb: "Mo", cost: "Frais de licence par enregistrement : aucun (données ouvertes). Requêtes payantes à des fournisseurs : 0.",
    overlap: "Ces provinces ont déjà été demandées par une exécution antérieure pour les mêmes catégories. Relancer la même zone sur la même version retélécharge les mêmes données; une version plus récente est une vraie mise à jour.",
    large: "Il s’agit d’une extraction nationale ou volumineuse.", acknowledge: "Je comprends que cela lit beaucoup de données publiques depuis mon propre poste et je l’approuve.", created: "Exécution créée.",
    howTo: "L’extraction s’exécute sur votre propre poste (jamais sur Vercel). Téléchargez le plan, lancez l’extracteur, puis téléversez son résultat sur la page de l’exécution.",
    groups: { REPAIR: "Ateliers, pneus, freins, transmission", BODY_GLASS: "Collision, carrosserie, vitres, restauration", DEALER: "Concessionnaires", PARTS: "Magasins de pièces", OTHER_AUTOMOTIVE: "Lave-auto, esthétique, remorquage, autres" },
  },
  settings: {
    title: "Réglages et permissions", enabled: "Activer la découverte en direct (commutateur de base de données)", managers: "Permettre aux gestionnaires des ventes de réviser et d’importer des candidats", managersHelp: "Désactivé par défaut. Un gestionnaire ne peut jamais créer d’exécution, modifier les réglages ni voir les contrôles du budget.",
    budget: "Budget mensuel (CAD)", budgetHelp: "Plafond strict de 25,00 $ CA pour tous les fournisseurs payants combinés. Il peut être réduit ici, jamais augmenté.", fx: "Taux USD → CAD utilisé pour les estimations", fxHelp: "Gardez-le au-dessus du taux du marché (prudent).",
    save: "Enregistrer les réglages", saving: "Enregistrement…", saved: "Réglages enregistrés.",
  },
  budget: {
    title: "Budget mensuel", month: "Mois", limit: "Limite", reserved: "Réservé", spent: "Dépensé", remaining: "Restant", byProvider: "Par fournisseur", byRun: "Par tâche", history: "Historique",
    none: "Aucune opération facturable ce mois-ci.", open: "Réservations ouvertes", release: "Libérer", releaseHelp: "Ne libérez qu’une réservation dont la requête n’est manifestement jamais partie.", provider: "Fournisseur", amount: "Montant (CAD)",
    enforced: "Appliqué par l’application : chaque requête payante à un fournisseur. Non applicable par l’application : Vercel, Neon, stockage, bande passante et les coûts de votre propre poste. Les données ouvertes n’ont pas de frais par enregistrement.",
  },
  runs: {
    title: "Exécutions de découverte", empty: "Aucune exécution.", release: "Version", scope: "Portée", status: "Statut", progress: "Progression", rejected: "Rejetés", started: "Créée", open: "Ouvrir", errors: "Diagnostics",
    states: { PLANNED: "Planifiée", INGESTING: "Réception des données", COMPLETED: "Terminée", CANCELLED: "Annulée", FAILED: "Échec" },
    downloadPlan: "Télécharger le plan", planHelp: "Lancez : python3 scripts/lead-radar/overture_extract.py --plan plan.json --out ./out", upload: "Téléverser l’extraction", manifestFile: "manifest.json", recordsFile: "records.ndjson",
    start: "Démarrer le téléversement", uploading: "Téléversement…", chunk: "Bloc", of: "sur", resume: "Reprendre", cancel: "Annuler l’exécution", confirmCancel: "Annuler cette exécution? Les candidats déjà placés en attente sont conservés.", complete: "Terminer l’exécution",
    uploaded: "Téléversement terminé.", hashMismatch: "records.ndjson ne correspond pas à la somme de contrôle du manifeste.", countMismatch: "records.ndjson contient un nombre d’enregistrements différent de celui du manifeste.",
    pickFiles: "Choisissez les deux fichiers.", diag: { MALFORMED_JSON: "Ligne mal formée", SCHEMA_INVALID: "Enregistrement invalide", SCHEMA_VERSION_UNSUPPORTED: "Version de schéma non prise en charge", MISSING_NAME: "Nom manquant", OUTSIDE_CANADA: "Hors Canada", OUT_OF_SCOPE_PROVINCE: "Hors des provinces choisies", OUT_OF_SCOPE_CITY: "Hors des villes choisies" },
    back: "Retour au Radar de leads", staged: "Nouveaux candidats", received: "Enregistrements reçus",
  },
  candidates: {
    title: "Révision des candidats", search: "Rechercher nom, téléphone ou site", province: "Province", allProvinces: "Toutes les provinces", city: "Ville", tier: "Niveau", allTiers: "Tous les niveaux", category: "Catégorie", allCategories: "Toutes les catégories",
    review: "Révision", allReview: "Tous", match: "Correspondance CRM", allMatch: "Toutes", imp: "État d’importation", allImp: "Tous", chain: "Signal de chaîne", anyChain: "Tous", lane: "Voie de qualification", anyLane: "Toutes les voies", reason: "Raison de qualification", anyReason: "Toutes les raisons", minCompleteness: "Complétude min.", hasPhone: "A un téléphone", hasWebsite: "A un site web", hasEmail: "A un courriel", licenseBlocked: "Licence bloquée",
    apply: "Appliquer les filtres", reset: "Réinitialiser", empty: "Aucun candidat ne correspond.", results: "{n} candidats",
    colName: "Entreprise", colPlace: "Emplacement", colContact: "Coordonnées", colClass: "Classification", colQuality: "Qualité", colMatch: "Correspondance CRM", colStatus: "Statut",
    tiers: { PRIMARY: "Cible principale", SECONDARY: "Secondaire", AMBIGUOUS: "À examiner par une personne", EXCLUDED: "Exclu" },
    reviewStates: { PENDING: "En attente", APPROVED: "Approuvé", REJECTED: "Rejeté" },
    matchStates: { NEW: "Nouveau", EXISTING_STRONG: "Correspond à un prospect existant", AMBIGUOUS: "Correspondance ambiguë", BRANCH_OF_EXISTING: "Succursale d’une entreprise existante" },
    importStates: { NOT_IMPORTED: "Non importé", CREATED: "Prospect créé", LINKED: "Lié à un existant", SENT_TO_REVIEW: "Envoyé en révision des doublons", SKIPPED: "Ignoré", FAILED: "Échec d’importation" },
    chainSignals: { CHAIN_SIGNAL: "Signal de chaîne / marque", NO_CHAIN_SIGNAL: "Aucun signal de chaîne (indépendance non vérifiée)" },
    flags: {
      NO_ADDRESS: "Pas d’adresse civique", NO_POSTAL: "Pas de code postal", NO_PHONE: "Pas de téléphone", NO_WEBSITE: "Pas de site web", NO_EMAIL: "Pas de courriel", WEBSITE_IS_SOCIAL: "Seulement une page sociale", LOW_CONFIDENCE: "Faible confiance de la source",
      ADDRESS_INCOMPLETE: "Adresse incomplète", EMAIL_UNVERIFIED: "Courriel publié par la source — pas un consentement", EMAIL_SUPPRESSED: "Courriel sur la liste de suppression (retiré)", LICENSE_BLOCKED: "Licence non permise",
      GEO_REGION_MISSING: "Région manquante", GEO_POSTAL_MISMATCH: "La région et le code postal diffèrent", GEO_FROM_POSTAL: "Province déduite du code postal", GEO_COUNTRY_MISSING: "Pays manquant", GEO_UNRESOLVED: "Province inconnue",
    },
    reasons: { BRAND_LINKED: "Lié à une marque", CHAIN_NAME: "Nom de chaîne connu", NOT_OPERATING: "Hors activité", NOT_AUTOMOTIVE: "Non automobile", UNKNOWN_SUBCATEGORY: "Catégorie non reconnue", POSSIBLE_DEALER_SERVICE: "Peut être un service après-vente de concessionnaire", ALSO_DEALER: "Aussi listé comme concessionnaire", GENERIC_AUTOMOTIVE_SERVICE: "Service automobile générique" },
    eligibility: { eligible: "Importable une fois approuvé", LICENSE_BLOCKED: "Bloqué : licence non permise", EXCLUDED_TIER: "Bloqué : pas une cible automobile", INSUFFICIENT_CONTACT: "Bloqué : ni téléphone ni adresse" },
    provenance: "Provenance", release: "Version", licenses: "Licences", datasets: "Jeux de données contributeurs", completeness: "Complétude", confidence: "Confiance de la source", unverified: "Données de source non vérifiées — non confirmées par GarageOS.",
    select: "Sélectionner", selectAll: "Tout sélectionner sur la page", selected: "{n} sélectionnés", approve: "Approuver", reject: "Rejeter", undo: "Remettre en attente", note: "Note de révision (facultatif)",
    working: "En cours…", reviewed: "{n} mis à jour; {u} inchangés; {b} bloqués; {a} déjà importés.", importBtn: "Importer les approuvés ({n})", importConfirm: "Importer tous les candidats approuvés dans le CRM des ventes comme prospects NON ASSIGNÉS? Aucun message n’est envoyé.",
    imported: "Importés : {c} créés, {l} liés, {r} envoyés en révision des doublons, {f} en échec.", existingLink: "Ouvrir le prospect du CRM", existingHidden: "Un enregistrement existant hors de la portée de votre équipe", changedSinceImport: "La source a changé depuis l’importation (CRM non modifié)",
    noAssign: "L’importation n’assigne jamais de vendeur et n’envoie jamais rien.",
  },
  handoff: {
    title: "Transmission au CRM", empty: "Aucune importation.", created: "Créés", linked: "Liés à un existant", review: "En révision des doublons", skipped: "Ignorés", unassigned: "Non assignés",
    assign: "Ouvrir l’aperçu d’assignation", prospects: "Ouvrir les prospects", field: "Planificateur terrain", sample: "Prospects importés", territory: "Territoire", openProspect: "Ouvrir",
    help: "Les prospects importés restent non assignés. Un gestionnaire prévisualise puis confirme explicitement l’assignation dans l’écran d’assignation existant; les territoires, les règles TERRAIN/DISTANT et la capacité des vendeurs s’y appliquent.",
    batch: "Importation",
  },
  automation: autoFr,
  compliance: {
    title: "Conformité", casl: "Une adresse courriel publiée n’est pas un consentement. L’importation ne crée jamais de base d’envoi, de séquence, de message, de texto, d’appel ni de visite.", attribution: "Données d’entreprises © Overture Maps Foundation et ses contributeurs.",
  },
};

export type RadarCopy = Dict;
export function radarCopy(locale: "en" | "fr"): RadarCopy { return locale === "fr" ? fr : en; }
export function radarError(locale: "en" | "fr", code: string | undefined): string {
  const c = radarCopy(locale);
  return c.errors[code ?? ""] ?? c.automation.errors[code ?? ""] ?? c.errors.unexpected;
}
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
