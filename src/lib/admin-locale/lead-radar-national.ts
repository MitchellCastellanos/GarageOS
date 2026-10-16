// EN/FR copy for the national discovery engine (run quality gate, province readiness, worker controls). Typed so a missing French key fails the build.
const en = {
  errors: {
    NOTE_REQUIRED: "Write a reason of at least 10 characters.",
    RUN_NOT_ACKNOWLEDGEABLE: "Only a run stopped by the quality gate can be acknowledged.",
  } as Record<string, string>,
  quality: {
    title: "Run quality gate",
    verdicts: {
      OK: "Quality checks passed.",
      ZERO_RESULTS_LEGIT: "The extractor read rows but nothing matched the plan. This is a legitimate empty result, not a failure.",
      EXTRACTION_EMPTY_SUSPECT: "STOPPED: the run produced no records and the extractor did not confirm it read any data. This is an extraction failure, not an empty province.",
      NO_COORDINATES: "STOPPED: records arrived but none carried a position. The extraction must be redone with extractor 1.2.0 or later.",
      ALL_COORDINATES_REJECTED: "STOPPED: positions were present but every one failed the Canada/province plausibility check.",
      LOW_COORDINATE_COVERAGE: "STOPPED: too few records carry a valid position (the pipeline is losing coordinates).",
      HIGH_REJECTION: "STOPPED: most records were rejected by validation (wrong file shape or wrong scope).",
      COUNT_MISMATCH: "STOPPED: the number of records received differs from the manifest.",
    } as Record<string, string>,
    counters: { received: "Records received", withPoint: "Carrying a position", valid: "Valid positions", invalid: "Invalid positions", missing: "Without a position", coverage: "Position coverage" },
    ackTitle: "Acknowledge and release this run",
    ackHelp: "Only do this when you know why the gate fired (for example a territory with no mappable positions). Your reason is audited. The already-staged candidates then become visible to qualification.",
    ackLabel: "Reason (at least 10 characters)", ackButton: "Acknowledge and mark completed", ackedBy: "Acknowledged",
  },
  diag: { DUPLICATE_OF_STAGED: "Duplicate of an already staged business (kept as evidence, never imported)", POINT_MISSING: "Record without a position", POINT_OUT_OF_CANADA: "Position outside Canada", POINT_OUT_OF_PROVINCE: "Position outside its province" } as Record<string, string>,
  dash: {
    title: "National readiness", subtitle: "One card per province or territory. Raw records, staged candidates and CRM prospects are different populations and are never added together.",
    back: "Back to Lead Radar", nav: "National readiness",
    stages: { NOT_STARTED: "Not started", QUEUED: "Queued for the worker", EXTRACTING: "Extracting", RETRYING: "Waiting to retry", STOPPED_BY_GATE: "Stopped by the quality gate", EXTRACTION_FAILED: "Extraction failed", PROCESSING: "Extraction done, processing continues", READY: "Ready" } as Record<string, string>,
    actions: {
      ACKNOWLEDGE_OR_REEXTRACT: "Open the last run: re-extract, or acknowledge it with a reason if the gate result is expected.", REQUEUE_AFTER_FAILURE: "The worker gave up after repeated failures. Check the failure code, then queue the province again.",
      RETRY_FAILED_IMPORTS: "Some candidates failed to import. They are retried only when their source facts change; review them in Candidates (import status = failed).", CLASSIFY_PENDING: "Some candidates are not classified yet; the automation classifies them on its next run.",
      WAIT_FOR_AUTOMATION: "Candidates are waiting for the next automation run (qualification, import).", NO_AUTOMATION_PROGRESS: "Candidates are waiting, but the automation is OFF, so nothing will advance until it is switched on.",
      RESOLVE_MISSING_COORDINATES: "Some prospects have no usable position on the map (Settings → Geocoding: free backfill first).",
    } as Record<string, string>,
    sections: { extraction: "Extraction", candidates: "Staged candidates", crm: "CRM prospects", health: "Errors and deferred work", schedule: "Schedule" },
    k: {
      lastSuccess: "Last successful extraction", release: "Overture release", raw: "Raw records (last run)", rawShared: "n/a (run covered several provinces)", staged: "Staged candidates", verified: "Verified repair", review: "Human review", excluded: "Excluded", duplicates: "Duplicates (kept as evidence)", unclassified: "Not classified yet",
      prospects: "Prospects imported", eligibleUnassigned: "Eligible, unassigned", assigned: "Assigned to sellers", withCoordinates: "With coordinates", missingCoordinates: "Missing coordinates", errors: "Import failures", lastRunFailure: "Last run failure", deferred: "Deferred work",
      awaitingQualification: "awaiting qualification", approvedNotImported: "approved, not yet imported", inUnfinishedRun: "in an unfinished run", lastAutomation: "Last automation run", nextAutomation: "Next automation run", nextWorker: "Next worker check", nextRefresh: "Automatic refresh not before", never: "Never", off: "Not scheduled",
      rates: "Conversion", rawToStaged: "raw → staged", stagedToVerified: "staged → verified", verifiedToProspects: "verified → prospects", prospectsWithCoordinates: "prospects with coordinates", automationOff: "Automation is OFF", noActions: "Nothing needs attention.",
    },
    controls: {
      title: "Owner controls", queue: "Queue extraction", queueConfirm: "Queue a real extraction of {province} on the automated worker? It reads the public Overture data and stages candidates; it does not import, assign or contact anyone.",
      queued: "Queued. The worker picks it up on its next check.", auto: "Refresh automatically when a newer release is published", paused: "Pause this province", interval: "Minimum days between refreshes", save: "Save schedule", saved: "Saved.", workerNote: "The worker only runs queued or opted-in provinces. Live discovery must be ON.",
    },
    totals: "All provinces",
    email: {
      title: "Email readiness (not a sending permission)", help: "A qualified business is not an email-ready lead. Each rung only counts prospects that cleared every rung before it. “Outreach ready” is the existing eligibility engine’s own verdict (reviewed CASL basis, decided language, verified sender, no suppression): nothing on this page enables sending.",
      rungs: { QUALIFIED_BUSINESS: "Qualified business", CONTACT_DISCOVERED: "Contact discovered", SOURCE_RECORDED: "Contact source recorded", EMAIL_VALIDATED: "Email validated (shape)", LANGUAGE_DECIDED: "Language decided", CASL_REVIEWED: "CASL basis reviewed", SUPPRESSION_CLEAR: "Suppression / DNC clear", OUTREACH_READY: "Outreach ready" } as Record<string, string>,
      pending: "Discovered addresses awaiting your review", province: "Province", total: "Canada",
    },
  },
};
type Dict = typeof en;
const fr: Dict = {
  errors: {
    NOTE_REQUIRED: "Écrivez une raison d’au moins 10 caractères.",
    RUN_NOT_ACKNOWLEDGEABLE: "Seule une exécution arrêtée par le contrôle de qualité peut être reconnue.",
  },
  quality: {
    title: "Contrôle de qualité de l’exécution",
    verdicts: {
      OK: "Les contrôles de qualité sont réussis.",
      ZERO_RESULTS_LEGIT: "L’extracteur a lu des lignes mais rien ne correspond au plan. C’est un résultat vide légitime, pas un échec.",
      EXTRACTION_EMPTY_SUSPECT: "ARRÊT : l’exécution n’a produit aucun enregistrement et l’extracteur n’a pas confirmé avoir lu de données. C’est un échec d’extraction, pas une province vide.",
      NO_COORDINATES: "ARRÊT : des enregistrements sont arrivés mais aucun ne portait de position. Il faut refaire l’extraction avec l’extracteur 1.2.0 ou plus récent.",
      ALL_COORDINATES_REJECTED: "ARRÊT : des positions étaient présentes mais toutes ont échoué au contrôle de plausibilité Canada/province.",
      LOW_COORDINATE_COVERAGE: "ARRÊT : trop peu d’enregistrements portent une position valide (le pipeline perd des coordonnées).",
      HIGH_REJECTION: "ARRÊT : la plupart des enregistrements ont été rejetés par la validation (mauvais format de fichier ou mauvaise portée).",
      COUNT_MISMATCH: "ARRÊT : le nombre d’enregistrements reçus diffère du manifeste.",
    },
    counters: { received: "Enregistrements reçus", withPoint: "Avec position", valid: "Positions valides", invalid: "Positions invalides", missing: "Sans position", coverage: "Couverture des positions" },
    ackTitle: "Reconnaître et libérer cette exécution",
    ackHelp: "À faire seulement si vous savez pourquoi le contrôle s’est déclenché (par exemple un territoire sans position cartographiable). Votre raison est journalisée. Les candidats déjà préparés deviennent alors visibles pour la qualification.",
    ackLabel: "Raison (au moins 10 caractères)", ackButton: "Reconnaître et marquer comme terminée", ackedBy: "Reconnue",
  },
  diag: { DUPLICATE_OF_STAGED: "Doublon d’une entreprise déjà préparée (conservé comme preuve, jamais importé)", POINT_MISSING: "Enregistrement sans position", POINT_OUT_OF_CANADA: "Position hors du Canada", POINT_OUT_OF_PROVINCE: "Position hors de sa province" },
  dash: {
    title: "Préparation nationale", subtitle: "Une carte par province ou territoire. Les enregistrements bruts, les candidats préparés et les prospects du CRM sont des populations différentes et ne sont jamais additionnés.",
    back: "Retour au Radar de leads", nav: "Préparation nationale",
    stages: { NOT_STARTED: "Non commencée", QUEUED: "En file pour le worker", EXTRACTING: "Extraction en cours", RETRYING: "En attente d’une nouvelle tentative", STOPPED_BY_GATE: "Arrêtée par le contrôle de qualité", EXTRACTION_FAILED: "Extraction en échec", PROCESSING: "Extraction terminée, traitement en cours", READY: "Prête" },
    actions: {
      ACKNOWLEDGE_OR_REEXTRACT: "Ouvrez la dernière exécution : refaites l’extraction, ou reconnaissez-la avec une raison si le résultat du contrôle est attendu.", REQUEUE_AFTER_FAILURE: "Le worker a abandonné après des échecs répétés. Vérifiez le code d’échec puis remettez la province en file.",
      RETRY_FAILED_IMPORTS: "Certains candidats n’ont pas pu être importés. Ils ne sont réessayés que si leurs faits sources changent ; consultez-les dans Candidats (état d’importation = échec).", CLASSIFY_PENDING: "Certains candidats ne sont pas encore classés ; l’automatisation les classera à son prochain cycle.",
      WAIT_FOR_AUTOMATION: "Des candidats attendent le prochain cycle d’automatisation (qualification, importation).", NO_AUTOMATION_PROGRESS: "Des candidats attendent, mais l’automatisation est DÉSACTIVÉE : rien n’avancera tant qu’elle n’est pas activée.",
      RESOLVE_MISSING_COORDINATES: "Certains prospects n’ont pas de position utilisable sur la carte (Paramètres → Géocodage : rattrapage gratuit d’abord).",
    },
    sections: { extraction: "Extraction", candidates: "Candidats préparés", crm: "Prospects du CRM", health: "Erreurs et travail différé", schedule: "Calendrier" },
    k: {
      lastSuccess: "Dernière extraction réussie", release: "Version Overture", raw: "Enregistrements bruts (dernière exécution)", rawShared: "s.o. (l’exécution couvrait plusieurs provinces)", staged: "Candidats préparés", verified: "Réparation vérifiée", review: "Révision humaine", excluded: "Exclus", duplicates: "Doublons (conservés comme preuve)", unclassified: "Pas encore classés",
      prospects: "Prospects importés", eligibleUnassigned: "Admissibles, non assignés", assigned: "Assignés aux vendeurs", withCoordinates: "Avec coordonnées", missingCoordinates: "Sans coordonnées", errors: "Échecs d’importation", lastRunFailure: "Échec de la dernière exécution", deferred: "Travail différé",
      awaitingQualification: "en attente de qualification", approvedNotImported: "approuvés, pas encore importés", inUnfinishedRun: "dans une exécution inachevée", lastAutomation: "Dernier cycle d’automatisation", nextAutomation: "Prochain cycle d’automatisation", nextWorker: "Prochaine vérification du worker", nextRefresh: "Rafraîchissement automatique pas avant", never: "Jamais", off: "Non planifié",
      rates: "Conversion", rawToStaged: "brut → préparé", stagedToVerified: "préparé → vérifié", verifiedToProspects: "vérifié → prospects", prospectsWithCoordinates: "prospects avec coordonnées", automationOff: "L’automatisation est DÉSACTIVÉE", noActions: "Rien ne demande votre attention.",
    },
    controls: {
      title: "Contrôles du propriétaire", queue: "Mettre l’extraction en file", queueConfirm: "Mettre en file une vraie extraction de {province} sur le worker automatique ? Elle lit les données publiques d’Overture et prépare des candidats ; elle n’importe, n’assigne et ne contacte personne.",
      queued: "Mise en file. Le worker la prendra à sa prochaine vérification.", auto: "Rafraîchir automatiquement quand une version plus récente est publiée", paused: "Mettre cette province en pause", interval: "Nombre minimal de jours entre deux rafraîchissements", save: "Enregistrer le calendrier", saved: "Enregistré.", workerNote: "Le worker n’exécute que les provinces mises en file ou activées. La découverte en direct doit être ACTIVÉE.",
    },
    totals: "Toutes les provinces",
    email: {
      title: "Préparation au courriel (ce n’est pas une permission d’envoi)", help: "Une entreprise qualifiée n’est pas un lead prêt pour le courriel. Chaque étape ne compte que les prospects ayant franchi toutes les précédentes. « Prêt pour la prospection » est le verdict du moteur d’admissibilité existant (base LCAP révisée, langue décidée, expéditeur vérifié, aucune suppression) : rien sur cette page n’active l’envoi.",
      rungs: { QUALIFIED_BUSINESS: "Entreprise qualifiée", CONTACT_DISCOVERED: "Contact découvert", SOURCE_RECORDED: "Source du contact consignée", EMAIL_VALIDATED: "Courriel validé (format)", LANGUAGE_DECIDED: "Langue décidée", CASL_REVIEWED: "Base LCAP révisée", SUPPRESSION_CLEAR: "Aucune suppression / NPC", OUTREACH_READY: "Prêt pour la prospection" },
      pending: "Adresses découvertes en attente de votre révision", province: "Province", total: "Canada",
    },
  },
};
export type NationalCopy = Dict;
export const nationalCopy = (l: "en" | "fr"): NationalCopy => (l === "fr" ? fr : en);
