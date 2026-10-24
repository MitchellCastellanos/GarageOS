# DRAFT privacy notice: website analytics (EN/FR), 2026-10-23

**Status: draft for owner and legal review. Not published. `/privacy` was not changed. Do not enable any OFF feature because of this text.**
Source of truth for the facts: `prisma/schema.prisma` (`PageView`, `AnalyticsEvent`, `SignupAttribution`), `src/lib/privacy/*`, `src/app/api/track/*`, `docs/analytics-v2-contract.md`. Items marked **[CURRENT]** run in production today; **[DISABLED]** are implemented but off (default OFF env flags) and must be removed from the published text, or published only when the flag is turned on.

## Points for counsel (not for publication)
1. The current `/privacy` says the daily hash is "one-way" and the raw IP is "not stored in the analytics record". True for `PageView`; but IP addresses (and, for login/recovery limiters, emails) also appear in the rate-limit counters until the daily purge, until PR #206 is deployed. Mention rate limiting or deploy #206 first.
2. The hash is pseudonymous (rotates daily, keyed with a server secret), not anonymous; we avoid calling it anonymous.
3. Retention of 13 months is configured but deletion is **not applied** yet (`ANALYTICS_RETENTION_APPLY` unset). Do not state that data is deleted at 13 months until it is switched on; say "we plan to".
4. Law 25 (Québec) and CASL/PIPEDA wording, controller identity and contact are for counsel.

## English

### Website analytics **[CURRENT]**
When you visit our public pages, GarageOS records a page view on our own servers. We record the page address (without query strings or private links), the page language (English or French), the website you came from (host name only), campaign parameters (utm source, medium, campaign), a device category and browser name, your country (from the hosting provider), and a **daily pseudonymous visitor identifier**. That identifier is a keyed hash computed from your IP address and browser information together with the date; it changes every day, so we cannot follow you from one day to the next, and your IP address and full browser string are not stored in the analytics record. We classify each visit by marketing channel (for example direct, search, email) and page type (for example commercial, help).
We do not use cookies or browser storage for this, and we do not load a third-party analytics or advertising script. Automated visitors (bots) are filtered out.
We do not record page views for private pages (customer portal, quote, inspection and appointment-management links, sales links, account and administration areas).

### Do Not Track and Global Privacy Control **[CURRENT]**
If your browser sends a Do Not Track or Global Privacy Control signal, we do not record the page view. This is checked on our server. Some privacy tools and extensions can also block the measurement request.

### Rate limiting and security **[CURRENT]**
To protect the service from abuse we keep short-lived counters of requests per network address, for security purposes only. They are purged daily.

### Button interactions **[DISABLED, publish only when enabled]**
When enabled, we will count clicks on a fixed list of call-to-action buttons (for example "Start free trial"), with the page, language, channel and the same daily pseudonymous identifier. No text you type is collected.

### Sign-up attribution **[DISABLED, publish only when enabled]**
When enabled, if you create a GarageOS business account after arriving from our website, we will store with that business account the first source of the visit: the landing page address, language, channel, campaign parameters, referring host name and the button used. We do not store your email, IP address, visitor identifier or browser information in that record. It is used only by platform administrators, in aggregate, to understand which pages lead to sign-ups, and is deleted with the business account.

### Who can see this, and how long we keep it
Analytics are visible only to authorised GarageOS platform administrators through an access-controlled dashboard. Small groups (fewer than 5) are combined so individuals cannot be singled out. We intend to keep page-view and button-interaction records for 13 months and then delete them **[owner decision pending; deletion not active yet]**.

### Your choices
Enable Do Not Track or Global Privacy Control in your browser, or contact us at [contact address] to ask about your information.

## Français

### Analytique du site **[ACTUEL]**
Lorsque vous consultez nos pages publiques, GarageOS enregistre une visite sur ses propres serveurs : l'adresse de la page (sans paramètres de requête ni liens privés), la langue de la page (français ou anglais), le site d'origine (nom d'hôte seulement), les paramètres de campagne (utm source, medium, campagne), une catégorie d'appareil et le nom du navigateur, votre pays (fourni par l'hébergeur) et un **identifiant de visiteur pseudonyme quotidien**. Cet identifiant est un hachage à clé calculé à partir de votre adresse IP et d'informations sur le navigateur, avec la date; il change chaque jour, ce qui nous empêche de vous suivre d'un jour à l'autre, et votre adresse IP et la chaîne complète du navigateur ne sont pas conservées dans l'enregistrement analytique. Chaque visite est classée par canal (par exemple direct, recherche, courriel) et par type de page (par exemple commerciale, aide).
Nous n'utilisons ni témoins (cookies) ni stockage du navigateur pour cela, et nous ne chargeons aucun script d'analytique ou de publicité tiers. Les visiteurs automatisés (robots) sont exclus.
Aucune visite n'est enregistrée pour les pages privées (portail client, liens de devis, d'inspection et de gestion de rendez-vous, liens de vente, espaces de compte et d'administration).

### « Ne pas suivre » et Global Privacy Control **[ACTUEL]**
Si votre navigateur envoie un signal « Ne pas suivre » ou Global Privacy Control, la visite n'est pas enregistrée. La vérification se fait sur notre serveur. Certains outils ou extensions de confidentialité peuvent aussi bloquer la requête de mesure.

### Limitation de débit et sécurité **[ACTUEL]**
Pour protéger le service contre les abus, nous conservons des compteurs de requêtes de courte durée par adresse réseau, à des fins de sécurité uniquement. Ils sont purgés chaque jour.

### Interactions avec les boutons **[DÉSACTIVÉ, à publier seulement à l'activation]**
Une fois activée, nous comptabiliserons les clics sur une liste fixe de boutons d'appel à l'action (par exemple « Essai gratuit »), avec la page, la langue, le canal et le même identifiant quotidien pseudonyme. Aucun texte que vous saisissez n'est recueilli.

### Source d'inscription **[DÉSACTIVÉ, à publier seulement à l'activation]**
Une fois activée, si vous créez un compte d'entreprise GarageOS après être arrivé depuis notre site, nous conserverons avec ce compte la première source de la visite : adresse de la page d'arrivée, langue, canal, paramètres de campagne, nom d'hôte d'origine et bouton utilisé. Nous n'y conservons ni votre courriel, ni votre adresse IP, ni l'identifiant de visiteur, ni les informations du navigateur. Seuls les administrateurs de la plateforme l'utilisent, de façon agrégée, pour savoir quelles pages mènent à des inscriptions; elle est supprimée avec le compte d'entreprise.

### Qui y a accès et durée de conservation
Les statistiques sont accessibles uniquement aux administrateurs autorisés de la plateforme, par un tableau de bord à accès contrôlé. Les petits groupes (moins de 5) sont regroupés afin de ne pas isoler une personne. Nous prévoyons conserver les enregistrements de visites et d'interactions pendant 13 mois, puis les supprimer **[décision du propriétaire en attente; suppression non active]**.

### Vos choix
Activez « Ne pas suivre » ou Global Privacy Control dans votre navigateur, ou écrivez-nous à [adresse de contact] au sujet de vos renseignements.

*Terminologie : « Devis » et « Ordre de travail » (jamais « soumission » ni « bon de travail »). Révision linguistique et juridique requise avant publication.*
