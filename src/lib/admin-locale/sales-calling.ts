import type { CallErrorCode, Disposition } from "@/lib/voice/types";

// Copy for the browser softphone and the Voice settings page (EN/FR). The French dictionary is typed against the English one, so a missing key fails the build.
const en = {
  nav: "Calling", voiceNav: "Voice settings",
  title: "Calling", subtitle: "Place calls to your prospects from the browser, one deliberate call at a time.", unexpected: "Something went wrong. Please try again.",
  queue: {
    title: "Call queue", empty: "No prospects ready to call", emptyHint: "Prospects with a callable number that are assigned to you appear here.", noProfile: "Your account has no seller profile, so you have no prospects to call.",
    select: "Select", selected: "Selected", pickOne: "Select a prospect from the queue.", masked: "Number", localTime: "Local time", windowOpen: "Calling hours open", windowClosed: "Outside calling hours",
    closedHint: "Outside calling hours: it is {time} there.", closedUnknown: "Calling hours cannot be determined (unknown time zone).", held: "Calls to this province are on hold.", lastActivity: "Last activity", never: "None yet", language: { FR: "FR", EN: "EN", UNKNOWN: "?" } as Record<string, string>,
    list: "Prospects to call",
  },
  softphone: {
    title: "Softphone", call: "Call", callTo: "Call {name}", calling: "Calling…", hangUp: "Hang up", mute: "Mute", unmute: "Unmute", muted: "Microphone muted", timer: "Call duration", microphone: "Microphone", defaultDevice: "Default microphone",
    openCall: "A call of yours is still open ({state}). Close it if the call is over.", reconcile: "Check and close", reconciled: "Call status refreshed.", dismiss: "Dismiss", noSelection: "Select a prospect to see the softphone.", destination: "Dialing", tip: "Selecting a prospect never places a call. Click Call each time.",
    states: { idle: "Ready", authorizing: "Preparing the call…", dialing: "Dialing…", ringing: "Ringing…", connected: "Connected", ended: "Call ended", failed: "Call failed" },
    mic: {
      denied: "Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.", notFound: "No microphone was found. Plug in or enable a microphone, then try again.", inUse: "The microphone is in use by another app or tab. Close it, then try again.",
      unsupported: "This browser cannot access the microphone. Use a recent version of Chrome, Edge, Firefox or Safari on a secure (https) page.", generic: "The microphone could not be started. Check your audio settings and try again.",
    },
    connectFailed: "The browser could not connect the call. No call was placed. Please try again.", callFailed: "The call failed or was refused. Please try again in a moment.", unloadWarning: "A call is in progress.",
  },
  disposition: {
    title: "Call outcome", subtitle: "Record the result before moving on. This is required for every call.", forName: "Call with {name}", outcome: "Outcome", notes: "Notes", notesHint: "Optional. Required for Do not call.", followUpDate: "Follow-up date", followUpTime: "Follow-up time", followUpHint: "Required for Call back. Creates a follow-up task.",
    dncLabel: "Mark as do not call", dncConfirm: "This prospect will be marked Do Not Contact and will never be called or emailed again. Add a note explaining why.", save: "Save & next", saving: "Saving…", saved: "Outcome saved.", settling: "Confirming the call has ended…", nextProspect: "Next prospect", noNext: "No other prospect in the queue.",
    noteRequired: "Add a note before marking this prospect as do not call.", followUpRequired: "Choose a follow-up date for a call back.", pickOutcome: "Choose an outcome.",
    outcomes: {
      NO_ANSWER: "No answer", VOICEMAIL: "Left voicemail", GATEKEEPER: "Spoke to a gatekeeper", CALL_BACK: "Call back later", INTERESTED: "Interested", NOT_INTERESTED: "Not interested", WRONG_NUMBER: "Wrong number", NOT_A_REPAIR_SHOP: "Not a repair shop", DO_NOT_CALL: "Do not call",
    } satisfies Record<Disposition, string>,
  },
  gates: {
    lockedTitle: "Calling is locked until the Super Admin confirms the compliance gates.", disabled: "Voice calling is switched off.", notProvisioned: "Voice calling is not set up yet (telephony not provisioned).", dncl: "The National DNCL telemarketer registration has not been confirmed.",
    notAuthorized: "Live calling has not been authorized by the Super Admin.", settingsLink: "Open voice settings",
  },
  test: {
    title: "Test call", hint: "Super Admin only. Calls one of the numbers on the approved test list, never a prospect.", number: "Test number", none: "No test numbers are configured.", call: "Place test call", needsGates: "Test calls need voice calling to be switched on and set up.",
  },
  errors: {
    VOICE_DISABLED: "Voice calling is switched off.", VOICE_NOT_PROVISIONED: "Voice calling is not set up yet. Ask a Super Admin to finish the telephony setup.", COMPLIANCE_DNCL_NOT_CONFIRMED: "Calling is locked: the National DNCL registration has not been confirmed.",
    COMPLIANCE_LIVE_CALLING_NOT_AUTHORIZED: "Calling is locked until the Super Admin confirms the compliance gates.", NOT_ALLOWED: "You are not allowed to place calls.", PROSPECT_NOT_FOUND: "This prospect could not be found.", NOT_YOUR_PROSPECT: "This prospect is not assigned to you.",
    PROSPECT_NOT_REMOTE: "This prospect is not part of the remote calling queue.", OUTSIDE_COVERAGE: "This prospect is outside your coverage area.", NOT_CALLABLE: "This prospect has no callable business number.", DO_NOT_CONTACT: "This prospect is marked Do Not Contact.",
    PHONE_SUPPRESSED: "This number is blocked and cannot be called.", PROVINCE_ON_HOLD: "Calls to this province are on hold pending legal review.", OUTSIDE_CALLING_HOURS: "It is outside the permitted calling hours for this prospect.", COOLDOWN: "This prospect was called very recently. Wait before calling again.",
    DAILY_CAP_REACHED: "You have reached your daily call limit.", RATE_LIMITED: "Too many attempts. Wait a moment and try again.", SELLER_ALREADY_ON_CALL: "You already have a call in progress.", PROSPECT_ALREADY_IN_CALL: "Someone is already on a call with this prospect.",
    NUMBER_ALREADY_IN_CALL: "This number is already in a call.", TEST_NUMBER_NOT_ALLOWED: "This number is not on the approved test list.", SESSION_NOT_FOUND: "This call could not be found.", SESSION_EXPIRED: "This call expired. Please start a new one.",
    SESSION_NOT_ENDED: "The call has not finished yet. Wait a few seconds and try again.", ALREADY_RECORDED: "The outcome of this call was already saved.", INVALID_INPUT: "Some information is missing or invalid. Check the form and try again.",
  } satisfies Record<CallErrorCode, string>,
  voice: {
    title: "Voice settings", subtitle: "Launch gates, test numbers and limits for browser calling. Super Admin only.",
    warning: "Do not authorize commercial calling until the National DNCL telemarketer registration is confirmed and the legal review of British Columbia and Manitoba is complete. All gates stay closed by default.",
    status: { title: "Live status", enabled: "Voice calling switched on", provisioned: "Telephony provisioned", callerId: "Caller ID number set", dncl: "DNCL registration recorded", authorized: "Live calling authorized", open: "Commercial calling open", sellers: "Active sellers", provisionedAt: "Provisioned on", yes: "Yes", no: "No", on: "On", off: "Off", secrets: "No credentials are shown on this page." },
    kill: { title: "Kill switch", body: "Turning voice off stops every new call immediately. Calls already connected end normally.", turnOn: "Turn voice calling on", turnOff: "Turn voice calling off" },
    dncl: { title: "DNCL registration", body: "Record the National DNCL telemarketer registration. Both fields are required before live calling can be authorized. Clearing it also revokes authorization.", reference: "Registration reference", date: "Registration date", save: "Save registration", clear: "Clear registration", current: "Recorded", none: "Not recorded" },
    authorize: {
      title: "Authorize live calling", body: "Authorizing lets sellers call real prospects. It requires a recorded DNCL registration.", confirmLabel: "Type AUTHORIZE to confirm", confirmWord: "AUTHORIZE", authorize: "Authorize live calling", revoke: "Revoke authorization", needsDncl: "Record the DNCL registration first.", authorizedNow: "Live calling is currently authorized.",
    },
    held: { title: "Provinces on hold", body: "Two-letter province codes separated by commas. BC and MB stay on hold pending legal review. Prospects in a held province cannot be called.", label: "Held provinces", save: "Save held provinces", none: "None" },
    tests: { title: "Test numbers", body: "Canadian numbers a Super Admin may call to test the softphone, one per line (maximum 10). They are stored in international format.", label: "Test numbers", save: "Save test numbers" },
    limits: { title: "Limits", body: "Limits apply to every seller.", daily: "Daily calls per seller", cooldown: "Minutes before calling the same prospect again", maxSeconds: "Maximum call length (seconds)", save: "Save limits" },
    saving: "Saving…", saved: "Saved.",
    errors: {
      INVALID_TEST_NUMBER: "One of the test numbers is not a valid Canadian phone number.", DNCL_REGISTRATION_REQUIRED: "Record the DNCL registration before authorizing live calling.", DNCL_REFERENCE_REQUIRED: "Enter the registration reference and a valid registration date (not in the future).",
      INVALID_LIMIT: "Limits must be whole numbers between 0 and 100000.", CONFIRMATION_REQUIRED: "Type AUTHORIZE to confirm.", unexpected: "Something went wrong. Please try again.",
    } as Record<string, string>,
  },
};

type Dict = typeof en;

const fr: Dict = {
  nav: "Appels", voiceNav: "Paramètres vocaux",
  title: "Appels", subtitle: "Appelez vos prospects depuis le navigateur, un appel délibéré à la fois.", unexpected: "Une erreur est survenue. Veuillez réessayer.",
  queue: {
    title: "File d’appels", empty: "Aucun prospect prêt à appeler", emptyHint: "Les prospects qui vous sont assignés et qui ont un numéro appelable apparaissent ici.", noProfile: "Votre compte n’a pas de profil de vendeur : vous n’avez donc aucun prospect à appeler.",
    select: "Choisir", selected: "Sélectionné", pickOne: "Sélectionnez un prospect dans la file.", masked: "Numéro", localTime: "Heure locale", windowOpen: "Plage d’appel ouverte", windowClosed: "Hors des heures d’appel",
    closedHint: "Hors des heures d’appel : il est {time} là-bas.", closedUnknown: "Impossible de déterminer les heures d’appel (fuseau horaire inconnu).", held: "Les appels vers cette province sont suspendus.", lastActivity: "Dernière activité", never: "Aucune pour l’instant", language: { FR: "FR", EN: "EN", UNKNOWN: "?" },
    list: "Prospects à appeler",
  },
  softphone: {
    title: "Téléphone", call: "Appeler", callTo: "Appeler {name}", calling: "Appel en cours…", hangUp: "Raccrocher", mute: "Couper le micro", unmute: "Réactiver le micro", muted: "Micro coupé", timer: "Durée de l’appel", microphone: "Microphone", defaultDevice: "Microphone par défaut",
    openCall: "Un de vos appels est encore ouvert ({state}). Fermez-le si l’appel est terminé.", reconcile: "Vérifier et fermer", reconciled: "État de l’appel actualisé.", dismiss: "Fermer", noSelection: "Sélectionnez un prospect pour afficher le téléphone.", destination: "Appel vers", tip: "Sélectionner un prospect ne lance jamais d’appel. Cliquez sur Appeler chaque fois.",
    states: { idle: "Prêt", authorizing: "Préparation de l’appel…", dialing: "Composition…", ringing: "Ça sonne…", connected: "Connecté", ended: "Appel terminé", failed: "Échec de l’appel" },
    mic: {
      denied: "L’accès au microphone est bloqué. Autorisez le microphone pour ce site dans les paramètres du navigateur, puis réessayez.", notFound: "Aucun microphone n’a été trouvé. Branchez ou activez un microphone, puis réessayez.", inUse: "Le microphone est utilisé par une autre application ou un autre onglet. Fermez-le, puis réessayez.",
      unsupported: "Ce navigateur ne peut pas accéder au microphone. Utilisez une version récente de Chrome, Edge, Firefox ou Safari sur une page sécurisée (https).", generic: "Impossible de démarrer le microphone. Vérifiez vos paramètres audio et réessayez.",
    },
    connectFailed: "Le navigateur n’a pas pu établir l’appel. Aucun appel n’a été placé. Veuillez réessayer.", callFailed: "L’appel a échoué ou a été refusé. Veuillez réessayer dans un instant.", unloadWarning: "Un appel est en cours.",
  },
  disposition: {
    title: "Résultat de l’appel", subtitle: "Consignez le résultat avant de continuer. C’est obligatoire pour chaque appel.", forName: "Appel avec {name}", outcome: "Résultat", notes: "Notes", notesHint: "Facultatif. Obligatoire pour Ne pas appeler.", followUpDate: "Date de suivi", followUpTime: "Heure de suivi", followUpHint: "Obligatoire pour Rappeler. Crée une tâche de suivi.",
    dncLabel: "Marquer comme à ne pas appeler", dncConfirm: "Ce prospect sera marqué Ne pas contacter et ne sera plus jamais appelé ni joint par courriel. Ajoutez une note expliquant pourquoi.", save: "Enregistrer et suivant", saving: "Enregistrement…", saved: "Résultat enregistré.", settling: "Confirmation de la fin de l’appel…", nextProspect: "Prospect suivant", noNext: "Aucun autre prospect dans la file.",
    noteRequired: "Ajoutez une note avant de marquer ce prospect comme à ne pas appeler.", followUpRequired: "Choisissez une date de suivi pour un rappel.", pickOutcome: "Choisissez un résultat.",
    outcomes: {
      NO_ANSWER: "Pas de réponse", VOICEMAIL: "Message laissé sur la boîte vocale", GATEKEEPER: "Parlé à un filtre (réceptionniste)", CALL_BACK: "Rappeler plus tard", INTERESTED: "Intéressé", NOT_INTERESTED: "Pas intéressé", WRONG_NUMBER: "Mauvais numéro", NOT_A_REPAIR_SHOP: "Pas un atelier de réparation", DO_NOT_CALL: "Ne pas appeler",
    },
  },
  gates: {
    lockedTitle: "Les appels sont verrouillés tant que le Super Admin n’a pas confirmé les conditions de conformité.", disabled: "Les appels vocaux sont désactivés.", notProvisioned: "Les appels vocaux ne sont pas encore configurés (téléphonie non provisionnée).", dncl: "L’inscription de télévendeur à la Liste nationale de numéros de télécommunication exclus (LNNTE) n’est pas confirmée.",
    notAuthorized: "Les appels réels n’ont pas été autorisés par le Super Admin.", settingsLink: "Ouvrir les paramètres vocaux",
  },
  test: {
    title: "Appel de test", hint: "Réservé au Super Admin. Appelle l’un des numéros de la liste de test approuvée, jamais un prospect.", number: "Numéro de test", none: "Aucun numéro de test n’est configuré.", call: "Lancer l’appel de test", needsGates: "Les appels de test exigent que les appels vocaux soient activés et configurés.",
  },
  errors: {
    VOICE_DISABLED: "Les appels vocaux sont désactivés.", VOICE_NOT_PROVISIONED: "Les appels vocaux ne sont pas encore configurés. Demandez à un Super Admin de terminer la configuration de la téléphonie.", COMPLIANCE_DNCL_NOT_CONFIRMED: "Appels verrouillés : l’inscription à la LNNTE n’est pas confirmée.",
    COMPLIANCE_LIVE_CALLING_NOT_AUTHORIZED: "Les appels sont verrouillés tant que le Super Admin n’a pas confirmé les conditions de conformité.", NOT_ALLOWED: "Vous n’avez pas le droit de passer des appels.", PROSPECT_NOT_FOUND: "Ce prospect est introuvable.", NOT_YOUR_PROSPECT: "Ce prospect ne vous est pas assigné.",
    PROSPECT_NOT_REMOTE: "Ce prospect ne fait pas partie de la file d’appels à distance.", OUTSIDE_COVERAGE: "Ce prospect est hors de votre zone de couverture.", NOT_CALLABLE: "Ce prospect n’a aucun numéro d’entreprise appelable.", DO_NOT_CONTACT: "Ce prospect est marqué Ne pas contacter.",
    PHONE_SUPPRESSED: "Ce numéro est bloqué et ne peut pas être appelé.", PROVINCE_ON_HOLD: "Les appels vers cette province sont suspendus en attendant un examen juridique.", OUTSIDE_CALLING_HOURS: "Nous sommes hors des heures d’appel permises pour ce prospect.", COOLDOWN: "Ce prospect a été appelé très récemment. Attendez avant de le rappeler.",
    DAILY_CAP_REACHED: "Vous avez atteint votre limite quotidienne d’appels.", RATE_LIMITED: "Trop de tentatives. Patientez un moment et réessayez.", SELLER_ALREADY_ON_CALL: "Vous avez déjà un appel en cours.", PROSPECT_ALREADY_IN_CALL: "Quelqu’un est déjà en appel avec ce prospect.",
    NUMBER_ALREADY_IN_CALL: "Ce numéro est déjà en appel.", TEST_NUMBER_NOT_ALLOWED: "Ce numéro ne figure pas dans la liste de test approuvée.", SESSION_NOT_FOUND: "Cet appel est introuvable.", SESSION_EXPIRED: "Cet appel a expiré. Veuillez en démarrer un nouveau.",
    SESSION_NOT_ENDED: "L’appel n’est pas encore terminé. Patientez quelques secondes et réessayez.", ALREADY_RECORDED: "Le résultat de cet appel a déjà été enregistré.", INVALID_INPUT: "Des renseignements sont manquants ou invalides. Vérifiez le formulaire et réessayez.",
  },
  voice: {
    title: "Paramètres vocaux", subtitle: "Conditions de lancement, numéros de test et limites des appels dans le navigateur. Réservé au Super Admin.",
    warning: "N’autorisez pas les appels commerciaux avant que l’inscription de télévendeur à la LNNTE soit confirmée et que l’examen juridique de la Colombie-Britannique et du Manitoba soit terminé. Toutes les conditions restent fermées par défaut.",
    status: { title: "État en direct", enabled: "Appels vocaux activés", provisioned: "Téléphonie provisionnée", callerId: "Numéro d’afficheur défini", dncl: "Inscription à la LNNTE consignée", authorized: "Appels réels autorisés", open: "Appels commerciaux ouverts", sellers: "Vendeurs actifs", provisionedAt: "Provisionné le", yes: "Oui", no: "Non", on: "Activé", off: "Désactivé", secrets: "Aucun identifiant n’est affiché sur cette page." },
    kill: { title: "Interrupteur d’urgence", body: "Désactiver la voix bloque immédiatement tout nouvel appel. Les appels déjà connectés se terminent normalement.", turnOn: "Activer les appels vocaux", turnOff: "Désactiver les appels vocaux" },
    dncl: { title: "Inscription à la LNNTE", body: "Consignez l’inscription de télévendeur à la Liste nationale de numéros de télécommunication exclus. Les deux champs sont obligatoires avant d’autoriser les appels réels. L’effacer révoque aussi l’autorisation.", reference: "Référence d’inscription", date: "Date d’inscription", save: "Enregistrer l’inscription", clear: "Effacer l’inscription", current: "Consignée", none: "Non consignée" },
    authorize: {
      title: "Autoriser les appels réels", body: "L’autorisation permet aux vendeurs d’appeler de vrais prospects. Elle exige une inscription à la LNNTE consignée.", confirmLabel: "Tapez AUTHORIZE pour confirmer", confirmWord: "AUTHORIZE", authorize: "Autoriser les appels réels", revoke: "Révoquer l’autorisation", needsDncl: "Consignez d’abord l’inscription à la LNNTE.", authorizedNow: "Les appels réels sont actuellement autorisés.",
    },
    held: { title: "Provinces suspendues", body: "Codes de province à deux lettres, séparés par des virgules. La C.-B. (BC) et le Manitoba (MB) restent suspendus en attendant l’examen juridique. Les prospects d’une province suspendue ne peuvent pas être appelés.", label: "Provinces suspendues", save: "Enregistrer les provinces suspendues", none: "Aucune" },
    tests: { title: "Numéros de test", body: "Numéros canadiens qu’un Super Admin peut appeler pour tester le téléphone, un par ligne (maximum 10). Ils sont enregistrés en format international.", label: "Numéros de test", save: "Enregistrer les numéros de test" },
    limits: { title: "Limites", body: "Les limites s’appliquent à chaque vendeur.", daily: "Appels par jour et par vendeur", cooldown: "Minutes avant de rappeler le même prospect", maxSeconds: "Durée maximale d’un appel (secondes)", save: "Enregistrer les limites" },
    saving: "Enregistrement…", saved: "Enregistré.",
    errors: {
      INVALID_TEST_NUMBER: "Un des numéros de test n’est pas un numéro de téléphone canadien valide.", DNCL_REGISTRATION_REQUIRED: "Consignez l’inscription à la LNNTE avant d’autoriser les appels réels.", DNCL_REFERENCE_REQUIRED: "Saisissez la référence d’inscription et une date d’inscription valide (pas dans le futur).",
      INVALID_LIMIT: "Les limites doivent être des nombres entiers entre 0 et 100000.", CONFIRMATION_REQUIRED: "Tapez AUTHORIZE pour confirmer.", unexpected: "Une erreur est survenue. Veuillez réessayer.",
    },
  },
};

export type CallingCopy = Dict;
export function callingCopy(locale: "en" | "fr"): CallingCopy { return locale === "fr" ? fr : en; }
