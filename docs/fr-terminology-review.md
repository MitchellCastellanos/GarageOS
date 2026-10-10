# French terminology review (Canada / Québec)

Decisions applied: FR "quote" is **devis** (masculine, invariable plural); FR "work order" is **ordre de travail**.
EN and ES strings, identifiers, enum values, keys and routes are unchanged. Automated review does not replace review by a Québec French speaker.

## Non-trivial decisions

| File:line | Final text | Why |
|---|---|---|
| src/lib/admin-locale/sales-field.ts:71 | "Cet envoi a déjà servi pour un autre arrêt." | EN is "This submission was already used" (idempotency of a form/request submission, not a quote). Reworded as "envoi". Only "soumission" that was not the quote document. |
| src/lib/admin-locale/settings.ts:1440 | "...d'une annulation, d'une décision sur un devis et des avis SMS." | "d'une soumission décidée" cannot simply be re-gendered ("d'un devis décidé" is awkward); reworded. |
| src/lib/admin-locale/settings.ts:1391 | "...nouvelles factures et les nouveaux devis" | Mixed-gender coordination made explicit. |
| src/lib/admin-locale/quotes.ts:316-321 | Envoyé / Accepté / Refusé / Expiré / Converti / Annulé | Status labels had no "soumission" but agreed with it (feminine); now masculine. |
| src/lib/admin-locale/quotes.ts:355 | "Émis le {date}" | Same, implicit agreement. |
| src/lib/admin-locale/quotes.ts:386 | "Marquer comme envoyé (sans courriel)" | Same. |
| src/lib/admin-locale/quotes.ts:337 | "Créer le premier devis" | "première" -> "premier". |
| src/lib/admin-locale/reports.ts:113 | SENT "Envoyé", ACCEPTED "Accepté", ... | Status map shared with work orders (already masculine), quote labels aligned. |
| src/lib/admin-locale/reports.ts:106 | "Ordres ouverts" | Short form of "Bons ouverts" (work orders). |
| src/lib/admin-locale/permissions.ts:45 | "(rendez-vous, ordres de travail, devis, messages)" | "estimations" was a synonym for quotes; "ordres" expanded for clarity. |
| src/lib/portal-i18n.ts:121 | Approuvé / Refusé / Expiré / "Approuvé et facturé" | Customer-facing quote status, implicit agreement. |
| src/actions/quotes.ts:77,83 | "Impossible de marquer comme accepté / refusé" | Implicit agreement. |
| src/actions/quotes.ts:59,89; src/actions/work-orders.ts:73 | "ne peut pas être envoyé", "converti en facture", "doit être accepté" | Participles. |
| src/emails/QuoteEmail.tsx:57,67 | "le devis ci-joint ... pas reçu"; "Le devis PDF est joint" | Participle/adjective agreement. |
| src/lib/sms.ts:261 | "devis N — total. Consultez-le et répondez" | Pronoun la -> le. |
| src/lib/email.ts:189-190, src/emails/QuoteEmail.tsx:26 | "Devis {n} — {shop}" / "Renvoi : Devis ..." | Subject lines. |
| src/lib/staff-alerts.ts:253-259 | "Devis {n} accepté/refusé", "Voir le devis" | Subject, heading, body. |
| src/lib/staff-notify-events.ts:20 | "Devis accepté ou refusé" | |
| src/lib/quote-approval-i18n.ts:78-90 | "Devis accepté/refusé", "le devis n'est plus disponible" | |
| src/lib/marketing-locale.ts:638 | "Devis approuvé" | |
| src/lib/marketing-locale.ts:669,692,698 | "devis clair", "Des devis clairs et détaillés", "un devis clair" | Adjective agreement. |
| src/lib/marketing-pages.ts:69,71,73,82,191,199 | "devis clair", "un devis créé", "Devis détaillés", "Les devis approuvés", "clair et détaillé" | Adjective/participle agreement. |
| src/lib/marketing-flow.ts:135 | "préparez le devis et envoyez-le" | Pronoun. |
| src/lib/marketing-flow.ts:44,90,91,99,136 | "l'ordre de travail" | Elision (le bon -> l'ordre). Also "de l'ordre" (du bon), "à l'ordre". |
| src/lib/demo-journey.ts:52 | "Le devis préparé" | |
| src/lib/demo-journey.ts:55,148 | "L'ordre de travail", "un seul ordre de travail" | Elision. |
| src/app/help/page.tsx:86 | "...ne signifie pas qu'il a été accepté." | Pronoun and participle. |
| src/components/marketing/BrandControlSection.tsx:15, WorkflowSection.tsx:13 | "confirmations, devis, approbations" | "estimations" was used as a synonym for quotes. |

## Legal pages (please have these reviewed)

Terminology only; no legal meaning changed.

- src/app/terms/page.tsx:27 (Service): "soumissions et approbations, bons de travail" -> "devis et approbations, ordres de travail".
- src/app/privacy/page.tsx:40 (Renseignements traités): "les soumissions et approbations; les bons de travail" -> "les devis et approbations; les ordres de travail".

## Allowlisted "soumission"

None. `tests/fr-terminology.test.ts` has an empty, documented allowlist.

## Left untouched on purpose

- Sales CRM screens and `src/domain/sales-comms/templates.ts`: only "bons de travail" (already the shop's work order) was changed to "ordres de travail"; no sales-process "soumission" existed besides sales-field.ts:71 above.
- "Estimation à vol d'oiseau" (sales-field.ts:86) is a distance estimate, not a quote.
- "Sous-total estimé" in work orders is an estimated amount, not a quote.

## Glossary (as already used by the app; not changed in this PR)

| EN | FR chosen | Notes |
|---|---|---|
| Quote | Devis | Masculine, plural "devis". Previously "Soumission". |
| Work order | Ordre de travail | Masculine, "l'ordre de travail". Previously "Bon de travail". A synonym may be mentioned later on dedicated pages. |
| Invoice | Facture | |
| Appointment | Rendez-vous | Invariable plural. |
| Inspection | Inspection numérique | "Inspections numériques (DVI)" on the public site. |
| Reminder | Rappel | "Rappel de service" / "prochain rappel d'entretien". |
| Inbox | Boîte de réception | |
| Cash drawer | Caisse | |
| Tire storage | Entreposage de pneus | |
