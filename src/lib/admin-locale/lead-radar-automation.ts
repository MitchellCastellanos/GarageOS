// EN/FR copy for Lead Radar automation (policy → CRM handoff → assignment → outreach eligibility → pilot). The French object is typed against the English one;
// tests/lead-radar-automation-domain.test.ts also checks that every reason/issue code the code can emit has a label in both languages.
export const autoEn = {
  nav: "Automation",
  title: "Lead Radar automation",
  subtitle: "Approve a policy once; qualified businesses flow into the CRM and to the right seller automatically. You review only the exceptions.",
  back: "Back to Lead Radar",
  stages: {
    acquisition: "1 · Acquisition", qualification: "2 · Qualification", crm: "3 · CRM import", assignment: "4 · Assignment", eligibility: "5 · Outreach eligibility", sending: "6 · Sending",
  },
  notContacted: "Imported prospects are not contacted prospects. Only stage 6 counts emails, and only for the controlled pilot.",
  status: {
    on: "Automation is ON", off: "Automation is OFF", paused: "Paused", noPolicy: "No active policy", policy: "Active policy", version: "version", lastTick: "Last run", never: "Never",
    help: "While OFF nothing is qualified, imported, assigned or enrolled. Existing prospects and candidates are never modified by switching it on or off.",
  },
  attention: { title: "Needs attention", none: "Nothing needs intervention." },
  issues: {
    NO_ACTIVE_POLICY: "No qualification policy is active. Preview and activate one below.", NO_ASSIGNMENT_SELLER: "Automation is on but no seller is named for automatic assignment.",
    SENDER_NOT_ACTIVE: "A named seller has no active sender identity (Sales communications settings).", SENDER_REPLY_PATH_UNVERIFIED: "A named seller’s reply path is not verified by a real round trip.",
    IMPORT_FAILED: "Candidates failed to import (see reasons below).", IMPORT_STALLED: "Approved candidates stopped being retried after repeated attempts.",
    AUTOMATION_TICK_FAILED: "A recent automation run failed (see recent runs).", ENROLLMENTS_PAUSED: "Pilot enrollments are paused (see reasons in stage 6).", RUN_INCOMPLETE: "Some candidates belong to an unfinished extraction and wait for it to complete.",
  } as Record<string, string>,
  acquisition: { discovered: "Candidates discovered", lastRelease: "Latest release staged", budget: "Discovery budget this month", open: "Open Lead Radar", dataOnly: "Open data: no per-record fee." },
  qualification: {
    auto: "Auto-qualified", review: "Awaiting exception review", blocked: "Blocked", awaiting: "Not yet evaluated", waitingRun: "Waiting for an unfinished run", outOfScope: "Outside the policy’s provinces",
    reviewQueue: "Review the exceptions", reasonsReview: "Why they need a human", reasonsBlocked: "Why they are blocked", reasonsAuto: "Notes on auto-qualified",
    reasons: {
      LICENSE_BLOCKED: "Licence not permitted", EXCLUDED_TIER: "Not an automotive target", INSUFFICIENT_CONTACT: "No phone or address", SOURCE_PROVENANCE_MISSING: "Source provenance missing", CHAIN_BLOCKED_BY_POLICY: "Chain blocked by policy",
      AMBIGUOUS_MATCH: "Ambiguous match with the CRM", BRANCH_RELATIONSHIP: "Possible branch of an existing business", EXISTING_MATCH_REVIEW: "Matches an existing prospect (policy asks for review)", QUESTIONABLE_CATEGORY: "Questionable automotive category",
      SECONDARY_CATEGORY: "Secondary category (body, glass, dealer, parts…)", CHAIN_SIGNAL: "Chain or franchise signal", NO_LOCATION: "No street address or postal code", NO_REACHABLE_CHANNEL: "No phone or website",
      TERRITORY_UNRESOLVED: "Territory cannot be resolved", SOURCE_CHANGED: "Source changed after approval", FLAG_LOW_CONFIDENCE: "Low source confidence", FLAG_ADDRESS_INCOMPLETE: "Incomplete address",
      FLAG_GEO_POSTAL_MISMATCH: "Region and postal code disagree", FLAG_GEO_UNRESOLVED: "Province unresolved", FLAG_GEO_REGION_MISSING: "Region missing", FLAG_GEO_COUNTRY_MISSING: "Country missing", FLAG_WEBSITE_IS_SOCIAL: "Only a social page",
      AUTO_LINK_EXISTING: "Links to an existing prospect (enriches, never overwrites)", OUT_OF_POLICY_SCOPE: "Outside the policy’s provinces",
    } as Record<string, string>,
  },
  crm: {
    created: "Prospects created", linked: "Linked to existing", sentToReview: "Held for duplicate review", skipped: "Skipped", failed: "Failed", approvedWaiting: "Approved, waiting to import", stalled: "Stalled",
    batches: "Recent handoffs", automatic: "automatic", manual: "manual", failedReasons: "Failure codes",
  },
  assignment: {
    field: "Assigned · FIELD", remote: "Assigned · REMOTE", untagged: "Assigned · earlier / manual", unassigned: "Unassigned", lastSkips: "Why some stayed unassigned (last run)",
    sellers: "Seller workload", seller: "Seller", mode: "Mode", accepts: "Takes new leads", named: "Auto-assign", active: "Active", fieldLoad: "FIELD", remoteLoad: "REMOTE", caps: "Caps", sender: "Sender",
    yes: "Yes", no: "No", senderReady: "Ready", senderNotReady: "Not ready", replyUnverified: "Reply path unverified", noSender: "No sender",
    skips: {
      DNC: "Do not contact", ARCHIVED: "Archived", ALREADY_OWNED: "Already owned", UNRESOLVED_TERRITORY: "Territory unresolved", NO_ELIGIBLE_SELLER: "No eligible seller (mode, coverage or pause)",
      CAPACITY_EXHAUSTED: "Seller capacity exhausted", LANGUAGE_MISMATCH: "No seller works in this language",
    } as Record<string, string>,
    notes: { NO_ELIGIBLE_SELLERS_CONFIGURED: "No seller is named for automatic assignment.", NO_CAPACITY: "Every named seller is at capacity.", NO_ACTIVE_SELLER: "No named seller is active." } as Record<string, string>,
  },
  eligibility: {
    eligible: "Eligible for the pilot", notEligible: "Not eligible for automated outreach", awaiting: "Awaiting assessment", reasons: "Why not eligible",
    legal: "Eligibility is not permission to send. A published email address is not consent: without a reviewed CASL basis a contact stays in the CRM as not eligible. Legal review of the basis rules is still required before any wider use.",
    reasonLabels: {
      NO_OWNER: "No assigned seller", SELLER_INACTIVE: "Seller inactive", SELLER_BOOKING_NOT_ENABLED: "Seller’s booking page is not enabled (the standard templates link to it)", PROSPECT_ARCHIVED: "Archived", PROSPECT_DNC: "Do not contact", OPPORTUNITY_CLOSED: "Opportunity closed", NO_EMAILABLE_CONTACT: "No contact with an email address",
      CONTACT_DNC: "Contact marked do not contact", ADDRESS_SUPPRESSED: "Address unsubscribed / suppressed", ADDRESS_BOUNCED: "Address bounced or complained", NO_SENDING_BASIS: "No documented CASL basis", BASIS_EXPIRED: "CASL basis expired",
      BASIS_REVOKED: "CASL basis revoked", BASIS_WEAK_EVIDENCE: "CASL evidence too thin", BASIS_PENDING_REVIEW: "CASL evidence awaiting approval", BASIS_REJECTED: "CASL evidence rejected", BASIS_UNREVIEWED: "CASL evidence not reviewed",
      LANGUAGE_UNRESOLVED: "Language not decided (EN/FR)", SENDER_IDENTITY_MISSING: "Seller has no sender identity", SENDER_NOT_ACTIVE: "Sender identity not active", SENDER_DOMAIN_NOT_APPROVED: "Sender domain not approved",
      SENDER_REPLY_PATH_UNVERIFIED: "Sender reply path not verified", FIELD_TERRITORY_FIRST_CONTACT: "FIELD territory: no automated cold first contact",
    } as Record<string, string>,
  },
  sending: {
    pilot: "Controlled pilot", sendingOff: "Company-wide sending is OFF (Sales communications settings).", sendingOn: "Company-wide sending is ON.", enrolled: "Pilot enrollments", active: "Active", paused: "Paused", stopped: "Stopped", completed: "Completed",
    messages: "Messages", queued: "Queued", sent: "Sent", delivered: "Delivered", failed: "Failed / bounced", replied: "Replied", unsubscribed: "Unsubscribed", meetings: "Meetings booked", pausedReasons: "Why enrollments are paused", none: "No pilot activity yet.",
  },
  coverage: { title: "Province and territory coverage", province: "Province / territory", discovered: "Discovered", imported: "Imported", never: "Never extracted" },
  policy: {
    title: "Qualification policy", help: "A policy is a versioned set of rules. Preview it on the staged candidates, then activate it. You approve the policy, not each business.",
    active: "Active", draft: "Draft", superseded: "Superseded", none: "No policy yet.", create: "New policy draft", name: "Name", note: "Note (optional)", provinces: "Provinces it may advance (none ticked = all)",
    secondary: "Secondary categories (body, glass, dealers, parts…)", chain: "Chain / franchise signal", existing: "Strong match to an existing prospect", requireLocation: "Require a street address or postal code",
    requireChannel: "Require a phone or website", flags: "Quality flags that send a record to a human", review: "Human review", auto: "Advance automatically", block: "Block", autoLink: "Link automatically (enrich, never overwrite)",
    alwaysHuman: "Always human, whatever the policy: ambiguous matches, possible branches, unknown categories, source changes after approval. Always blocked: licences not permitted, excluded or unusable records. A rejected candidate is never reopened.",
    saveDraft: "Save as new draft", preview: "Preview on staged candidates", previewing: "Evaluating…", activate: "Activate", activating: "Activating…", activateConfirm: "Activate this policy? Qualifying candidates will advance automatically once automation is on.",
    previewResult: "Preview", evaluated: "Evaluated", truncated: "Partial preview (time or row limit reached).", lanes: { AUTO_ELIGIBLE: "Auto-eligible", HUMAN_REVIEW: "Human review", BLOCKED: "Blocked", OUT_OF_SCOPE: "Outside scope" } as Record<string, string>,
    changes: "Changes versus the last evaluation", needsPreview: "Preview this draft before activating.", saved: "Draft saved.", activated: "Policy activated.", previewedAt: "Previewed",
    flagLabels: { LOW_CONFIDENCE: "Low source confidence", ADDRESS_INCOMPLETE: "Incomplete address", GEO_POSTAL_MISMATCH: "Region/postal mismatch", GEO_UNRESOLVED: "Province unresolved", GEO_REGION_MISSING: "Region missing", GEO_COUNTRY_MISSING: "Country missing", WEBSITE_IS_SOCIAL: "Only a social page" } as Record<string, string>,
  },
  controls: {
    title: "Automation controls", master: "Master switch", turnOn: "Turn automation on", pause: "Pause automation", pauseReason: "Reason (optional)", runNow: "Run one cycle now", running: "Running…", ran: "Cycle finished.",
    stages: "Stages", qualify: "Qualify candidates by policy", import: "Import auto-qualified candidates into the CRM", assign: "Assign imported prospects to the named sellers", eligibility: "Assess outreach eligibility",
    release: "Return untouched, auto-assigned prospects when a seller becomes unavailable", chunk: "Import chunk size (1–200)", sellers: "Sellers who receive automatic assignments", sellersHelp: "Nobody is eligible until named here. Only active Sales Rep accounts can be listed; the Super Admin account never is.",
    pilotTitle: "Controlled outreach pilot", pilotHelp: "Enrolls only eligible prospects into one active sequence, from the assigned seller’s own sender, under daily and total caps. Company-wide sending must also be on.",
    sequence: "Pilot sequence", noSequence: "— choose an active sequence —", daily: "Daily enrollment cap", total: "Total pilot cap", pilotOn: "Start pilot", pilotOff: "Stop pilot", pilotState: "Pilot", save: "Save", saving: "Saving…", saved: "Saved.",
  },
  runs: { title: "Recent automation runs", empty: "No runs yet.", started: "Started", trigger: "Trigger", status: "Status", states: { RUNNING: "Running", COMPLETED: "Completed", FAILED: "Failed", SKIPPED: "Skipped" } as Record<string, string> },
  errors: {
    INVALID_POLICY: "The policy rules are not valid.", POLICY_VERSION_CONFLICT: "Another draft was created at the same moment. Try again.", POLICY_NOT_DRAFT: "Only a draft can be activated.", POLICY_NOT_PREVIEWED: "Preview this draft before activating it.",
    POLICY_PREVIEW_STALE: "The preview is older than 24 hours. Preview again.", POLICY_TAMPERED: "The stored rules no longer match their recorded fingerprint.", NO_ACTIVE_POLICY: "Activate a qualification policy first.", INVALID_LIMITS: "Check the limits (chunk 1–200, daily ≤ total).",
    INVALID_SELLER: "Only active Sales Rep accounts can receive automatic assignments.", PILOT_NEEDS_SEQUENCE: "Choose a pilot sequence first.", PILOT_NEEDS_SELLER: "Name at least one seller first.", SEQUENCE_NOT_ACTIVE: "The pilot sequence must be active.",
    AUTOMATION_DISABLED: "Automation is off. Turn it on first.", ALREADY_RUNNING: "A cycle is already running.",
  } as Record<string, string>,
};

export type AutoCopy = typeof autoEn;

export const autoFr: AutoCopy = {
  nav: "Automatisation",
  title: "Automatisation du Radar de leads",
  subtitle: "Approuvez une politique une fois; les entreprises qualifiées entrent au CRM et vont au bon vendeur automatiquement. Vous ne révisez que les exceptions.",
  back: "Retour au Radar de leads",
  stages: {
    acquisition: "1 · Acquisition", qualification: "2 · Qualification", crm: "3 · Importation au CRM", assignment: "4 · Assignation", eligibility: "5 · Admissibilité au démarchage", sending: "6 · Envoi",
  },
  notContacted: "Un prospect importé n’est pas un prospect contacté. Seule l’étape 6 compte des courriels, et seulement pour le pilote contrôlé.",
  status: {
    on: "L’automatisation est ACTIVE", off: "L’automatisation est INACTIVE", paused: "En pause", noPolicy: "Aucune politique active", policy: "Politique active", version: "version", lastTick: "Dernier cycle", never: "Jamais",
    help: "Tant qu’elle est inactive, rien n’est qualifié, importé, assigné ni inscrit. Activer ou désactiver l’automatisation ne modifie jamais les prospects ni les candidats existants.",
  },
  attention: { title: "À traiter", none: "Aucune intervention nécessaire." },
  issues: {
    NO_ACTIVE_POLICY: "Aucune politique de qualification n’est active. Prévisualisez-en une et activez-la ci-dessous.", NO_ASSIGNMENT_SELLER: "L’automatisation est active, mais aucun vendeur n’est désigné pour l’assignation automatique.",
    SENDER_NOT_ACTIVE: "Un vendeur désigné n’a pas d’identité d’expéditeur active (paramètres des communications de vente).", SENDER_REPLY_PATH_UNVERIFIED: "Le chemin de réponse d’un vendeur désigné n’a pas été vérifié par un aller-retour réel.",
    IMPORT_FAILED: "Des candidats n’ont pas pu être importés (voir les causes ci-dessous).", IMPORT_STALLED: "Des candidats approuvés ne sont plus réessayés après des tentatives répétées.",
    AUTOMATION_TICK_FAILED: "Un cycle d’automatisation récent a échoué (voir les cycles récents).", ENROLLMENTS_PAUSED: "Des inscriptions du pilote sont en pause (voir les causes à l’étape 6).", RUN_INCOMPLETE: "Certains candidats viennent d’une extraction inachevée et attendent qu’elle se termine.",
  },
  acquisition: { discovered: "Candidats découverts", lastRelease: "Dernière version importée", budget: "Budget de découverte ce mois-ci", open: "Ouvrir le Radar de leads", dataOnly: "Données ouvertes : aucuns frais par enregistrement." },
  qualification: {
    auto: "Qualifiés automatiquement", review: "En attente de révision (exceptions)", blocked: "Bloqués", awaiting: "Pas encore évalués", waitingRun: "En attente d’une extraction inachevée", outOfScope: "Hors des provinces de la politique",
    reviewQueue: "Réviser les exceptions", reasonsReview: "Pourquoi ils demandent un humain", reasonsBlocked: "Pourquoi ils sont bloqués", reasonsAuto: "Notes sur les qualifiés automatiquement",
    reasons: {
      LICENSE_BLOCKED: "Licence non permise", EXCLUDED_TIER: "Pas une cible automobile", INSUFFICIENT_CONTACT: "Ni téléphone ni adresse", SOURCE_PROVENANCE_MISSING: "Provenance de la source manquante", CHAIN_BLOCKED_BY_POLICY: "Chaîne bloquée par la politique",
      AMBIGUOUS_MATCH: "Correspondance ambiguë avec le CRM", BRANCH_RELATIONSHIP: "Succursale possible d’une entreprise existante", EXISTING_MATCH_REVIEW: "Correspond à un prospect existant (la politique demande une révision)", QUESTIONABLE_CATEGORY: "Catégorie automobile discutable",
      SECONDARY_CATEGORY: "Catégorie secondaire (carrosserie, vitres, concessionnaire, pièces…)", CHAIN_SIGNAL: "Signal de chaîne ou de franchise", NO_LOCATION: "Ni adresse civique ni code postal", NO_REACHABLE_CHANNEL: "Ni téléphone ni site web",
      TERRITORY_UNRESOLVED: "Territoire impossible à déterminer", SOURCE_CHANGED: "Source modifiée après l’approbation", FLAG_LOW_CONFIDENCE: "Faible confiance de la source", FLAG_ADDRESS_INCOMPLETE: "Adresse incomplète",
      FLAG_GEO_POSTAL_MISMATCH: "Région et code postal en désaccord", FLAG_GEO_UNRESOLVED: "Province non déterminée", FLAG_GEO_REGION_MISSING: "Région manquante", FLAG_GEO_COUNTRY_MISSING: "Pays manquant", FLAG_WEBSITE_IS_SOCIAL: "Seulement une page sociale",
      AUTO_LINK_EXISTING: "Lié à un prospect existant (enrichit, n’écrase jamais)", OUT_OF_POLICY_SCOPE: "Hors des provinces de la politique",
    },
  },
  crm: {
    created: "Prospects créés", linked: "Liés à un existant", sentToReview: "En révision des doublons", skipped: "Ignorés", failed: "Échecs", approvedWaiting: "Approuvés, en attente d’importation", stalled: "Bloqués",
    batches: "Transmissions récentes", automatic: "automatique", manual: "manuelle", failedReasons: "Codes d’échec",
  },
  assignment: {
    field: "Assignés · TERRAIN", remote: "Assignés · DISTANT", untagged: "Assignés · antérieurs / manuels", unassigned: "Non assignés", lastSkips: "Pourquoi certains sont restés non assignés (dernier cycle)",
    sellers: "Charge des vendeurs", seller: "Vendeur", mode: "Mode", accepts: "Reçoit de nouveaux leads", named: "Assignation auto", active: "Actifs", fieldLoad: "TERRAIN", remoteLoad: "DISTANT", caps: "Plafonds", sender: "Expéditeur",
    yes: "Oui", no: "Non", senderReady: "Prêt", senderNotReady: "Non prêt", replyUnverified: "Chemin de réponse non vérifié", noSender: "Aucun expéditeur",
    skips: {
      DNC: "Ne pas contacter", ARCHIVED: "Archivé", ALREADY_OWNED: "Déjà assigné", UNRESOLVED_TERRITORY: "Territoire non déterminé", NO_ELIGIBLE_SELLER: "Aucun vendeur admissible (mode, couverture ou pause)",
      CAPACITY_EXHAUSTED: "Capacité des vendeurs atteinte", LANGUAGE_MISMATCH: "Aucun vendeur ne travaille dans cette langue",
    },
    notes: { NO_ELIGIBLE_SELLERS_CONFIGURED: "Aucun vendeur n’est désigné pour l’assignation automatique.", NO_CAPACITY: "Chaque vendeur désigné est à pleine capacité.", NO_ACTIVE_SELLER: "Aucun vendeur désigné n’est actif." },
  },
  eligibility: {
    eligible: "Admissibles au pilote", notEligible: "Non admissibles au démarchage automatisé", awaiting: "En attente d’évaluation", reasons: "Pourquoi non admissibles",
    legal: "L’admissibilité n’est pas une permission d’envoyer. Une adresse courriel publiée n’est pas un consentement : sans base LCAP révisée, un contact reste au CRM comme non admissible. Une révision juridique des règles de base reste requise avant tout usage élargi.",
    reasonLabels: {
      NO_OWNER: "Aucun vendeur assigné", SELLER_INACTIVE: "Vendeur inactif", SELLER_BOOKING_NOT_ENABLED: "La page de réservation du vendeur n’est pas activée (les modèles standards y renvoient)", PROSPECT_ARCHIVED: "Archivé", PROSPECT_DNC: "Ne pas contacter", OPPORTUNITY_CLOSED: "Occasion fermée", NO_EMAILABLE_CONTACT: "Aucun contact avec une adresse courriel",
      CONTACT_DNC: "Contact marqué ne pas contacter", ADDRESS_SUPPRESSED: "Adresse désabonnée / supprimée", ADDRESS_BOUNCED: "Adresse en rebond ou plainte", NO_SENDING_BASIS: "Aucune base LCAP documentée", BASIS_EXPIRED: "Base LCAP expirée",
      BASIS_REVOKED: "Base LCAP révoquée", BASIS_WEAK_EVIDENCE: "Preuve LCAP trop mince", BASIS_PENDING_REVIEW: "Preuve LCAP en attente d’approbation", BASIS_REJECTED: "Preuve LCAP rejetée", BASIS_UNREVIEWED: "Preuve LCAP non révisée",
      LANGUAGE_UNRESOLVED: "Langue non décidée (EN/FR)", SENDER_IDENTITY_MISSING: "Le vendeur n’a pas d’identité d’expéditeur", SENDER_NOT_ACTIVE: "Identité d’expéditeur inactive", SENDER_DOMAIN_NOT_APPROVED: "Domaine d’expédition non approuvé",
      SENDER_REPLY_PATH_UNVERIFIED: "Chemin de réponse de l’expéditeur non vérifié", FIELD_TERRITORY_FIRST_CONTACT: "Territoire TERRAIN : pas de premier contact automatisé à froid",
    },
  },
  sending: {
    pilot: "Pilote contrôlé", sendingOff: "L’envoi à l’échelle de l’entreprise est DÉSACTIVÉ (paramètres des communications de vente).", sendingOn: "L’envoi à l’échelle de l’entreprise est ACTIVÉ.", enrolled: "Inscriptions du pilote", active: "Actives", paused: "En pause", stopped: "Arrêtées", completed: "Terminées",
    messages: "Messages", queued: "En file", sent: "Envoyés", delivered: "Livrés", failed: "Échecs / rebonds", replied: "Réponses", unsubscribed: "Désabonnements", meetings: "Rencontres réservées", pausedReasons: "Pourquoi les inscriptions sont en pause", none: "Aucune activité du pilote.",
  },
  coverage: { title: "Couverture par province et territoire", province: "Province / territoire", discovered: "Découverts", imported: "Importés", never: "Jamais extrait" },
  policy: {
    title: "Politique de qualification", help: "Une politique est un ensemble de règles versionné. Prévisualisez-la sur les candidats importés, puis activez-la. Vous approuvez la politique, pas chaque entreprise.",
    active: "Active", draft: "Brouillon", superseded: "Remplacée", none: "Aucune politique.", create: "Nouveau brouillon de politique", name: "Nom", note: "Note (facultatif)", provinces: "Provinces qu’elle peut faire avancer (aucune cochée = toutes)",
    secondary: "Catégories secondaires (carrosserie, vitres, concessionnaires, pièces…)", chain: "Signal de chaîne / franchise", existing: "Correspondance forte avec un prospect existant", requireLocation: "Exiger une adresse civique ou un code postal",
    requireChannel: "Exiger un téléphone ou un site web", flags: "Indicateurs de qualité qui envoient un dossier à un humain", review: "Révision humaine", auto: "Faire avancer automatiquement", block: "Bloquer", autoLink: "Lier automatiquement (enrichir, jamais écraser)",
    alwaysHuman: "Toujours humain, quelle que soit la politique : correspondances ambiguës, succursales possibles, catégories inconnues, changements de source après approbation. Toujours bloqués : licences non permises, enregistrements exclus ou inutilisables. Un candidat rejeté n’est jamais rouvert.",
    saveDraft: "Enregistrer comme nouveau brouillon", preview: "Prévisualiser sur les candidats", previewing: "Évaluation…", activate: "Activer", activating: "Activation…", activateConfirm: "Activer cette politique? Les candidats qualifiés avanceront automatiquement dès que l’automatisation sera active.",
    previewResult: "Aperçu", evaluated: "Évalués", truncated: "Aperçu partiel (limite de temps ou de lignes atteinte).", lanes: { AUTO_ELIGIBLE: "Admissibles automatiquement", HUMAN_REVIEW: "Révision humaine", BLOCKED: "Bloqués", OUT_OF_SCOPE: "Hors portée" },
    changes: "Changements par rapport à la dernière évaluation", needsPreview: "Prévisualisez ce brouillon avant de l’activer.", saved: "Brouillon enregistré.", activated: "Politique activée.", previewedAt: "Prévisualisé",
    flagLabels: { LOW_CONFIDENCE: "Faible confiance de la source", ADDRESS_INCOMPLETE: "Adresse incomplète", GEO_POSTAL_MISMATCH: "Région / code postal en désaccord", GEO_UNRESOLVED: "Province non déterminée", GEO_REGION_MISSING: "Région manquante", GEO_COUNTRY_MISSING: "Pays manquant", WEBSITE_IS_SOCIAL: "Seulement une page sociale" },
  },
  controls: {
    title: "Contrôles de l’automatisation", master: "Interrupteur principal", turnOn: "Activer l’automatisation", pause: "Mettre en pause", pauseReason: "Raison (facultatif)", runNow: "Lancer un cycle maintenant", running: "En cours…", ran: "Cycle terminé.",
    stages: "Étapes", qualify: "Qualifier les candidats selon la politique", import: "Importer les candidats qualifiés au CRM", assign: "Assigner les prospects importés aux vendeurs désignés", eligibility: "Évaluer l’admissibilité au démarchage",
    release: "Retourner les prospects assignés automatiquement et intacts quand un vendeur devient indisponible", chunk: "Taille des blocs d’importation (1–200)", sellers: "Vendeurs qui reçoivent des assignations automatiques", sellersHelp: "Personne n’est admissible tant qu’il n’est pas désigné ici. Seuls les comptes de représentants actifs peuvent figurer; le compte Super administrateur jamais.",
    pilotTitle: "Pilote de démarchage contrôlé", pilotHelp: "N’inscrit que des prospects admissibles à une séquence active, depuis l’expéditeur du vendeur assigné, avec plafonds quotidien et total. L’envoi à l’échelle de l’entreprise doit aussi être activé.",
    sequence: "Séquence du pilote", noSequence: "— choisir une séquence active —", daily: "Plafond d’inscriptions par jour", total: "Plafond total du pilote", pilotOn: "Démarrer le pilote", pilotOff: "Arrêter le pilote", pilotState: "Pilote", save: "Enregistrer", saving: "Enregistrement…", saved: "Enregistré.",
  },
  runs: { title: "Cycles d’automatisation récents", empty: "Aucun cycle.", started: "Début", trigger: "Déclencheur", status: "Statut", states: { RUNNING: "En cours", COMPLETED: "Terminé", FAILED: "Échec", SKIPPED: "Ignoré" } },
  errors: {
    INVALID_POLICY: "Les règles de la politique ne sont pas valides.", POLICY_VERSION_CONFLICT: "Un autre brouillon a été créé au même moment. Réessayez.", POLICY_NOT_DRAFT: "Seul un brouillon peut être activé.", POLICY_NOT_PREVIEWED: "Prévisualisez ce brouillon avant de l’activer.",
    POLICY_PREVIEW_STALE: "L’aperçu date de plus de 24 heures. Prévisualisez de nouveau.", POLICY_TAMPERED: "Les règles enregistrées ne correspondent plus à leur empreinte.", NO_ACTIVE_POLICY: "Activez d’abord une politique de qualification.", INVALID_LIMITS: "Vérifiez les limites (bloc 1–200, quotidien ≤ total).",
    INVALID_SELLER: "Seuls les comptes de représentants actifs peuvent recevoir des assignations automatiques.", PILOT_NEEDS_SEQUENCE: "Choisissez d’abord une séquence pour le pilote.", PILOT_NEEDS_SELLER: "Désignez d’abord au moins un vendeur.", SEQUENCE_NOT_ACTIVE: "La séquence du pilote doit être active.",
    AUTOMATION_DISABLED: "L’automatisation est inactive. Activez-la d’abord.", ALREADY_RUNNING: "Un cycle est déjà en cours.",
  },
};
