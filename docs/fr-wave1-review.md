# French commercial pages, wave 1 — preliminary review (2026-10-13)

**Status of this review: preliminary technical and linguistic check by the engineering assistant. It is NOT a native-speaker (Québec) review and NOT a legal review.** Nothing here may be presented as externally verified. The four pages (`/fr/produit`, `/fr/fonctionnalites`, `/fr/tarifs`, `/fr/integrations`) are rendered but stay `noindex, follow`, out of the sitemap and without hreflang until the owner approves publication (lock: `APPROVED` list in `tests/seo-fr-wave1.test.ts`; route table `frStatus` stays `planned`).

## What was checked
- FR copy comes from the same typed structures as the English pages (`PRODUCT_COPY`, `FEATURE_GROUPS`, `INTEGRATIONS_*`, `MARKETING_PRICING`, `PLAN_CARDS`, `COMPARISON`, `TRIAL_COPY`), so EN and FR make the same claims. Plan facts are derived from `src/config/entitlements.ts` and covered by `tests/public-surface.test.ts`.
- Spot-checked claims against code: STOP handling (`src/lib/communications/sms-inbound.ts`, `suppression.ts`), plan prices (`PLAN_PRICING_CAD`), 14-day trial (`TRIAL_DAYS`), "not available" list (card processing, calendar sync, public API) matches the EN page.
- Rendered HTML of each page: `lang="fr-CA"`, `noindex, follow`, own canonical, one `<h1>`, no `hreflang` alternates, 0 English function words in visible text.
- Terminology guard (`tests/fr-terminology.test.ts`): Devis / Ordre de travail.
- Pricing metadata (EN and FR) now derived from the price constants instead of hard-coded numbers.

## Not checked / limits
- No native Québec review. No external SERP/usage check of terms.
- Technical claims inherited from the EN copy were spot-checked, not re-audited feature by feature; the comparison table was verified through its test, not line by line linguistically.

## Linguistic flags for the native reviewer (suggestions, not applied)
1. "Transparents sur ce qui n'existe pas encore" (integrations intro) is a sentence fragment → e.g. « Nous sommes transparents sur ce qui n'existe pas encore… ».
2. "Vos clients vivent votre atelier, pas GarageOS" (product) reads literally → consider « découvrent ».
3. Plan name "Complete" kept in English as a brand name (EN/FR parity); the reviewer may prefer « Complet ».
4. "DVI" is left as an English acronym; consider « inspection numérique (DVI) » on first use everywhere.
5. Mixed apostrophes (’ vs ') and spacing before ":" between files — typographic normalization.
6. Page titles are one word ("Produit", "Tarifs"); consider richer titles before indexation (e.g. « Tarifs — logiciel de gestion d'atelier »). Left unchanged for EN parity.
7. "texto", "courriel", "entreposage de pneus", "soutien prioritaire" are Québec-appropriate choices to confirm.

## Texts that need professional (legal) approval before publication
- Pricing: "Tous les prix sont en CAD, taxes applicables en sus", "0 $ aujourd'hui", automatic start of the subscription after the trial, "annuler depuis la facturation avant sa fin", annual billing "au prix de 10 mois pour 12 mois", "2 mois gratuits". Check price-advertising and automatic-renewal wording against the Québec Consumer Protection Act (applies to consumer contracts; confirm applicability to B2B shops and apply the strictest reading).
- "Les demandes STOP sont respectées automatiquement" (SMS) and any CASL/LCAP reference.
- Privacy and terms pages are NOT part of this wave (wave 2) and remain flagged for legal review.

## To publish (explicit owner approval required)
Set `frStatus: "live"` and keep `frIndexable` unset for the approved routes, add them to `APPROVED` in `tests/seo-fr-wave1.test.ts`, add the FR/EN counterparts so hreflang is reciprocal, rebuild, check the sitemap in Preview and production.

## Addendum (V1 close-out): feature detail pages and three more drafts
- New FR drafts, also `noindex, follow` / `planned` / not in the sitemap / no hreflang: `/fr/fonctionnalites/{reservation-en-ligne, inspections-numeriques, devis-et-approbations, communications-sms-courriel}`, `/fr/demo`, `/fr/commencer`, `/fr/contact`.
- The FR feature-page copy (`src/lib/feature-pages.ts`) was **written by the engineering assistant** (not machine-translated from a vendor tool) from the EN copy, the Help guides and the product's own FR strings (inspection condition labels "Bon / À surveiller / Service requis" match the app). It is **not** native-reviewed or legally reviewed. Flags for the reviewer: "texto" vs "SMS" usage, "ordre de travail" consistency, "avisez/avis" wording, tone of imperatives ("Notez", "Envoyez").
- Texts needing professional approval before indexation: statements about STOP handling, "GarageOS ne traite pas les paiements par carte", and the monthly SMS allowance wording.
- SMS overage pricing is deliberately **not** mentioned (overage billing PR #47 is not merged; do not publish until verified).
