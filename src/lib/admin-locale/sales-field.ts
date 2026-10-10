// Copy for the Field Route Planner (EN/FR). The French dictionary is typed against the English one, so a missing key fails the build.
const en = {
  errors: {
    STOP_NOT_ALLOWED: "One of the selected prospects is not in your book of business.", PROSPECT_ARCHIVED: "This prospect is archived.", PROSPECT_MERGED: "This prospect was merged into another record.",
    ALREADY_DO_NOT_CONTACT: "This prospect is marked Do Not Contact.", NOT_ASSIGNED_TO_OWNER: "This prospect is no longer assigned to you.", OUTSIDE_COVERAGE: "This prospect is outside the territories you cover.",
    LOCATION_UNAVAILABLE: "A selected prospect has no usable map position (missing, changed, ambiguous or invalid address).", TOO_MANY_STOPS: "A route can have at most 25 stops.", DUPLICATE_STOP: "A prospect can only appear once in a route.",
    INVALID_DATE: "Choose a valid date (from two days ago to one year ahead).", STALE_ROUTE: "This route was changed elsewhere. Reload it before saving again.", ROUTE_NOT_EDITABLE: "Only draft routes can be edited.",
    ROUTE_BAD_STATE: "This action is not available for the route in its current state.", ROUTE_EMPTY: "Add at least one pending stop before starting the route.", ANOTHER_ROUTE_IN_PROGRESS: "You already have a route in progress. Complete or cancel it first.",
    STOP_NOT_PENDING: "This stop already has a result.", IDEMPOTENCY_CONFLICT: "This submission was already used for a different stop.", FOLLOW_UP_DATE_REQUIRED: "Choose the date agreed with the prospect.",
    TASK_NOT_ALLOWED: "No follow-up task can be created for this result.", NOTE_REQUIRED: "Add a short note.",
  } as Record<string, string>,
  nav: "Field planner", title: "Field planner", subtitle: "Plan and run your in-person prospecting routes.",
  readOnly: "Read-only view of your team's routes. Only the FIELD seller who owns a route can change it or record visits.",
  remoteNotice: "Route planning is available to FIELD sellers only.",
  newRoute: "Plan a route", routes: "Routes", noRoutes: "No routes yet.", noRoutesHint: "Plan your first route: pick a date, choose prospects and save.", owner: "Seller", open: "Open", date: "Date", stops: "stops", progress: "done",
  status: { DRAFT: "Draft", IN_PROGRESS: "In progress", COMPLETED: "Completed", CANCELLED: "Cancelled" } as Record<string, string>,
  stopStatus: { PENDING: "To visit", VISITED: "Visited", SKIPPED: "Skipped", UNAVAILABLE: "Unavailable" } as Record<string, string>,
  planner: {
    date: "Date", name: "Route name (optional)", area: "Area", allAreas: "All areas", city: "City", allCities: "All cities", search: "Search prospects", candidates: "Your prospects", selected: "Route stops",
    noCandidates: "No prospect matches. Only your assigned, active prospects that are not Do Not Contact can be added.", noSelected: "No stops yet. Tick prospects on the left to build the route.",
    add: "Add to route", edit: "Edit", remove: "Remove", moveUp: "Move up", moveDown: "Move down", suggest: "Suggest order", suggestHelp: "Nearest-neighbour + 2-opt on straight-line distance. You can still reorder by hand.", suggested: "Order suggested.",
    save: "Save draft", saving: "Saving…", saved: "Draft saved.", start: "Start route", startConfirm: "Start this route now?", cancelRoute: "Cancel route", cancelConfirm: "Cancel this route?", complete: "Complete route", completeConfirm: "Complete the route? Remaining stops are marked skipped.",
    limit: "Maximum 25 stops.", needsLocation: "No map position", plannedElsewhere: "Already in another route today", selectedCount: "selected", loading: "Loading…",
    distance: "Straight-line distance", distanceNote: "Straight-line (as the crow flies) estimate between stops. It is NOT driving distance or time and uses no traffic data.", stage: "Stage",
    locationReason: { NONE: "Not located yet", MISSING_ADDRESS: "Address incomplete", ADDRESS_CHANGED: "Address changed — locate again", STALE: "Position is old — locate again", AMBIGUOUS: "Address is ambiguous", INVALID: "Address could not be found", ERROR: "Locating failed — try later", SYNTHETIC_IN_PRODUCTION: "Test position not allowed in production" } as Record<string, string>,
    locate: "Locate addresses", locating: "Locating…", located: "Locate request processed.",
  },
  geocoding: {
    title: "Map positions", DISABLED: "Address locating is not configured yet.", SYNTHETIC: "Test mode: positions are synthetic fixtures, not real locations.", PENDING_CONFIGURATION: "A geocoding provider is selected but not yet implemented or approved.",
    NO_PROVIDER_CONFIGURED: "No geocoding provider has been approved or configured. Prospects keep their addresses but cannot be placed on a route until locations exist.", SYNTHETIC_TEST_ONLY: "Synthetic coordinates are for development and tests only.",
    PROVIDER_NOT_IMPLEMENTED: "Provider integration is pending owner approval.", SYNTHETIC_FORBIDDEN_IN_PRODUCTION: "Synthetic coordinates are refused in production.",
    outcomes: { GEOCODED: "located", CACHED: "already up to date", AMBIGUOUS: "ambiguous", INVALID: "not found", MISSING_ADDRESS: "address incomplete", ERROR: "provider error", PROVIDER_DISABLED: "not configured", RATE_LIMITED: "rate limited", NOT_ELIGIBLE: "not eligible" } as Record<string, string>,
  },
  map: {
    title: "Map", schematic: "Schematic plot — relative positions only, no basemap", disabled: "Interactive map is not enabled: no approved tile provider is configured. The list and the schematic plot below are fully functional.", attribution: "Map data",
    stopLabel: "Stop", plotLabel: "Schematic plot of the route stops",
  },
  run: {
    next: "Next stop", noNext: "No pending stops.", navigate: "Navigate", navigateTo: "Navigate to", google: "Google Maps", apple: "Apple Maps", waze: "Waze", navNote: "Opens one destination at a time in your maps app.",
    start: "Start route", progress: "Progress", of: "of", skip: "Skip stop", skipConfirm: "Skip this stop? No visit is recorded.", skipped: "Stop skipped.", routeDone: "All stops are resolved. Complete the route when you are ready.", completed: "Route completed.",
    result: "Visit result", resultHelp: "Pick what happened. This is recorded once, even if you tap twice or lose signal.", note: "Note (optional)", followUp: "Follow-up date", followUpRequired: "Date agreed", nextAction: "Next action", submit: "Save result", saving: "Saving…", recorded: "Result recorded.", replayed: "Result was already recorded.",
    blocked: "This prospect can no longer be visited from this route.", call: "Phone", unavailable: "Unavailable", openProspect: "Open prospect",
    nextActions: { NONE: "None", CALL: "Call", EMAIL: "Email (manual task)", REVISIT: "Revisit", DEMO_PREP: "Prepare demo" } as Record<string, string>,
    noEmailNotice: "A visit never gives permission to email. Commercial email still requires a valid sending basis.",
  },
  outcomes: {
    DECISION_MAKER_CONTACTED: "Spoke with decision maker", INTERESTED: "Interested", DEMO_DISCUSSED: "Demo discussed", DEMO_SCHEDULED: "Demo agreed (date set)", FOLLOW_UP_REQUIRED: "Follow-up needed",
    DECISION_MAKER_UNAVAILABLE: "Decision maker unavailable", NO_ANSWER: "Nobody answered", BUSINESS_CLOSED: "Business closed", INVALID_LOCATION: "Wrong / invalid location", NOT_INTERESTED: "Not interested",
    CONTACT_REJECTED: "Refused to talk", DO_NOT_CONTACT: "Do not contact", NOTE_ONLY: "Note only",
  } as Record<string, string>,
  outcomeHints: {
    DECISION_MAKER_CONTACTED: "A real conversation took place.", INTERESTED: "Wants to know more.", DEMO_DISCUSSED: "A demo was talked about.", DEMO_SCHEDULED: "Creates a prep task on the agreed date.", FOLLOW_UP_REQUIRED: "Creates a follow-up task.",
    DECISION_MAKER_UNAVAILABLE: "Creates a revisit task. Does not count as a conversation.", NO_ANSWER: "Does not count as a conversation.", BUSINESS_CLOSED: "Closes the opportunity.", INVALID_LOCATION: "Flags the address as wrong.",
    NOT_INTERESTED: "Closes the opportunity.", CONTACT_REJECTED: "Closes the opportunity.", DO_NOT_CONTACT: "Stops all outreach to this prospect.", NOTE_ONLY: "",
  } as Record<string, string>,
  metrics: {
    title: "Field results (last 30 days)", routesPlanned: "Routes planned", routesCompleted: "Routes completed", stopsPlanned: "Stops planned", stopsCompleted: "Stops visited", visitsAttempted: "Visits attempted",
    decisionMakersReached: "Conversations with decision makers", demosDiscussed: "Demos discussed", demosScheduled: "Demos agreed", followUpTasks: "Follow-up tasks", visitToDemo: "Visit → demo", note: "Attempted visits and genuine conversations are counted separately.",
  },
  visit: { outcome: "Outcome", legacyHelp: "Documents an in-person visit. Only a real conversation counts as engagement for field-held territories, and it never replaces consent to email.", noteOnly: "Note only (does not count as engagement)", save: "Log visit" },
};
type Dict = typeof en;

const fr: Dict = {
  errors: {
    STOP_NOT_ALLOWED: "L’un des prospects sélectionnés ne fait pas partie de votre portefeuille.", PROSPECT_ARCHIVED: "Ce prospect est archivé.", PROSPECT_MERGED: "Ce prospect a été fusionné dans un autre dossier.",
    ALREADY_DO_NOT_CONTACT: "Ce prospect est marqué Ne pas contacter.", NOT_ASSIGNED_TO_OWNER: "Ce prospect ne vous est plus assigné.", OUTSIDE_COVERAGE: "Ce prospect est hors des territoires que vous couvrez.",
    LOCATION_UNAVAILABLE: "Un prospect sélectionné n’a pas de position utilisable (adresse manquante, modifiée, ambiguë ou invalide).", TOO_MANY_STOPS: "Une route compte au maximum 25 arrêts.", DUPLICATE_STOP: "Un prospect ne peut apparaître qu’une fois dans une route.",
    INVALID_DATE: "Choisissez une date valide (de 2 jours passés à 1 an à venir).", STALE_ROUTE: "Cette route a été modifiée ailleurs. Rechargez-la avant d’enregistrer à nouveau.", ROUTE_NOT_EDITABLE: "Seules les routes en brouillon peuvent être modifiées.",
    ROUTE_BAD_STATE: "Cette action n’est pas disponible dans l’état actuel de la route.", ROUTE_EMPTY: "Ajoutez au moins un arrêt à visiter avant de démarrer la route.", ANOTHER_ROUTE_IN_PROGRESS: "Vous avez déjà une route en cours. Terminez-la ou annulez-la d’abord.",
    STOP_NOT_PENDING: "Cet arrêt a déjà un résultat.", IDEMPOTENCY_CONFLICT: "Cette soumission a déjà servi pour un autre arrêt.", FOLLOW_UP_DATE_REQUIRED: "Choisissez la date convenue avec le prospect.",
    TASK_NOT_ALLOWED: "Aucune tâche de suivi ne peut être créée pour ce résultat.", NOTE_REQUIRED: "Ajoutez une courte note.",
  },
  nav: "Planificateur terrain", title: "Planificateur terrain", subtitle: "Planifiez et réalisez vos routes de prospection en personne.",
  readOnly: "Vue en lecture seule des routes de votre équipe. Seul le vendeur TERRAIN propriétaire d’une route peut la modifier ou consigner des visites.",
  remoteNotice: "La planification de routes est réservée aux vendeurs TERRAIN.",
  newRoute: "Planifier une route", routes: "Routes", noRoutes: "Aucune route pour l’instant.", noRoutesHint: "Planifiez votre première route : choisissez une date, des prospects, puis enregistrez.", owner: "Vendeur", open: "Ouvrir", date: "Date", stops: "arrêts", progress: "faits",
  status: { DRAFT: "Brouillon", IN_PROGRESS: "En cours", COMPLETED: "Terminée", CANCELLED: "Annulée" },
  stopStatus: { PENDING: "À visiter", VISITED: "Visité", SKIPPED: "Ignoré", UNAVAILABLE: "Indisponible" },
  planner: {
    date: "Date", name: "Nom de la route (facultatif)", area: "Secteur", allAreas: "Tous les secteurs", city: "Ville", allCities: "Toutes les villes", search: "Rechercher des prospects", candidates: "Vos prospects", selected: "Arrêts de la route",
    noCandidates: "Aucun prospect ne correspond. Seuls vos prospects assignés, actifs et non marqués Ne pas contacter peuvent être ajoutés.", noSelected: "Aucun arrêt. Cochez des prospects à gauche pour bâtir la route.",
    add: "Ajouter à la route", edit: "Modifier", remove: "Retirer", moveUp: "Monter", moveDown: "Descendre", suggest: "Suggérer un ordre", suggestHelp: "Plus proche voisin + 2-opt sur la distance à vol d’oiseau. Vous pouvez encore réordonner à la main.", suggested: "Ordre suggéré.",
    save: "Enregistrer le brouillon", saving: "Enregistrement…", saved: "Brouillon enregistré.", start: "Démarrer la route", startConfirm: "Démarrer cette route maintenant ?", cancelRoute: "Annuler la route", cancelConfirm: "Annuler cette route ?", complete: "Terminer la route", completeConfirm: "Terminer la route ? Les arrêts restants seront marqués ignorés.",
    limit: "Maximum 25 arrêts.", needsLocation: "Pas de position sur la carte", plannedElsewhere: "Déjà dans une autre route aujourd’hui", selectedCount: "sélectionné(s)", loading: "Chargement…",
    distance: "Distance à vol d’oiseau", distanceNote: "Estimation à vol d’oiseau entre les arrêts. Ce n’est PAS une distance ni une durée de conduite et aucune donnée de circulation n’est utilisée.", stage: "Étape",
    locationReason: { NONE: "Pas encore localisé", MISSING_ADDRESS: "Adresse incomplète", ADDRESS_CHANGED: "Adresse modifiée — localiser à nouveau", STALE: "Position ancienne — localiser à nouveau", AMBIGUOUS: "Adresse ambiguë", INVALID: "Adresse introuvable", ERROR: "Échec de la localisation — réessayez plus tard", SYNTHETIC_IN_PRODUCTION: "Position de test interdite en production" },
    locate: "Localiser les adresses", locating: "Localisation…", located: "Demande de localisation traitée.",
  },
  geocoding: {
    title: "Positions sur la carte", DISABLED: "La localisation d’adresses n’est pas encore configurée.", SYNTHETIC: "Mode test : les positions sont des données fictives, pas de vrais emplacements.", PENDING_CONFIGURATION: "Un fournisseur de géocodage est choisi, mais pas encore implémenté ni approuvé.",
    NO_PROVIDER_CONFIGURED: "Aucun fournisseur de géocodage n’a été approuvé ou configuré. Les prospects gardent leur adresse, mais ne peuvent pas être placés sur une route tant que les positions n’existent pas.", SYNTHETIC_TEST_ONLY: "Les coordonnées fictives servent uniquement au développement et aux tests.",
    PROVIDER_NOT_IMPLEMENTED: "L’intégration du fournisseur attend l’approbation du propriétaire.", SYNTHETIC_FORBIDDEN_IN_PRODUCTION: "Les coordonnées fictives sont refusées en production.",
    outcomes: { GEOCODED: "localisé", CACHED: "déjà à jour", AMBIGUOUS: "ambigu", INVALID: "introuvable", MISSING_ADDRESS: "adresse incomplète", ERROR: "erreur du fournisseur", PROVIDER_DISABLED: "non configuré", RATE_LIMITED: "limite atteinte", NOT_ELIGIBLE: "non admissible" },
  },
  map: {
    title: "Carte", schematic: "Tracé schématique — positions relatives seulement, sans fond de carte", disabled: "La carte interactive n’est pas activée : aucun fournisseur de tuiles approuvé n’est configuré. La liste et le tracé schématique ci-dessous fonctionnent pleinement.", attribution: "Données cartographiques",
    stopLabel: "Arrêt", plotLabel: "Tracé schématique des arrêts de la route",
  },
  run: {
    next: "Prochain arrêt", noNext: "Aucun arrêt à visiter.", navigate: "Naviguer", navigateTo: "Naviguer vers", google: "Google Maps", apple: "Plans Apple", waze: "Waze", navNote: "Ouvre une seule destination à la fois dans votre application de cartes.",
    start: "Démarrer la route", progress: "Progression", of: "sur", skip: "Ignorer l’arrêt", skipConfirm: "Ignorer cet arrêt ? Aucune visite n’est consignée.", skipped: "Arrêt ignoré.", routeDone: "Tous les arrêts sont réglés. Terminez la route quand vous êtes prêt.", completed: "Route terminée.",
    result: "Résultat de la visite", resultHelp: "Choisissez ce qui s’est passé. C’est consigné une seule fois, même si vous touchez deux fois ou perdez le signal.", note: "Note (facultatif)", followUp: "Date de suivi", followUpRequired: "Date convenue", nextAction: "Prochaine action", submit: "Enregistrer le résultat", saving: "Enregistrement…", recorded: "Résultat consigné.", replayed: "Le résultat était déjà consigné.",
    blocked: "Ce prospect ne peut plus être visité depuis cette route.", call: "Téléphone", unavailable: "Indisponible", openProspect: "Ouvrir le prospect",
    nextActions: { NONE: "Aucune", CALL: "Appel", EMAIL: "Courriel (tâche manuelle)", REVISIT: "Revisiter", DEMO_PREP: "Préparer la démo" },
    noEmailNotice: "Une visite ne donne jamais la permission d’envoyer un courriel. Tout courriel commercial exige toujours une base d’envoi valide.",
  },
  outcomes: {
    DECISION_MAKER_CONTACTED: "Parlé au décideur", INTERESTED: "Intéressé", DEMO_DISCUSSED: "Démo discutée", DEMO_SCHEDULED: "Démo convenue (date fixée)", FOLLOW_UP_REQUIRED: "Suivi nécessaire",
    DECISION_MAKER_UNAVAILABLE: "Décideur absent", NO_ANSWER: "Personne n’a répondu", BUSINESS_CLOSED: "Commerce fermé", INVALID_LOCATION: "Adresse erronée / invalide", NOT_INTERESTED: "Pas intéressé",
    CONTACT_REJECTED: "A refusé de discuter", DO_NOT_CONTACT: "Ne pas contacter", NOTE_ONLY: "Note seulement",
  },
  outcomeHints: {
    DECISION_MAKER_CONTACTED: "Une vraie conversation a eu lieu.", INTERESTED: "Veut en savoir plus.", DEMO_DISCUSSED: "Une démo a été évoquée.", DEMO_SCHEDULED: "Crée une tâche de préparation à la date convenue.", FOLLOW_UP_REQUIRED: "Crée une tâche de suivi.",
    DECISION_MAKER_UNAVAILABLE: "Crée une tâche de revisite. Ne compte pas comme une conversation.", NO_ANSWER: "Ne compte pas comme une conversation.", BUSINESS_CLOSED: "Ferme l’opportunité.", INVALID_LOCATION: "Signale l’adresse comme erronée.",
    NOT_INTERESTED: "Ferme l’opportunité.", CONTACT_REJECTED: "Ferme l’opportunité.", DO_NOT_CONTACT: "Arrête toute prospection de ce prospect.", NOTE_ONLY: "",
  },
  metrics: {
    title: "Résultats terrain (30 derniers jours)", routesPlanned: "Routes planifiées", routesCompleted: "Routes terminées", stopsPlanned: "Arrêts planifiés", stopsCompleted: "Arrêts visités", visitsAttempted: "Visites tentées",
    decisionMakersReached: "Conversations avec des décideurs", demosDiscussed: "Démos discutées", demosScheduled: "Démos convenues", followUpTasks: "Tâches de suivi", visitToDemo: "Visite → démo", note: "Les visites tentées et les vraies conversations sont comptées séparément.",
  },
  visit: { outcome: "Résultat", legacyHelp: "Documente une visite en personne. Seule une vraie conversation compte comme engagement pour les territoires terrain, et elle ne remplace jamais le consentement à recevoir des courriels.", noteOnly: "Note seulement (ne compte pas comme engagement)", save: "Consigner la visite" },
};

export type FieldCopy = Dict;
export function fieldCopy(locale: "en" | "fr"): FieldCopy { return locale === "fr" ? fr : en; }
export function fieldError(locale: "en" | "fr", code: string | undefined): string | undefined { return fieldCopy(locale).errors[code ?? ""]; }
