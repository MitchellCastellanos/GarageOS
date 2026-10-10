// EN/FR copy for the Lead Engine (queues, import mapping, duplicate review, assignment, CASL evidence approval).
// Kept in its own file; parity (same keys, no empty strings) is enforced by tests/lead-engine-domain.test.ts.
export const leadEn = {
  queues: {
    label: "Queues", all: "All prospects",
    names: { new: "New / unassigned", mine: "Assigned to me", ready: "Ready for outreach", eligibility: "Eligibility review", field: "FIELD visit candidates", followup: "Follow-up due", duplicates: "Duplicate review", missing: "Missing information", dnc: "Do not contact" } as Record<string, string>,
    hints: {
      new: "Active prospects without an owner.", mine: "Your active prospects.", ready: "Owned, reachable, language known and a sending basis on file. Pre-check only: the full send policy still runs at send time.",
      eligibility: "Contacts whose sending basis awaits review or pre-dates the review workflow.", field: "Local FIELD territory, usable address, unassigned or owned by a FIELD seller.",
      followup: "An open follow-up task is overdue.", duplicates: "Possible duplicate or branch awaiting a decision.", missing: "No usable address, no phone or email, or language unknown.", dnc: "Persistent opt-outs. Never contacted.",
    } as Record<string, string>,
    territoryFilter: "Territory", anyTerritory: "Any territory", national: "Rest of Canada", unresolved: "Unresolved address",
  },
  indicators: {
    territory: { LOCAL: "Local", NATIONAL: "National", UNRESOLVED: "Territory unknown", NONE: "Not computed" } as Record<string, string>,
    quality: { COMPLETE: "Full address", PARTIAL: "Partial address", INCOMPLETE: "Incomplete address", UNKNOWN: "No address" } as Record<string, string>,
    nextAction: "Next action", overdueBy: "overdue", none: "No next action", reviewPending: "Duplicate review pending", links: { duplicates: "Duplicate review", assignment: "Assign leads", evidence: "CASL evidence" } as Record<string, string>,
  },
  import: {
    step1: "1. Choose a file", step2: "2. Map columns and describe the source", step3: "3. Review the preview",
    inspect: "Read file", inspecting: "Reading file…", mappingTitle: "Column mapping", mappingHelp: "Each column of your file can feed one GarageOS field. Suggestions use English and French names; change anything that is wrong.",
    column: "File column", mapsTo: "Maps to", ignore: "— Ignore this column —", example: "Example", needName: "Map a column to “Business name” to continue.",
    sourceTitle: "Source", sourceKey: "Source key", sourceKeyHelp: "A short label for this data source (letters, numbers, - _ .). Re-importing the same source is idempotent.",
    sourceUrl: "Source URL (optional)", lawfulNote: "How this data may lawfully be used", lawfulHelp: "For example: “Owner’s own export of shops he collected, authorised for sales prospecting”. Required.", observedAt: "Data collected on (optional)",
    back: "Back", previewBtn: "Preview import",
    fields: {
      name: "Business name", website: "Website", address: "Street address", city: "City", province: "Province", postalCode: "Postal code", phone: "Phone", email: "General email", industry: "Industry", shopSize: "Shop size",
      locationCount: "Number of locations", currentSoftware: "Current software", source: "Lead source", sourceDetail: "Source detail", preferredLanguage: "Language", tags: "Tags", notes: "Notes", doNotContact: "Do not contact",
      contactName: "Contact name", contactTitle: "Contact title", contactEmail: "Contact email", contactPhone: "Contact phone", contactLanguage: "Contact language", decisionMaker: "Decision maker",
      externalId: "Source record ID", sourceUrl: "Record URL",
    } as Record<string, string>,
    outcomes: { CREATE: "New prospect", LINK_EXISTING: "Matches an existing prospect", LINK_IN_FILE: "Same as an earlier row", REVIEW: "Needs review", ALREADY_IMPORTED: "Already imported", DUPLICATE_SOURCE_ID: "Repeated source ID" } as Record<string, string>,
    stats: { linked: "Matched to existing", review: "Held for review", already: "Already imported", branches: "Possible branches", unresolved: "Territory unknown", national: "Rest of Canada", local: "Local territory" },
    territoryTitle: "Territory preview", assignmentTitle: "Assignment preview",
    ownerReady: "Can be assigned to the chosen owner", ownerPooled: "Held unassigned (territory rules)", ownerBlocked: "Skipped (territory rules)", autoAssign: "Eligible for automatic assignment afterwards", noOwner: "No owner chosen: prospects are imported unassigned. Use “Assign leads” to distribute them.",
    quality: "Address quality", rowsTitle: "Row outcomes (first 200)", row: "Row", outcome: "Outcome", territoryCol: "Territory", addressCol: "Address",
    resultTitle: "Import finished", created: "Prospects created", linked: "Matched to existing", review: "Held for review", skipped: "Skipped / already imported", reviewLink: "Open duplicate review",
    noConsent: "Importing an email address never gives permission to send. No message is sent and nothing is enrolled in a sequence.",
    codes: {
      INVALID_POSTAL: "Postal code not valid (kept as typed)", ADDRESS_INCOMPLETE: "Address incomplete", DUPLICATE_SOURCE_ID: "Source ID repeated in this file", ALREADY_IMPORTED: "Already imported earlier (no change)",
      NEEDS_REVIEW: "Could be the same business: held for review", BRANCH_OF_EXISTING: "Same chain at a different address: imported as a separate location", LINKED_EXISTING: "Matched to an existing prospect", DNC_PROPAGATED: "Opt-out applied to existing prospect", TERRITORY_BLOCKED: "Owner cannot hold this territory",
    } as Record<string, string>,
  },
  duplicates: {
    title: "Duplicate review", help: "These source rows may be the same business as a prospect you already have — or a different branch. Nothing is created or merged until you decide.",
    pending: "Pending", decided: "Decided", empty: "No duplicates to review.", existing: "Existing prospect", incoming: "Incoming source row", restricted: "Matches a prospect you cannot access. A manager must decide.",
    reasons: { NAME_ADDRESS: "Same name and address", NAME_POSTAL: "Same name and postal code", NAME_CITY_PHONE: "Same name, city and phone", NAME_CITY_DOMAIN: "Same name, city and website", SAME_PHONE: "Same phone", SAME_DOMAIN: "Same website", SAME_NAME_CITY: "Same name and city", SAME_ADDRESS_OTHER_NAME: "Same address, different name" } as Record<string, string>,
    link: "Same business", linkHelp: "Attach this row to the existing prospect. Empty fields are filled; nothing is overwritten.", distinct: "Different branch", distinctHelp: "Create a separate prospect from this row.", dismiss: "Discard row", dismissHelp: "Not a usable lead. Nothing is created.",
    status: { PENDING: "Pending", LINKED: "Linked", DISTINCT: "Created as separate branch", DISMISSED: "Discarded" } as Record<string, string>,
    name: "Name", address: "Address", phone: "Phone", website: "Website", owner: "Owner", noteLabel: "Note (optional)", open: "Open prospect",
  },
  assignment: {
    title: "Assign leads", help: "Distribute unassigned, eligible prospects among your sellers by territory, coverage, workload and availability. You see exactly who gets what before anything changes.",
    territory: "Territory", all: "All territories", preview: "Preview assignment", previewing: "Calculating…", confirm: "Confirm {n} assignments", confirming: "Applying…", discard: "Discard",
    considered: "Prospects considered", proposed: "Proposed", perSeller: "Per seller", skipped: "Not assigned", result: "Assignment applied", applied: "Assigned", skippedNow: "Skipped (changed since preview)",
    skipReasons: { DNC: "Do not contact", ARCHIVED: "Archived", ALREADY_OWNED: "Already owned", UNRESOLVED_TERRITORY: "Address too incomplete to place in a territory", NO_ELIGIBLE_SELLER: "No eligible seller (mode, coverage, pause or cap)" } as Record<string, string>,
    rules: "Rules: only unassigned, active, not-do-not-contact prospects with a resolved territory. FIELD territories go to FIELD sellers while FIELD has priority; elsewhere FIELD and REMOTE sellers share the work. Owned prospects and active opportunities are never touched.",
    sellersTitle: "Seller availability", acceptsAuto: "Takes part in automatic assignment", cap: "Lead cap (blank = none)", save: "Save", mode: { FIELD: "FIELD", REMOTE: "REMOTE" } as Record<string, string>, workload: "Active prospects",
    required: "Needs", rowsTitle: "Preview (first 100)", empty: "Nothing to assign right now.", seller: "Seller", prospect: "Prospect", maintenanceTitle: "Recompute address and territory data", maintenanceHelp: "Run once after the Lead Engine upgrade or after changing territory rules. Never changes owners, opt-outs or activities.", maintenanceRun: "Recompute", maintenanceDone: "Recomputed {n} prospects.",
  },
  evidence: {
    title: "CASL evidence review", help: "Published- and disclosed-address bases need a second person’s approval before they can authorise a commercial email. Approval never sends or enrols anything.",
    pending: "Awaiting review", empty: "No evidence awaiting your review.", recordedBy: "Recorded by", recordedAt: "Recorded", type: "Evidence type", sourceUrl: "Source URL", capturedAt: "Captured on", facts: "Supporting facts", role: "Relevance to the recipient’s role",
    publishedOk: "Address published without a “no unsolicited messages” statement", approve: "Approve", reject: "Reject", reasonPlaceholder: "Reason for rejection", notePlaceholder: "Note (optional)", history: "History", contact: "Contact", kind: "Basis",
    types: { WEBSITE_PUBLICATION: "Published on the business website", DIRECTORY_LISTING: "Public directory listing", BUSINESS_CARD: "Business card", EMAIL_THREAD: "Email thread", FORM_SUBMISSION: "Form submission", IN_PERSON_CONVERSATION: "In-person conversation", OTHER: "Other" } as Record<string, string>,
    status: { NOT_REQUIRED: "No review needed", LEGACY_UNREVIEWED: "Legacy: not reviewed", PENDING_REVIEW: "Awaiting review", APPROVED: "Approved", REJECTED: "Rejected" } as Record<string, string>,
    gaps: { EVIDENCE_TYPE: "Evidence type", CAPTURED_AT: "Capture date", SUPPORTING_FACTS: "Supporting facts (20+ characters)", ROLE_RELEVANCE: "Role relevance (10+ characters)", SOURCE_URL: "Source URL", PUBLISHED_CONDITIONS: "Published-address confirmation" } as Record<string, string>,
    form: { structured: "Structured evidence", required: "Required for this basis type.", submitNote: "This basis will wait for approval by a manager or Super Admin before it can authorise a send." },
    reasonBlocked: { PENDING_REVIEW: "Evidence awaiting approval", REJECTED_EVIDENCE: "Evidence rejected", UNREVIEWED: "Evidence not reviewed" } as Record<string, string>,
    selfApproved: "approved by its own recorder (Super Admin)",
  },
  errors: {
    SOURCE_KEY_INVALID: "The source key must be 2–60 characters: letters, numbers, dot, dash or underscore.", LAWFUL_SOURCE_REQUIRED: "Describe how this data may lawfully be used (at least 8 characters).",
    SOURCE_URL_INVALID: "The source URL must start with http:// or https://.", OBSERVED_AT_INVALID: "The collection date is not valid.", MAPPING_INVALID: "The column mapping is not valid.", IMPORT_CONFLICT: "Another import just wrote the same records. Nothing was saved; upload the file again.",
    REVIEW_NOT_DECIDABLE: "This review cannot be decided any more.", RUN_NOT_CONFIRMABLE: "This assignment preview can no longer be confirmed.", ASSIGNMENT_FAILED: "The assignment failed and nothing was changed.",
    EVIDENCE_INCOMPLETE: "The evidence is incomplete. Fill in every required item.", CASL_NOT_AUTHORIZED: "You are not allowed to review evidence.", CASL_SELF_APPROVAL: "You cannot approve evidence you recorded yourself.",
    CASL_NOT_PENDING: "This evidence is no longer awaiting review.", CASL_EVIDENCE_INCOMPLETE: "The evidence is incomplete and cannot be approved.", INVALID_DATE: "The date is not valid.", INVALID_URL: "The URL is not valid.",
  } as Record<string, string>,
};

type Dict = typeof leadEn;

export const leadFr: Dict = {
  queues: {
    label: "Files", all: "Tous les prospects",
    names: { new: "Nouveaux / non assignés", mine: "Qui m’est assigné", ready: "Prêts pour une prise de contact", eligibility: "Admissibilité à vérifier", field: "Visites TERRAIN à faire", followup: "Suivi en retard", duplicates: "Doublons à vérifier", missing: "Informations manquantes", dnc: "Ne pas contacter" },
    hints: {
      new: "Prospects actifs sans responsable.", mine: "Vos prospects actifs.", ready: "Avec responsable, joignable, langue connue et base d’envoi au dossier. Simple pré-contrôle : la politique d’envoi complète s’applique à l’envoi.",
      eligibility: "Contacts dont la base d’envoi attend une vérification ou précède le processus de vérification.", field: "Territoire TERRAIN local, adresse utilisable, non assigné ou détenu par un vendeur TERRAIN.",
      followup: "Une tâche de suivi ouverte est en retard.", duplicates: "Doublon ou succursale possible en attente de décision.", missing: "Pas d’adresse utilisable, ni téléphone ni courriel, ou langue inconnue.", dnc: "Désabonnements permanents. Jamais contactés.",
    },
    territoryFilter: "Territoire", anyTerritory: "Tout territoire", national: "Reste du Canada", unresolved: "Adresse non résolue",
  },
  indicators: {
    territory: { LOCAL: "Local", NATIONAL: "National", UNRESOLVED: "Territoire inconnu", NONE: "Non calculé" },
    quality: { COMPLETE: "Adresse complète", PARTIAL: "Adresse partielle", INCOMPLETE: "Adresse incomplète", UNKNOWN: "Aucune adresse" },
    nextAction: "Prochaine action", overdueBy: "en retard", none: "Aucune prochaine action", reviewPending: "Vérification de doublon en attente", links: { duplicates: "Doublons", assignment: "Assigner les prospects", evidence: "Preuves LCAP" },
  },
  import: {
    step1: "1. Choisir un fichier", step2: "2. Associer les colonnes et décrire la source", step3: "3. Vérifier l’aperçu",
    inspect: "Lire le fichier", inspecting: "Lecture du fichier…", mappingTitle: "Association des colonnes", mappingHelp: "Chaque colonne de votre fichier peut alimenter un champ GarageOS. Les suggestions utilisent les noms anglais et français ; corrigez ce qui est faux.",
    column: "Colonne du fichier", mapsTo: "Alimente", ignore: "— Ignorer cette colonne —", example: "Exemple", needName: "Associez une colonne à « Nom de l’entreprise » pour continuer.",
    sourceTitle: "Source", sourceKey: "Clé de source", sourceKeyHelp: "Un court nom pour cette source de données (lettres, chiffres, - _ .). Réimporter la même source est idempotent.",
    sourceUrl: "URL de la source (facultatif)", lawfulNote: "Comment ces données peuvent être utilisées légalement", lawfulHelp: "Par exemple : « Export du propriétaire des ateliers qu’il a recensés, autorisé pour la prospection ». Obligatoire.", observedAt: "Données recueillies le (facultatif)",
    back: "Retour", previewBtn: "Aperçu de l’importation",
    fields: {
      name: "Nom de l’entreprise", website: "Site web", address: "Adresse (rue)", city: "Ville", province: "Province", postalCode: "Code postal", phone: "Téléphone", email: "Courriel général", industry: "Secteur", shopSize: "Taille de l’atelier",
      locationCount: "Nombre de succursales", currentSoftware: "Logiciel actuel", source: "Source du prospect", sourceDetail: "Détail de la source", preferredLanguage: "Langue", tags: "Étiquettes", notes: "Notes", doNotContact: "Ne pas contacter",
      contactName: "Nom du contact", contactTitle: "Titre du contact", contactEmail: "Courriel du contact", contactPhone: "Téléphone du contact", contactLanguage: "Langue du contact", decisionMaker: "Décideur",
      externalId: "Identifiant de l’enregistrement source", sourceUrl: "URL de l’enregistrement",
    },
    outcomes: { CREATE: "Nouveau prospect", LINK_EXISTING: "Correspond à un prospect existant", LINK_IN_FILE: "Identique à une ligne précédente", REVIEW: "À vérifier", ALREADY_IMPORTED: "Déjà importé", DUPLICATE_SOURCE_ID: "Identifiant source répété" },
    stats: { linked: "Associés à l’existant", review: "En attente de vérification", already: "Déjà importés", branches: "Succursales possibles", unresolved: "Territoire inconnu", national: "Reste du Canada", local: "Territoire local" },
    territoryTitle: "Aperçu des territoires", assignmentTitle: "Aperçu de l’assignation",
    ownerReady: "Assignables au responsable choisi", ownerPooled: "Laissés non assignés (règles de territoire)", ownerBlocked: "Ignorés (règles de territoire)", autoAssign: "Admissibles à l’assignation automatique ensuite", noOwner: "Aucun responsable choisi : les prospects sont importés non assignés. Utilisez « Assigner les prospects » pour les répartir.",
    quality: "Qualité des adresses", rowsTitle: "Résultat par ligne (200 premières)", row: "Ligne", outcome: "Résultat", territoryCol: "Territoire", addressCol: "Adresse",
    resultTitle: "Importation terminée", created: "Prospects créés", linked: "Associés à l’existant", review: "En attente de vérification", skipped: "Ignorés / déjà importés", reviewLink: "Ouvrir les doublons",
    noConsent: "Importer une adresse courriel ne donne jamais la permission d’écrire. Aucun message n’est envoyé et personne n’est inscrit à une séquence.",
    codes: {
      INVALID_POSTAL: "Code postal invalide (conservé tel quel)", ADDRESS_INCOMPLETE: "Adresse incomplète", DUPLICATE_SOURCE_ID: "Identifiant source répété dans ce fichier", ALREADY_IMPORTED: "Déjà importé auparavant (aucun changement)",
      NEEDS_REVIEW: "Pourrait être la même entreprise : en attente de vérification", BRANCH_OF_EXISTING: "Même chaîne à une autre adresse : importée comme succursale distincte", LINKED_EXISTING: "Associé à un prospect existant", DNC_PROPAGATED: "Désabonnement appliqué au prospect existant", TERRITORY_BLOCKED: "Le responsable ne peut pas détenir ce territoire",
    },
  },
  duplicates: {
    title: "Vérification des doublons", help: "Ces lignes sources pourraient être la même entreprise qu’un prospect existant — ou une autre succursale. Rien n’est créé ni fusionné avant votre décision.",
    pending: "En attente", decided: "Décidés", empty: "Aucun doublon à vérifier.", existing: "Prospect existant", incoming: "Ligne source entrante", restricted: "Correspond à un prospect auquel vous n’avez pas accès. Un gestionnaire doit décider.",
    reasons: { NAME_ADDRESS: "Même nom et même adresse", NAME_POSTAL: "Même nom et même code postal", NAME_CITY_PHONE: "Même nom, ville et téléphone", NAME_CITY_DOMAIN: "Même nom, ville et site web", SAME_PHONE: "Même téléphone", SAME_DOMAIN: "Même site web", SAME_NAME_CITY: "Même nom et même ville", SAME_ADDRESS_OTHER_NAME: "Même adresse, nom différent" },
    link: "Même entreprise", linkHelp: "Rattache cette ligne au prospect existant. Les champs vides sont remplis ; rien n’est écrasé.", distinct: "Autre succursale", distinctHelp: "Crée un prospect distinct à partir de cette ligne.", dismiss: "Écarter la ligne", dismissHelp: "Pas un prospect utilisable. Rien n’est créé.",
    status: { PENDING: "En attente", LINKED: "Rattaché", DISTINCT: "Créé comme succursale distincte", DISMISSED: "Écarté" },
    name: "Nom", address: "Adresse", phone: "Téléphone", website: "Site web", owner: "Responsable", noteLabel: "Note (facultatif)", open: "Ouvrir le prospect",
  },
  assignment: {
    title: "Assigner les prospects", help: "Répartissez les prospects admissibles non assignés entre vos vendeurs selon le territoire, la couverture, la charge et la disponibilité. Vous voyez exactement qui reçoit quoi avant tout changement.",
    territory: "Territoire", all: "Tous les territoires", preview: "Aperçu de l’assignation", previewing: "Calcul…", confirm: "Confirmer {n} assignations", confirming: "Application…", discard: "Abandonner",
    considered: "Prospects examinés", proposed: "Proposés", perSeller: "Par vendeur", skipped: "Non assignés", result: "Assignation appliquée", applied: "Assignés", skippedNow: "Ignorés (modifiés depuis l’aperçu)",
    skipReasons: { DNC: "Ne pas contacter", ARCHIVED: "Archivé", ALREADY_OWNED: "Déjà assigné", UNRESOLVED_TERRITORY: "Adresse trop incomplète pour déterminer le territoire", NO_ELIGIBLE_SELLER: "Aucun vendeur admissible (mode, couverture, pause ou plafond)" },
    rules: "Règles : seulement les prospects actifs, non assignés, hors « ne pas contacter », avec un territoire résolu. Les territoires TERRAIN vont aux vendeurs TERRAIN tant que le TERRAIN est prioritaire ; ailleurs, vendeurs TERRAIN et À DISTANCE se partagent le travail. Les prospects déjà assignés et les opportunités actives ne sont jamais touchés.",
    sellersTitle: "Disponibilité des vendeurs", acceptsAuto: "Participe à l’assignation automatique", cap: "Plafond de prospects (vide = aucun)", save: "Enregistrer", mode: { FIELD: "TERRAIN", REMOTE: "À DISTANCE" }, workload: "Prospects actifs",
    required: "Requiert", rowsTitle: "Aperçu (100 premiers)", empty: "Rien à assigner pour le moment.", seller: "Vendeur", prospect: "Prospect", maintenanceTitle: "Recalculer les adresses et les territoires", maintenanceHelp: "À exécuter une fois après la mise à niveau du moteur de prospects ou après un changement de territoires. Ne modifie jamais les responsables, désabonnements ou activités.", maintenanceRun: "Recalculer", maintenanceDone: "{n} prospects recalculés.",
  },
  evidence: {
    title: "Vérification des preuves LCAP", help: "Les bases « adresse publiée » et « adresse communiquée » exigent l’approbation d’une deuxième personne avant d’autoriser un courriel commercial. L’approbation n’envoie ni n’inscrit rien.",
    pending: "En attente de vérification", empty: "Aucune preuve en attente de votre vérification.", recordedBy: "Consigné par", recordedAt: "Consigné le", type: "Type de preuve", sourceUrl: "URL de la source", capturedAt: "Capturé le", facts: "Faits à l’appui", role: "Pertinence pour le rôle du destinataire",
    publishedOk: "Adresse publiée sans mention « pas de messages non sollicités »", approve: "Approuver", reject: "Rejeter", reasonPlaceholder: "Motif du rejet", notePlaceholder: "Note (facultatif)", history: "Historique", contact: "Contact", kind: "Base",
    types: { WEBSITE_PUBLICATION: "Publiée sur le site de l’entreprise", DIRECTORY_LISTING: "Inscription dans un répertoire public", BUSINESS_CARD: "Carte professionnelle", EMAIL_THREAD: "Fil de courriels", FORM_SUBMISSION: "Formulaire soumis", IN_PERSON_CONVERSATION: "Conversation en personne", OTHER: "Autre" },
    status: { NOT_REQUIRED: "Aucune vérification requise", LEGACY_UNREVIEWED: "Ancien : non vérifié", PENDING_REVIEW: "En attente de vérification", APPROVED: "Approuvé", REJECTED: "Rejeté" },
    gaps: { EVIDENCE_TYPE: "Type de preuve", CAPTURED_AT: "Date de capture", SUPPORTING_FACTS: "Faits à l’appui (20 caractères ou plus)", ROLE_RELEVANCE: "Pertinence du rôle (10 caractères ou plus)", SOURCE_URL: "URL de la source", PUBLISHED_CONDITIONS: "Confirmation de l’adresse publiée" },
    form: { structured: "Preuve structurée", required: "Obligatoire pour ce type de base.", submitNote: "Cette base attendra l’approbation d’un gestionnaire ou du Super Admin avant de pouvoir autoriser un envoi." },
    reasonBlocked: { PENDING_REVIEW: "Preuve en attente d’approbation", REJECTED_EVIDENCE: "Preuve rejetée", UNREVIEWED: "Preuve non vérifiée" },
    selfApproved: "approuvé par son auteur (Super Admin)",
  },
  errors: {
    SOURCE_KEY_INVALID: "La clé de source doit compter 2 à 60 caractères : lettres, chiffres, point, tiret ou soulignement.", LAWFUL_SOURCE_REQUIRED: "Décrivez comment ces données peuvent être utilisées légalement (8 caractères ou plus).",
    SOURCE_URL_INVALID: "L’URL de la source doit commencer par http:// ou https://.", OBSERVED_AT_INVALID: "La date de collecte n’est pas valide.", MAPPING_INVALID: "L’association des colonnes n’est pas valide.", IMPORT_CONFLICT: "Une autre importation vient d’écrire les mêmes enregistrements. Rien n’a été enregistré ; téléversez de nouveau le fichier.",
    REVIEW_NOT_DECIDABLE: "Cette vérification ne peut plus être décidée.", RUN_NOT_CONFIRMABLE: "Cet aperçu d’assignation ne peut plus être confirmé.", ASSIGNMENT_FAILED: "L’assignation a échoué et rien n’a été modifié.",
    EVIDENCE_INCOMPLETE: "La preuve est incomplète. Remplissez tous les éléments requis.", CASL_NOT_AUTHORIZED: "Vous n’avez pas le droit de vérifier les preuves.", CASL_SELF_APPROVAL: "Vous ne pouvez pas approuver une preuve que vous avez consignée.",
    CASL_NOT_PENDING: "Cette preuve n’attend plus de vérification.", CASL_EVIDENCE_INCOMPLETE: "La preuve est incomplète et ne peut pas être approuvée.", INVALID_DATE: "La date n’est pas valide.", INVALID_URL: "L’URL n’est pas valide.",
  },
};

export type LeadCopy = Dict;
export function leadCopy(locale: "en" | "fr"): LeadCopy { return locale === "fr" ? leadFr : leadEn; }
