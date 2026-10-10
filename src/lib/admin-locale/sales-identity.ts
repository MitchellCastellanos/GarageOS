// Copy for corporate sales identity, sales modes/territories, videos and the email test tool (EN/FR, parity enforced by the type).
const en = {
  errors: {
    NOT_CORPORATE: "The login must be a GarageOS corporate address (name@garage-os.ca).", INVALID_EMAIL: "That email address is not valid.",
    RECOVERY_IS_CORPORATE: "The recovery email must be a private, personal address — not a garage-os.ca address.", RECOVERY_SAME_AS_LOGIN: "The recovery email must differ from the login.",
    RECOVERY_REQUIRED: "A personal recovery email is required.", RECOVERY_NOT_VERIFIED: "There is no verified recovery email for this person yet, so no link can be sent. Re-send the invitation or confirm a recovery email first.",
    ALREADY_CORPORATE: "This person already signs in with a corporate address.", WRONG_PASSWORD: "The current password is incorrect.", NOT_STAFF: "This action is only available to sales staff accounts.",
    INVALID_TERRITORY: "One of the selected territories does not exist or is inactive.", FIELD_MODE_REQUIRED: "This prospect is in a field-held territory. Only a FIELD agent can take it on for initial acquisition.",
    OUTSIDE_COVERAGE: "This prospect is outside the territories this agent covers.", NO_SALES_MODE: "This person has no sales mode configured.",
    TERRITORY_FIELD_FIRST_CONTACT: "Automated cold email is not allowed for prospects in a field-held territory until a documented in-person visit or a reply.", TERRITORY_FIELD_ONLY: "First contact with this prospect is reserved for FIELD agents. Ask the field owner, or wait for a documented visit.",
    VIDEO_URL_INVALID: "The video URL must be a valid https link.", VIDEO_NOT_PUBLISHABLE: "A video needs a title and an https URL before it can be published.", TEST_RECIPIENT_INVALID: "Enter a valid recipient address.", TEST_RECIPIENT_NOT_ALLOWED: "That address is not an approved test recipient. Add it to SALES_TEST_RECIPIENTS (owner-controlled) or use your own login address.",
  } as Record<string, string>,
  account: {
    title: "My account", login: "Sign-in (corporate email)", recovery: "Personal recovery email", verified: "Verified", unverified: "Not verified yet", pending: "Awaiting confirmation at",
    private: "Private: only used to recover your account. It is never shown to prospects or colleagues.", change: "Change recovery email", newEmail: "New personal email", password: "Current password", send: "Send confirmation link",
    sent: "We sent a confirmation link to the new address. Nothing changes until you open it.", notSent: "Email is unavailable right now, so no link was sent. Nothing was changed.", mode: "Sales mode", modes: { FIELD: "Field", REMOTE: "Remote" } as Record<string, string>,
    verifyHint: "Verify this address so you can recover your account if you forget your password.", resend: "Verify this address",
  },
  recover: {
    title: "Recover your sales account", help: "Enter your GarageOS corporate email. If it belongs to an active sales account with a verified recovery email, we send a reset link to that personal address.",
    email: "Corporate email", submit: "Send reset link", done: "If that account exists and has a verified recovery email, a reset link is on its way.", back: "Back to sign in", rate: "Too many attempts. Try again later.",
  },
  verify: { title: "Confirm your recovery email", help: "Confirm that this personal address can be used to recover your GarageOS sales account.", submit: "Confirm address", done: "Recovery email confirmed.", invalid: "This link is invalid, expired or already used.", signIn: "Sign in", resetTitle: "Reset your password", resetHelp: "Choose a new password for your GarageOS sales account." },
  team: {
    login: "Sign-in email (corporate)", loginHelp: "A unique address under @garage-os.ca. This is the login and the sender address of this agent's sales email.", recovery: "Personal recovery email", recoveryHelp: "Private. The invitation and password-reset links are sent here, and it is never used in prospect-facing email.",
    mode: "Sales mode", modeField: "FIELD — in-person prospecting, follow-ups, demos, closing, route planning", modeRemote: "REMOTE — remote prospecting, calls, email, demos, closing (no field visits or routes)",
    coverage: "Territory coverage", coverageHelp: "Leave empty to cover every territory this mode allows.", recoveryStatus: "Recovery email", legacyTitle: "Assign a corporate email", legacyHelp: "This account still signs in with a non-corporate address. Assign a corporate login: the current address becomes the private recovery email and the sender identity is re-pointed.",
    legacyBtn: "Assign corporate email", legacyDone: "Corporate email assigned. Ask the person to sign in with it.", changeRecovery: "Send recovery confirmation to a new address", changeRecoveryDone: "Confirmation link sent to the new address.", identityAuto: "A sender identity is created automatically from the corporate address; it activates when the email provider confirms the domain.",
  },
  territories: {
    title: "Territories", help: "Who may do the INITIAL acquisition of a prospect. Existing active opportunities keep their owner. FIELD priority releases untouched prospects to REMOTE after the priority window.",
    acq: { FIELD_EXCLUSIVE: "Field-exclusive", FIELD_PRIORITY: "Field priority, then remote", REMOTE_DEFAULT: "Remote by default" } as Record<string, string>,
    cities: "Cities", postal: "Postal prefixes", days: "Priority days", start: "Priority start", save: "Save territory", saved: "Territory saved.", active: "Active", order: "Order (lower = more specific)", key: "Key (a-z, 0-9, -)", nameEn: "Name (EN)", nameFr: "Name (FR)", provinces: "Provinces (e.g. QC)", add: "Add territory", csvHelp: "Comma-separated.",
  },
  videos: {
    title: "Videos", help: "Reusable website and outreach videos. Use the keys “commercial” (60 s) and “teaser” (15 s), one row per language; the URL is the CDN link of the MP4. Only PUBLISHED videos are ever shown or sent. Emails link to the GarageOS video page (with a tracked, expiring link), never to the MP4 itself.",
    key: "Stable key", language: "Language", titleField: "Title", description: "Description", url: "Video URL (https)", thumb: "Thumbnail URL (optional, https)", status: "Status", statuses: { DRAFT: "Draft", PUBLISHED: "Published" } as Record<string, string>,
    website: "Website", outreach: "Outreach", save: "Save video", saved: "Video saved.", publish: "Published", empty: "No videos yet. The video email templates stay blocked until one is published for the right language.", add: "Add or update a video",
  },
  tester: {
    title: "Internal test recipient", help: "Prepares a clearly labelled TEST prospect for an address you control (SALES_TEST_RECIPIENTS or your own login), with a documented sending basis. Then write to it from the normal composer — signature, footer, unsubscribe and queue are the real ones. Nothing is sent from here.",
    to: "Test recipient email", prepare: "Prepare test recipient", ready: "Test recipient ready.", open: "Open the test prospect",
  },
  visit: { log: "Log field visit", help: "Documents an in-person visit. Only a real conversation counts as engagement; a visit never replaces consent to email.", note: "What happened?", done: "Visit logged.", type: "Field visit" },
  territoryBadge: { FIELD: "Field-held", REMOTE: "Remote" } as Record<string, string>,
};
type Dict = typeof en;
const fr: Dict = {
  errors: {
    NOT_CORPORATE: "L’identifiant doit être une adresse corporative GarageOS (nom@garage-os.ca).", INVALID_EMAIL: "Cette adresse courriel n’est pas valide.",
    RECOVERY_IS_CORPORATE: "Le courriel de récupération doit être une adresse personnelle et privée — pas une adresse garage-os.ca.", RECOVERY_SAME_AS_LOGIN: "Le courriel de récupération doit différer de l’identifiant.",
    RECOVERY_REQUIRED: "Un courriel de récupération personnel est requis.", RECOVERY_NOT_VERIFIED: "Aucun courriel de récupération vérifié pour cette personne : aucun lien ne peut être envoyé. Renvoyez l’invitation ou faites confirmer un courriel de récupération.",
    ALREADY_CORPORATE: "Cette personne se connecte déjà avec une adresse corporative.", WRONG_PASSWORD: "Le mot de passe actuel est incorrect.", NOT_STAFF: "Cette action est réservée aux comptes de l’équipe des ventes.",
    INVALID_TERRITORY: "Un des territoires choisis n’existe pas ou est inactif.", FIELD_MODE_REQUIRED: "Ce prospect est dans un territoire terrain. Seul un agent TERRAIN peut en faire l’acquisition initiale.",
    OUTSIDE_COVERAGE: "Ce prospect est hors des territoires couverts par cet agent.", NO_SALES_MODE: "Aucun mode de vente n’est configuré pour cette personne.",
    TERRITORY_FIELD_FIRST_CONTACT: "Le courriel froid automatisé est interdit pour un prospect d’un territoire terrain tant qu’il n’y a pas de visite en personne documentée ou de réponse.", TERRITORY_FIELD_ONLY: "Le premier contact avec ce prospect est réservé aux agents TERRAIN. Contactez le responsable terrain ou attendez une visite documentée.",
    VIDEO_URL_INVALID: "L’URL de la vidéo doit être un lien https valide.", VIDEO_NOT_PUBLISHABLE: "Une vidéo doit avoir un titre et une URL https avant d’être publiée.", TEST_RECIPIENT_INVALID: "Entrez une adresse destinataire valide.", TEST_RECIPIENT_NOT_ALLOWED: "Cette adresse n’est pas un destinataire de test approuvé. Ajoutez-la à SALES_TEST_RECIPIENTS (contrôlé par le propriétaire) ou utilisez votre propre adresse de connexion.",
  },
  account: {
    title: "Mon compte", login: "Connexion (courriel corporatif)", recovery: "Courriel de récupération personnel", verified: "Vérifié", unverified: "Pas encore vérifié", pending: "En attente de confirmation à",
    private: "Privé : sert uniquement à récupérer votre compte. Jamais visible des prospects ni des collègues.", change: "Changer le courriel de récupération", newEmail: "Nouveau courriel personnel", password: "Mot de passe actuel", send: "Envoyer le lien de confirmation",
    sent: "Un lien de confirmation a été envoyé à la nouvelle adresse. Rien ne change tant que vous ne l’ouvrez pas.", notSent: "Le courriel est indisponible pour le moment : aucun lien envoyé. Rien n’a été modifié.", mode: "Mode de vente", modes: { FIELD: "Terrain", REMOTE: "À distance" },
    verifyHint: "Vérifiez cette adresse pour pouvoir récupérer votre compte en cas d’oubli du mot de passe.", resend: "Vérifier cette adresse",
  },
  recover: {
    title: "Récupérer votre compte ventes", help: "Entrez votre courriel corporatif GarageOS. S’il correspond à un compte ventes actif avec un courriel de récupération vérifié, un lien de réinitialisation est envoyé à cette adresse personnelle.",
    email: "Courriel corporatif", submit: "Envoyer le lien", done: "Si ce compte existe et a un courriel de récupération vérifié, un lien de réinitialisation est en route.", back: "Retour à la connexion", rate: "Trop de tentatives. Réessayez plus tard.",
  },
  verify: { title: "Confirmez votre courriel de récupération", help: "Confirmez que cette adresse personnelle peut servir à récupérer votre compte ventes GarageOS.", submit: "Confirmer l’adresse", done: "Courriel de récupération confirmé.", invalid: "Ce lien est invalide, expiré ou déjà utilisé.", signIn: "Se connecter", resetTitle: "Réinitialiser votre mot de passe", resetHelp: "Choisissez un nouveau mot de passe pour votre compte ventes GarageOS." },
  team: {
    login: "Courriel de connexion (corporatif)", loginHelp: "Une adresse unique @garage-os.ca. C’est l’identifiant et l’adresse d’expédition des courriels de vente de cet agent.", recovery: "Courriel de récupération personnel", recoveryHelp: "Privé. L’invitation et les liens de réinitialisation y sont envoyés ; il n’apparaît jamais dans un courriel destiné aux prospects.",
    mode: "Mode de vente", modeField: "TERRAIN — prospection en personne, suivis, démos, conclusion, planification de routes", modeRemote: "À DISTANCE — prospection à distance, appels, courriels, démos, conclusion (aucune visite terrain ni route)",
    coverage: "Couverture territoriale", coverageHelp: "Laissez vide pour couvrir tous les territoires permis par ce mode.", recoveryStatus: "Courriel de récupération", legacyTitle: "Attribuer un courriel corporatif", legacyHelp: "Ce compte se connecte encore avec une adresse non corporative. Attribuez un identifiant corporatif : l’adresse actuelle devient le courriel de récupération privé et l’identité d’expéditeur est réassignée.",
    legacyBtn: "Attribuer le courriel corporatif", legacyDone: "Courriel corporatif attribué. Demandez à la personne de se connecter avec celui-ci.", changeRecovery: "Envoyer une confirmation de récupération à une nouvelle adresse", changeRecoveryDone: "Lien de confirmation envoyé à la nouvelle adresse.", identityAuto: "Une identité d’expéditeur est créée automatiquement à partir de l’adresse corporative ; elle s’active quand le fournisseur de courriel confirme le domaine.",
  },
  territories: {
    title: "Territoires", help: "Qui peut faire l’acquisition INITIALE d’un prospect. Les occasions actives existantes gardent leur propriétaire. La priorité terrain libère les prospects non touchés vers l’équipe à distance après la période.",
    acq: { FIELD_EXCLUSIVE: "Exclusif terrain", FIELD_PRIORITY: "Priorité terrain, puis à distance", REMOTE_DEFAULT: "À distance par défaut" },
    cities: "Villes", postal: "Préfixes postaux", days: "Jours de priorité", start: "Début de la priorité", save: "Enregistrer le territoire", saved: "Territoire enregistré.", active: "Actif", order: "Ordre (plus bas = plus précis)", key: "Clé (a-z, 0-9, -)", nameEn: "Nom (EN)", nameFr: "Nom (FR)", provinces: "Provinces (ex. QC)", add: "Ajouter un territoire", csvHelp: "Séparés par des virgules.",
  },
  videos: {
    title: "Vidéos", help: "Vidéos réutilisables pour le site et les courriels. Utilisez les clés « commercial » (60 s) et « teaser » (15 s), une ligne par langue; l’URL est le lien CDN du fichier MP4. Seules les vidéos PUBLIÉES sont affichées ou envoyées. Les courriels renvoient à la page vidéo de GarageOS (lien suivi et à durée limitée), jamais directement au MP4.",
    key: "Clé stable", language: "Langue", titleField: "Titre", description: "Description", url: "URL de la vidéo (https)", thumb: "URL de la vignette (facultatif, https)", status: "Statut", statuses: { DRAFT: "Brouillon", PUBLISHED: "Publiée" },
    website: "Site web", outreach: "Prospection", save: "Enregistrer la vidéo", saved: "Vidéo enregistrée.", publish: "Publiée", empty: "Aucune vidéo. Les modèles de courriel avec vidéo restent bloqués jusqu’à la publication d’une vidéo dans la bonne langue.", add: "Ajouter ou mettre à jour une vidéo",
  },
  tester: {
    title: "Destinataire de test interne", help: "Prépare un prospect TEST clairement identifié pour une adresse que vous contrôlez (SALES_TEST_RECIPIENTS ou votre propre identifiant), avec une base d’envoi documentée. Écrivez-lui ensuite depuis le compositeur habituel — signature, pied de page, désabonnement et file sont les vrais. Rien n’est envoyé d’ici.",
    to: "Courriel du destinataire de test", prepare: "Préparer le destinataire de test", ready: "Destinataire de test prêt.", open: "Ouvrir le prospect de test",
  },
  visit: { log: "Consigner une visite terrain", help: "Documente une visite en personne. Seule une vraie conversation compte comme engagement ; une visite ne remplace jamais le consentement à recevoir des courriels.", note: "Que s’est-il passé ?", done: "Visite consignée.", type: "Visite terrain" },
  territoryBadge: { FIELD: "Territoire terrain", REMOTE: "À distance" },
};
export type IdentityCopy = Dict;
export function identityCopy(locale: "en" | "fr"): IdentityCopy { return locale === "fr" ? fr : en; }
export function identityError(locale: "en" | "fr", code: string | undefined): string | undefined { return identityCopy(locale).errors[code ?? ""]; }
export { en as identityEn, fr as identityFr };
