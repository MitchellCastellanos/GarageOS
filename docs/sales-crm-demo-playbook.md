# GarageOS Sales Playbook — Discovery, Adaptive Demo, Objections, Closing and Sales Academy

| | |
|---|---|
| **Document** | `docs/sales-crm-demo-playbook.md` |
| **Playbook content version** | `0.1.0` (draft for Super Admin approval; see §14 for the versioning contract) |
| **Status** | Documentation and training content only. **No application code, schema, migration, route or shared component was changed.** |
| **Author role** | Agent 3 — Sales Enablement and Demo Experience (content-preparation phase) |
| **Repository baseline** | `MitchellCastellanos/GarageOS`, `origin/main` @ `729f14d` (fetched 2026-10-09) |
| **Languages** | English and Canadian French (Québec). Every customer-facing script and every training item is provided in both. |
| **Audience** | Sales reps (current: Super Admin / founder-led), future `SALES_REP` / `SALES_MANAGER` staff, the platform administrator, and the Agent 3 implementation phase. |
| **Reads with** | `docs/sales-crm-master-implementation-plan.md`, `docs/sales-demo-implementation-plan.md`, `docs/demo-journey-implementation-plan.md`, `docs/subscription-plans.md`, `docs/launch-readiness.md`, `docs/compliance/casl-matrix.md`, `docs/compliance/subprocessors.md` |

---

## 0. How to use this document

| If you are… | Start at |
|---|---|
| A new rep | §1 (rules of claims) → §2 (facts) → §12 (curriculum). Do the modules in order. |
| Preparing a first call | §4 (discovery) |
| Running a demo tomorrow | §3 (what exists), §5 (the 30-minute demo), then the matching profile in §6 |
| Facing pushback | §7 (objections) |
| Ending a meeting or following up | §8 (closing and follow-up) |
| The Agent 3 implementation agent | §14 (structured contract), §15 (how it will be consumed) and §16 (known gaps / open questions) |

### 0.1 Evidence labels

Every product statement in this playbook carries, or sits under, one of these labels. A rep must never say something that is labelled worse than **[LIMIT]** as if it were fully available.

| Label | Meaning | How a rep may talk about it |
|---|---|---|
| **[IMPL]** | Implemented in the repository on the baseline commit and reachable in the product UI. | Show it and describe it plainly. |
| **[IMPL·PRO]** / **[IMPL·COMPLETE]** | Implemented, but enforced by `CAPABILITY_MIN_PLAN` at Pro / Complete. | Show it on a Pro/Complete demo tier; say which plan includes it. |
| **[LIMIT]** | Implemented, but depends on something outside the repo (provider validation, provisioning by GarageOS, shop configuration). | Describe with the caveat in the same sentence. Never demo it live without a same-day rehearsal. |
| **[PLANNED]** | Described in the CRM master plan or a roadmap, **not built**. | Do not mention to prospects. Internal training only. |
| **[NO]** | Does not exist, or was explicitly removed from scope. | If asked, say it is not available. Do not hint it is coming unless a person with authority has confirmed a date in writing. |

### 0.2 How this document was verified

Facts were checked against the code, not only against other documents. Sources (all under the repo root): `src/config/entitlements.ts` (plan → capability map and limits), `src/lib/marketing-plans.ts` and `src/lib/marketing-flow.ts` (public copy), `src/components/layout/Sidebar.tsx` and `src/lib/admin-locale/layout.ts` (real navigation labels in EN/FR), `src/app/admin/(shop)/settings/page.tsx` (settings tabs), `src/domain/import.ts` (import entities and limits), `src/lib/communications/segments.ts` (campaign audiences), `src/actions/sales-demo*.ts` and `src/lib/admin-locale/sales-demo*.ts` (the existing demo tooling), `src/domain/fiscal.ts` (payment methods), `docs/notifications.md`, `docs/launch-readiness.md`, `docs/compliance/*`, `docs/demo-journey/validation.md`, and `public/demo/garage-laurent/manifest.json`.

**This playbook has not been run against a live deployment in this session.** Navigation paths are verified against the *repository* (route files, sidebar entries, tab ids, dictionary labels), not against a running UI. Button labels quoted below come from the dictionaries; everything else is described functionally. Section 16 lists items a human must confirm during a rehearsal before the first customer demo.

### 0.3 What is deliberately not in this document

- **No invented pricing, discounts, ROI percentages, customer counts, testimonials, uptime/SLA figures or competitor comparisons.** All prices come from `PLAN_PRICING_CAD` (§2.1). Any "return on investment" is computed live from the prospect's own numbers (§4.9).
- **No screenshots were created.** Where a visual is useful, this document points to assets that already exist in `public/demo/garage-laurent/` and `/demo`.
- **No legal advice.** CASL, Law 25 and consumer-protection points are operational guardrails and defer to `docs/compliance/*` and the privacy officer.
- **No outbound email/SMS sequence copy.** Written cold outreach belongs to the Sales Communications workstream (Agent 2) and needs CASL review. This playbook covers conversations (phone, walk-in, video, in person) and follow-ups to people who already engaged.

---

## 1. Claim discipline (non-negotiable rules for every rep)

1. **Show, then say.** If you cannot show it in the product in under 30 seconds, describe it only as far as §2.3 allows.
2. **Never promise a date, feature or integration** that is **[PLANNED]** or **[NO]**. "It's not available today" is a complete, respectable answer.
3. **Price statements come only from §2.1.** Say "plus applicable taxes" every time you quote a price.
4. **GarageOS does not charge the shop's customers' cards.** It *records* payments the shop collected by whatever means. Say it before the prospect assumes otherwise (§5, step D8).
5. **Free trial means: a payment method is required, $0 today, and billing starts automatically after 14 days** unless cancelled. Never say "no credit card needed" and never say "free forever".
6. **No shop-owned data hostage language and no data-location claims.** Do not say "your data stays in Canada". Providers are in the US (§2.3). Say what the Privacy Policy says and offer the written version.
7. **SMS needs a shop number that GarageOS provisions.** Never promise a turnaround time. Never promise SMS works in a demo.
8. **Do not use real customers' data in any demo.** Use the prospect's own shop details (with their permission), the synthetic scenario, or the public Garage Laurent assets.
9. **Do not send real messages in a demo** unless the recipient is the prospect, in person, who has just agreed — and the rep has rehearsed that exact send the same day (§5.2).
10. **If you don't know, say so, and write the question down.** A follow-up with a verified answer within one business day beats a confident guess.
11. **Speak the prospect's language.** Resolve language before the first full sentence (§4.2). Never silently assume French (master plan §4). Switch when asked, mid-demo, without comment.
12. **Respect "no".** One clear respectful close-out, then stop (§8.7). Honour do-not-contact immediately and record it.

---

## 2. Verified fact base

### 2.1 Pricing and trial (single source: `src/config/entitlements.ts` → `PLAN_PRICING_CAD`; public copy: `src/lib/marketing-plans.ts`)

| Plan | Monthly (CAD) | Annual (CAD) | Users | Locations |
|---|---:|---:|---|---|
| **Core** | $199 | $1,990 | Up to 3 | 1 |
| **Pro** (marked "Most Popular") | $299 | $2,990 | Unlimited | 1 |
| **Complete** | $449 | $4,490 | Unlimited | Multi-Shop |

- Prices are in CAD **plus applicable taxes**. Annual is billed upfront and equals 10 months for 12 months of service ("2 months free").
- **Trial:** 14 days (`TRIAL_DAYS = 14`). Checkout requires a payment method (`payment_method_collection: "always"`, per `docs/subscription-plans.md`). The shop pays $0 today, the first charge date and amount are shown before the trial begins, and billing starts automatically after the trial. A shop that already had a trial does not get another one (`docs/sales-demo-wave-3-validation.md`).
- **No free tier.** An expired trial, cancelled, unpaid or incomplete subscription is restricted (read-only plus billing), per `docs/subscription-plans.md`. A payment failure keeps access for 48 hours from first observation, then restricts.
- **Multi-Shop:** Complete is the base plan. Public copy says additional-location pricing "is confirmed with your plan". The internal note of $199 CAD/month/location in `docs/subscription-plans.md` is **not** public and per-location metered billing is **not wired to Stripe yet** (same document). **Do not quote a per-location price. Say it is confirmed with the plan and escalate.**
- Billing is Stripe Checkout + Billing Portal, owned by the shop owner in Settings → Billing (tab id `billing`; label "Billing" / "Facturation").

### 2.2 Plan capability map (what actually differs; source `CAPABILITY_MIN_PLAN` and `PLAN_CARDS`)

| Capability | Core | Pro | Complete | Notes |
|---|---|---|---|---|
| Customers, vehicles, history, appointments, branded online booking, estimates with customer approval, Work Orders and job status, invoices/payments/refunds, GST/QST, customer portal, email, two-way SMS inbox | ✅ | ✅ | ✅ | Two-way SMS requires a shop number provisioned by GarageOS **[LIMIT]**. |
| Booking page: Classic template, logo, brand colour, 2 photos, services | ✅ | ✅ | ✅ | |
| Booking page: Modern/Bold/Minimal templates, typography | — | ✅ | ✅ | `bookingPage.advancedDesign` |
| Custom domain, custom sender identity | — | ✅ | ✅ | `branding.customDomain`, `branding.customSender` |
| DVI standard checklist, notes, estimate from findings | ✅ | ✅ | ✅ | |
| DVI photos, reusable templates, shareable customer report | — | ✅ | ✅ | `dvi.photos/templates/customerReport` |
| Reminders: manual per vehicle, daily email 7 days before | ✅ | ✅ | ✅ | |
| Reminders: rules created from completed jobs, lead time, preferred channel | — | ✅ | ✅ | `reminders.automation` |
| Campaigns (segmented **email** with unsubscribe) | — | ✅ | ✅ | `communications.campaigns`. Email only; segments: all consented, language, inactive for X months, service due/overdue, manual list. |
| Inventory, automatic part use on Work Orders | — | ✅ | ✅ | `inventory.manage` |
| Tire storage | — | ✅ | ✅ | `tireStorage.manage` |
| Reports: basic (this month, last month, last 30 days) | ✅ | ✅ | ✅ | |
| Reports: custom ranges, sales/receivables/jobs/customers/inventory, CSV export | — | ✅ | ✅ | `reports.advanced` |
| Accounting Light (tax summaries, payments/refunds by method, accountant exports) | — | ✅ | ✅ | `accounting.light` |
| QuickBooks Online sync | — | ✅ | ✅ | `quickbooks.sync` — **[LIMIT]**: tested against a simulated Intuit only; not provider-validated (`docs/launch-readiness.md`). |
| Fine-grained team permissions | — | ✅ | ✅ | `permissions.advanced` |
| Import: customers + vehicles, CSV/Excel, up to 500 rows per file | ✅ | ✅ | ✅ | `IMPORT_LIMITS.basicMaxRows` |
| Import: also inventory, up to 10,000 rows per file, "update" duplicates | — | ✅ | ✅ | `import.full` |
| Multi-location organization, consolidated and per-location reports | — | — | ✅ | `organization.multiLocation`, `reports.multiLocation` |
| SMS allowance per month (provisional) | 300 | 1,000 | 2,500 | `PLAN_LIMITS`; overage $0.05 CAD/segment (`SMS_OVERAGE_PRICE_CAD_PER_SEGMENT`). **Figures are marked provisional in code — confirm before quoting.** |
| Assisted onboarding / priority support | — | ✅ | ✅ | Public copy; scope of "assisted onboarding" is not defined in the repo — **[LIMIT]**, confirm wording. |
| White-glove onboarding, standard data migration included | — | — | ✅ | Public copy (`marketing-plans.ts`). Scope undefined in the repo — confirm. |

### 2.3 What GarageOS is **not** (say this plainly when asked)

| Topic | Truth |
|---|---|
| **Card payments from the shop's customers** | **[NO]** GarageOS does not process them. "Card" is a payment *method recorded* on an invoice (`PAYMENT_METHODS = CARD, CASH, ETRANSFER, CHEQUE, OTHER`). The `marketing-resources` guide states: recording a card payment "does not charge a card". |
| **Importing past invoices, Work Orders, estimates or vehicle service history** | **[NO]** Import supports only `customers`, `vehicles`, `inventory` (`ImportEntity` in `src/domain/import.ts`). History starts when the shop starts using GarageOS. |
| **Connectors for named competitors** | **[NO]** No competitor-specific importer exists; the importer matches column names from any CSV/Excel file. |
| **Public API** | **[NO]** Listed "Future" in `docs/subscription-plans.md`; no code; the public `/integrations` page says "There is no public API today." |
| **External calendar sync (Google/Outlook)** | **[NO]** Listed under "Not available" on `/integrations` (`INTEGRATIONS_NOT_AVAILABLE` in `src/lib/marketing-pages.ts`). |
| **VIN lookup/scanning, Work Board/kanban, purchase orders/suppliers, full accounting, technician time clock/payroll** | **[NO]** Explicitly removed from scope in `docs/feature-gap.md`. |
| **Shop-login two-factor authentication** | **[NO]** None found in the codebase. Do not claim MFA. |
| **Online deposits / prepayment at booking** | **[NO]** No deposit logic was found. |
| **Customer reschedule from the booking link** | The manage link lets the customer **confirm or cancel** a future appointment (`src/lib/appointment-manage.ts`). Rescheduling is done by the shop. |
| **Native mobile app** | **[NO]** The admin is a responsive web app (mobile drawer navigation exists). Do not say "app store". |
| **Approval history list screen in the admin** | Approval decisions are stored (`QuoteApproval`) and the estimate status changes to Accepted/Rejected, but the Garage Laurent capture work found **no admin surface that lists approval decisions** (`docs/demo-journey/validation.md`, view 12 omitted). Show the status change and the staff notification; do not navigate to a non-existent "approval history" page, even though one help article implies it. |
| **Campaign SMS** | Campaigns are **email**. SMS is used for operational notifications and the two-way inbox. |
| **Data residency in Canada** | **No such claim is permitted.** `docs/compliance/subprocessors.md`: application hosting (Vercel `iad1`, Washington D.C.), database (Neon, AWS `us-east-2`), email (Resend, USA), SMS (Twilio, default US1). The Privacy Policy tells users data may be processed outside Québec/Canada. |

### 2.4 Launch-state caveats every rep must know (`docs/launch-readiness.md`, 2026-10-06 state)

- The repository's verdict is **"CODE GO — PROVIDER VALIDATION REQUIRED"**; the final launch GO has not been issued and the Stripe LIVE cutover and dress rehearsal were pending as of the last update. **Before any rep sells a live subscription, a named person (the platform administrator) must confirm in writing that Stripe live billing is open.**
- Validated on Production: dedicated-number two-way SMS in/out/STOP/START; the **QUOTE** email channel on a GarageOS-managed sender identity.
- **Not** validated: shared-number SMS path, US/A2P traffic, SMS overage metering, the other email channels (invoice, appointment, reminder, Work Order, web-contact) with real recipients, live bounce/complaint handling, and QuickBooks.
- Consequence for demos: *do not rely on live SMS or any live email other than a quote.* Use the fallbacks in §5.2.
- There are no paying customers at the time of writing. **There are no references, testimonials or customer counts to cite.** Do not invent any.

### 2.5 Languages

| Surface | EN | FR | Other |
|---|:-:|:-:|---|
| Shop admin UI (`AdminLocale`) | ✅ | ✅ | ES also exists |
| Public marketing site, `/demo`, `/pricing`, `/guides` | ✅ | ✅ | |
| Public booking page, customer quote page, portal, inspection report | ✅ | ✅ | follows the customer/document language |
| Invoice PDF and customer emails | ✅ | ✅ | `InvoiceLanguage = ES, EN, FR` |
| Customer record | Preferred language (EN/FR/ES) and notify channel (`AUTO`, `SMS`, `EMAIL`, `BOTH`) | | |

Vocabulary rule: use the label **on the screen**. The French admin says **Ordres de travail** (reports and marketing say *bons de travail*), **Soumissions**, **Rendez-vous**, **Tableau de bord**, **Entreposage de pneus**, **Caisse**, **Configuration**. Say both once ("l'ordre de travail — le bon de travail") and then follow the screen.

---

## 3. What exists today for sales — and what does not

### 3.1 Implemented sales tooling **[IMPL]** (Sales Demo Waves 1–3, merged)

| Capability | Where | Notes |
|---|---|---|
| Sales workspace listing prospect demos | `/platform/sales` | Lists up to 100 `SalesDemo` records with state, plan, expiry, Resume, Resend activation. **Currently `SUPER_ADMIN` only**; a `SALES_REP` role does not exist yet. |
| Prepare a prospect demo | `/platform/sales/new` → `/platform/sales/[id]` | Shop name, address, phone, email, contact, preferred language (FR/EN); logo, storefront and interior photos (camera or file; ≤4 MB; JPEG/PNG/WebP). The ChatGPT logo prompt is a **copy-only** helper; GarageOS does not call any AI service. |
| Start the real product as the prospect's shop | "Start customer experience" | Runs the **real onboarding** (Business → Fiscal/logo → Services → Hours → Design → Plan). At Plan the demo chooses Core/Pro/Complete **with no Stripe, no card, no trial**. Real Dashboard follows. |
| Demo toolbar (amber bar) | Inside the demo | Label **SALES DEMO / DÉMO DE VENTE**, shop name, "Viewing: plan" selector (Core/Pro/Complete — changes the *real* entitlement gates immediately), **Demo walkthrough**, **Convert to customer**, **Exit demo**. Only the platform actor sees it. |
| Demo walkthrough page | `/admin/demo` | Links to Clients, Appointments, Quotes, Work orders, Invoices, Inbox, Booking Page settings; **Open real Booking Page** (`/book/{slug}`); **Load quick demo scenario**; **Enable demo communications**; **Restart walkthrough**. |
| Quick demo scenario | `/admin/demo` | One clearly marked synthetic client ("Demo scenario" / "Scénario de démonstration"), a 2020 Toyota Corolla (plate `DEMO`), an appointment tomorrow, a quote, a Work Order and a **draft** invoice, all one $120.00 line plus tax. **It is a skeleton, not a story** — see §5.2 for how to make it convincing. |
| Real SMS/email in demo | `/admin/demo` → Enable demo communications | Requires the rep to confirm permission to contact the recipients. Demo SMS is permanently excluded from Stripe SMS overage billing. Sending still depends on provider configuration (§2.4). |
| Convert to customer | Toolbar → `/admin/demo/convert` or `/platform/sales/[id]/convert` | Owner name, owner email, final plan, Monthly/Annual, retain-scenario choice → **Send activation link**. Sales never collects a card or sets a password. |
| Owner activation | Email "Your GarageOS is ready / Votre GarageOS est prêt", CTA "Activate my GarageOS account / Activer mon compte GarageOS" → `/activate-demo/[id]` → `/admin/activation-payment` | Single-use link, expires in 24 hours (or at demo expiry). The token travels in the URL fragment. Resend has a one-minute cooldown and invalidates the old link. New owners choose their own password; an existing owner of that shop signs in. |
| Final payment | "You're almost done / Vous y êtes presque" → Stripe Checkout (existing path) | Plan and Monthly/Annual are preselected. Eligible owners see the 14-day trial and $0 today. |
| Conversion rule | | The demo becomes **CONVERTED** only when shared Stripe sync confirms a mapped plan with TRIALING or ACTIVE status. Sending or opening the link, creating Checkout, or being redirected does **not** convert. |
| Demo lifecycle | | `PREPARING → ACTIVE → ACTIVATION_SENT → AWAITING_PAYMENT → CONVERTED`, or `EXPIRED`. Demos last 30 days (`DEMO_DURATION_MS`). |
| Public self-guided demo | `/demo` (EN/FR) | Garage Laurent (fictional), 8 steps with 23 of 25 planned captures, SMS compositions and a static invoice PDF; labelled "fictional demonstration". |
| Public booking replica | `/demo/booking` | Exact replica of Garage Laurent's booking site; `noindex`. Zero-risk to show if the live demo shop's booking page is not ready. |
| Public assets for fallback | `public/demo/garage-laurent/{en,fr}/*.webp`, `invoice-camille.pdf`, `messages.json` | Real captures. **Missing by design: 12 (approval history — no admin surface) and 22 (SMS inbox — seeded shop has no conversations).** Quote on phone (11) is another sample visit (Alexandre) and the ready email (14) is Sophie's; both carry an "Another sample visit" label. |

### 3.2 Planned only **[PLANNED]** — never describe to prospects

CRM prospect/contact/opportunity records, `CrmNeed`/`CrmProspectNeed`, `SALES_REP`/`SALES_MANAGER` roles, sales inbox, sequences, native booking calendar for demos (`/sales/book/[token]`), Sales Academy at `/platform/sales/academy`, the Live Demo Assistant, `CrmDemoRun` tracking, Stripe-confirmed *attribution* to a rep, performance dashboards. Until they ship, this playbook is used as a document (printable / read on a second screen), and progress is tracked manually (§13).

### 3.3 Demo environment options and when to use each

| Option | Use when | Strength | Risk |
|---|---|---|---|
| **A. Prospect's prepared demo shop** (`/platform/sales/new`) | The prospect is serious, you have their logo/photos and permission | "This is already my shop on GarageOS" (the stated product goal) | Onboarding takes time — **do it before the meeting**; records you add are live data and survive conversion |
| **B. Public Garage Laurent** (`/demo`, `/demo/booking`) | First call, screen-share, low-commitment, or Option A is not ready | Zero side effects; bilingual; polished | Not their shop; static |
| **C. Hybrid (recommended)** | Almost always | Open with A for the booking page and dashboard; use B's assets for anything that needs a send (invoice PDF, ready email, reminder email) | Requires prep (§5.2) |

---

## 4. Sales discovery — independent repair shops in Québec and Canada

**Purpose of discovery:** earn the right to a demo and decide *which* demo to run. A demo built on a verified need converts; a feature tour does not. Discovery produces (a) the top three verified needs, (b) a software/size/language profile, (c) the decision path, (d) a budget and timing read. These four outputs drive §6 (which demo variant) and map to the CRM fields in §14.

**Principles**

- Talk about their last busy Tuesday, not about software. Ask for a *story*, then quantify it.
- You should talk less than 40% of the time. Every claim you make is followed by a question.
- Tag every fact **verified** (they said it) or **inferred** (you assumed it). Only verified needs may drive a recommendation (master plan §4: "Never invent inferred facts as confirmed").
- Garage owners are interrupted constantly. Ask permission for time, state the length, and keep it.

### 4.1 Pre-call preparation (10 minutes, public information only)

| Check | Why | Tag as |
|---|---|---|
| Website language(s), whether it has a booking form, a phone-only number, or a third-party booking widget | Language preference; booking pain; competing software hints | inferred |
| Services shown (general repair, tires, European, diesel, body, fleet) | Specialisation → inventory/tire-storage relevance | inferred |
| Hours and number of locations | Multi-location; phone-coverage gap | inferred |
| Review themes (long waits, no call-backs, surprise bills, great communication) | Opening hook — **never quote reviews back at them aggressively** | inferred |
| Staff names/titles on the site | Decision-maker hypotheses | inferred |
| Anything on the site naming a software ("Powered by…", payment/booking widgets) | Current software | inferred |
| Internal DNC / prior contact history | Compliance (§8.7, `docs/compliance/casl-matrix.md`) | verified |

### 4.2 Resolve language first

Order of precedence (master plan §4): explicit request in this conversation → contact's stated preference → business's preferred language → **ask**. Never guess silently.

> **EN:** "Bonjour — hello! Would you rather we continue in French or English?"
> **FR:** « Bonjour — hello! Préférez-vous qu'on poursuive en français ou en anglais? »

Record the answer (per contact) and use the demo shop's preferred language (FR/EN) when you create the prospect demo.

### 4.3 Opening scripts

All scripts are written for ≤ 30 seconds spoken. Replace `[…]`. Use *vous* in French unless the owner clearly invites *tu*.

**A. Phone, first contact with an owner or manager**

> **EN:** "Hi [Name], it's [Rep] from GarageOS. We make shop-management software built for independent repair shops, so this is a cold call — do you have two minutes, or should I try you at a better time? … I noticed [specific, true observation: e.g. 'your website has a phone number but no online booking']. I'm not calling to sell you something on the spot; I'm curious how you handle bookings and estimates today, and whether a 20-minute look at how other shops run that would be worth your time. Is now OK for a couple of questions?"
>
> **FR:** « Bonjour [Nom], c'est [Représentant] de GarageOS. On fait un logiciel de gestion pensé pour les ateliers de réparation indépendants — c'est un appel à froid, alors avez-vous deux minutes, ou je vous rappelle à un meilleur moment? … J'ai remarqué que [observation précise et vraie : p. ex. « votre site affiche un numéro de téléphone mais pas de réservation en ligne »]. Je ne vous appelle pas pour vous vendre quoi que ce soit tout de suite; je suis curieux de savoir comment vous gérez les rendez-vous et les soumissions aujourd'hui, et si 20 minutes pour voir comment d'autres ateliers fonctionnent vaudraient le coup. Est-ce que je peux vous poser quelques questions maintenant? »

**B. Gatekeeper (front desk answers)**

> **EN:** "Hi, it's [Rep] with GarageOS — we do shop software. Who would be the right person to talk to about how the shop handles appointments and invoicing? … When's usually a good time to catch [Name], and should I mention it's about scheduling and invoicing?"
>
> **FR:** « Bonjour, c'est [Représentant] de GarageOS — on offre un logiciel de gestion d'atelier. Qui serait la bonne personne pour parler de la gestion des rendez-vous et de la facturation? … Quand est-ce que [Nom] est généralement disponible, et je peux mentionner que c'est au sujet des rendez-vous et de la facturation? »

Never ask the gatekeeper to confirm that the shop is "unhappy with its software". Never misrepresent the call as a customer enquiry.

**C. Walk-in visit** (only at a quiet time; never during a customer interaction at the counter)

> **EN:** "Hi, I'm [Rep], I build software for independent garages. I won't take your time at a busy moment — is there a better time this week to come back for ten minutes? I'd like to ask how you take bookings and send estimates."
>
> **FR:** « Bonjour, je m'appelle [Représentant]; je travaille avec un logiciel conçu pour les garages indépendants. Je ne veux pas vous déranger en pleine journée — y a-t-il un meilleur moment cette semaine pour revenir dix minutes? J'aimerais savoir comment vous prenez vos rendez-vous et envoyez vos soumissions. »

**D. Prospect who already raised their hand (trial sign-up, contact form, replied)**

> **EN:** "Hi [Name], it's [Rep] from GarageOS — you [started a trial / wrote to us] about [topic]. Thanks for that. Before I show you anything, can I ask a few questions so I show what actually matters to your shop, not a generic tour? About 10 minutes."
>
> **FR:** « Bonjour [Nom], c'est [Représentant] de GarageOS — vous [avez démarré un essai / nous avez écrit] au sujet de [sujet]. Merci! Avant de vous montrer quoi que ce soit, puis-je vous poser quelques questions pour vous présenter ce qui compte vraiment pour votre atelier, plutôt qu'une visite générique? Environ 10 minutes. »

**E. Video or in-person meeting kick-off** (booked demo)

> **EN:** "Thanks for making time. Here's how I'd like to use it: ten minutes of questions so I understand your shop, then about twenty-five minutes on the real product — your shop's name and logo are already in it — then we decide together whether a next step makes sense. If something isn't relevant, say 'skip' and I'll move on. Does that work?"
>
> **FR:** « Merci d'avoir pris le temps. Voici comment je propose de l'utiliser : dix minutes de questions pour comprendre votre atelier, puis environ vingt-cinq minutes sur le vrai produit — le nom et le logo de votre atelier y sont déjà — et on décide ensemble si une suite a du sens. Si quelque chose ne vous concerne pas, dites « passez » et je continue. Ça vous convient? »

### 4.4 Question bank

★ = ask in every discovery. **Listen for** points to the need categories in §4.6 (codes in `monospace`). Ask in the prospect's language; both are provided.

#### Block A — Shop snapshot

| # | EN | FR | Listen for |
|---|---|---|---|
| A1★ | "Tell me about the shop: how long you've been open, who's on the team, and what you mostly work on?" | « Parlez-moi de l'atelier : depuis quand vous êtes ouverts, qui compose l'équipe et sur quoi vous travaillez surtout? » | size band; specialisation |
| A2★ | "How many technicians and how many people at the front desk?" | « Combien de techniciens et combien de personnes à l'accueil? » | owner-operated vs team; adoption |
| A3 | "Roughly how many vehicles come through in a normal week? In your busy season?" | « À peu près combien de véhicules passent dans une semaine normale? En haute saison? » | volume; seasonality |
| A4★ | "One location or more? Any plans to add one?" | « Un seul emplacement ou plus? Avez-vous des projets d'en ajouter? » | `multi_location` |
| A5 | "Is it mostly regulars, walk-ins, fleets, or a mix?" | « Surtout des clients réguliers, des clients de passage, des flottes, ou un mélange? » | `retention`; fleet |
| A6★ | "Which language do most of your customers prefer?" | « Quelle langue la majorité de vos clients préfère-t-elle? » | language; bilingual communication |

#### Block B — Walk me through the last job

| # | EN | FR | Listen for |
|---|---|---|---|
| B1★ | "Think about the last job that went well. Walk me through it from the first contact to the customer driving away." | « Pensez au dernier travail qui s'est bien passé. Racontez-moi-le, du premier contact jusqu'au départ du client. » | the whole workflow |
| B2★ | "Where did something get written down twice, or almost fall through the cracks?" | « À quel moment avez-vous dû écrire quelque chose deux fois, ou failli échapper quelque chose? » | double entry; `work_orders` |
| B3 | "Now the last job that went badly — what happened?" | « Maintenant, le dernier travail qui s'est mal passé : qu'est-ce qui est arrivé? » | pain; severity |
| B4 | "Who does the paperwork, and when? After closing hours?" | « Qui fait la paperasse, et quand? Après la fermeture? » | admin time; urgency |

#### Block C — Phones and booking

| # | EN | FR | Listen for |
|---|---|---|---|
| C1★ | "How do customers book today — phone, walk-in, text, Facebook, a website form?" | « Comment les clients prennent-ils rendez-vous aujourd'hui — téléphone, en personne, texto, Facebook, formulaire sur le site? » | `booking` |
| C2★ | "What happens to calls when everyone's under a car or with a customer?" | « Qu'arrive-t-il aux appels quand tout le monde est sous une voiture ou avec un client? » | missed calls |
| C3 | "Roughly how many calls a day, and how many are just 'do you have room Thursday?'" | « Environ combien d'appels par jour, et combien sont juste « avez-vous de la place jeudi? » » | phone load |
| C4 | "How do you handle no-shows and last-minute cancellations?" | « Comment gérez-vous les absences et les annulations de dernière minute? » | confirmations; reminders |
| C5 | "Do customers ask to book after hours or on weekends?" | « Des clients demandent-ils de réserver le soir ou la fin de semaine? » | online booking value |
| C6 | "Do your customers expect to be able to book online, or do they prefer to call?" | « Vos clients s'attendent-ils à pouvoir réserver en ligne, ou préfèrent-ils appeler? » | calibrates objection §7.6 |

#### Block D — Inspections, estimates, approvals, Work Orders

| # | EN | FR | Listen for |
|---|---|---|---|
| D1★ | "How does a customer find out what the car needs and what it will cost?" | « Comment le client apprend-il ce dont sa voiture a besoin et ce que ça va coûter? » | `quotes_invoices`; `dvi` |
| D2★ | "How do you get approval before doing extra work? Phone call? Text? Signature?" | « Comment obtenez-vous l'approbation avant d'effectuer du travail supplémentaire? Appel? Texto? Signature? » | approval proof; disputes |
| D3 | "Has a customer ever said 'I never approved that'? What did you do?" | « Un client vous a-t-il déjà dit « je n'ai jamais approuvé ça »? Qu'avez-vous fait? » | approval trail pain |
| D4 | "How do you record findings and photos from an inspection?" | « Comment consignez-vous les constats et les photos d'une inspection? » | `dvi`; Pro need |
| D5 | "Where do the technicians see what's been approved and what to do next?" | « Où les techniciens voient-ils ce qui est approuvé et ce qu'il reste à faire? » | `work_orders` |
| D6 | "How does the front desk know a car is ready — and how does the customer know?" | « Comment l'accueil sait-il qu'une voiture est prête — et comment le client le sait-il? » | job status; ready-for-pickup |

#### Block E — Invoicing, payments, books

| # | EN | FR | Listen for |
|---|---|---|---|
| E1★ | "How do you create invoices? What do they look like when the customer gets them?" | « Comment créez-vous vos factures? À quoi ressemblent-elles quand le client les reçoit? » | `quotes_invoices` |
| E2 | "How do you handle GST/QST — by hand, or does your tool do it?" | « Comment gérez-vous la TPS/TVQ — à la main, ou votre outil le fait? » | tax errors |
| E3★ | "How do customers pay, and where do you record it — and do you reconcile at day end?" | « Comment les clients paient-ils, où l'inscrivez-vous, et faites-vous une conciliation en fin de journée? » | payments record; cash drawer |
| E4 | "Who does your books? What do they ask you for at tax time?" | « Qui fait votre comptabilité? Que vous demande-t-il/elle au moment des impôts? » | accounting export; QuickBooks (Pro) |
| E5 | "Do you chase unpaid invoices? How do you know who owes you?" | « Devez-vous relancer des factures impayées? Comment savez-vous qui vous doit de l'argent? » | `reporting` (receivables) |

#### Block F — Communication and retention

| # | EN | FR | Listen for |
|---|---|---|---|
| F1★ | "How do you keep customers informed during a repair?" | « Comment tenez-vous les clients informés pendant une réparation? » | `communications` |
| F2★ | "How do customers know when their next oil change, brakes or tire change is due?" | « Comment les clients savent-ils quand leur prochain changement d'huile, leurs freins ou leurs pneus sont dus? » | `retention` |
| F3 | "Do you send anything to past customers — reminders, seasonal offers? How, and how often?" | « Envoyez-vous quelque chose aux anciens clients — rappels, offres saisonnières? Comment, et à quelle fréquence? » | campaigns (Pro); consent |
| F4 | "How many customers haven't been back in over a year?" | « Combien de clients ne sont pas revenus depuis plus d'un an? » | inactive segment |
| F5 | "Do customers text you? Who answers, and from which number?" | « Des clients vous écrivent-ils par texto? Qui répond, et à partir de quel numéro? » | two-way SMS [LIMIT] |

#### Block G — Current tools and data

| # | EN | FR | Listen for |
|---|---|---|---|
| G1★ | "What do you use today to run the shop — paper, spreadsheets, a shop-management package, QuickBooks, a mix?" | « Qu'utilisez-vous aujourd'hui pour gérer l'atelier — papier, chiffriers, un logiciel de gestion d'atelier, QuickBooks, un mélange? » | `software_state` |
| G2★ | "What do you like about it? What would you hate to lose?" | « Qu'aimez-vous? Qu'est-ce que vous détesteriez perdre? » | must-have parity |
| G3★ | "What frustrates you or your team most about it?" | « Qu'est-ce qui vous frustre le plus, vous ou votre équipe? » | switching motive |
| G4 | "What does it cost you each month, all in — and when does the contract or billing period renew?" | « Combien ça vous coûte par mois, tout compris, et quand le contrat ou la période de facturation se renouvelle-t-il? » | budget; timing; lock-in |
| G5★ | "If you wanted your customer list and vehicles out of it, could you export them to Excel or CSV?" | « Si vous vouliez sortir votre liste de clients et de véhicules, pourriez-vous l'exporter en Excel ou en CSV? » | migration feasibility (import = customers, vehicles, inventory only) |
| G6 | "How many customers and vehicles do you have on file, roughly?" | « Environ combien de clients et de véhicules avez-vous au dossier? » | 500-row Core limit; Pro 10,000 |
| G7 | "Have you looked at other software? What stopped you?" | « Avez-vous déjà regardé d'autres logiciels? Qu'est-ce qui vous a arrêté? » | objections in advance |

#### Block H — Team and adoption

| # | EN | FR | Listen for |
|---|---|---|---|
| H1★ | "Who would actually use this day to day, and how comfortable are they with a computer or phone?" | « Qui l'utiliserait au quotidien, et à l'aise comment avec un ordinateur ou un téléphone? » | adoption risk |
| H2 | "Do your technicians type anything today, or does the front desk do it all?" | « Vos techniciens saisissent-ils quelque chose aujourd'hui, ou est-ce que l'accueil fait tout? » | design with front-desk-driven flow |
| H3 | "What devices are at the front desk and on the shop floor?" | « Quels appareils avez-vous à l'accueil et dans l'atelier? » | browser/tablet readiness |
| H4 | "What has made past changes at the shop stick or fail?" | « Qu'est-ce qui a fait réussir ou échouer les changements passés à l'atelier? » | change-management read |

#### Block I — Decision process (see §4.8) and Block J — Budget and urgency (see §4.9)

### 4.5 Reading the answers: profile dimensions

Capture these as structured profile data (they select the demo variant in §6). Values are **proposed enums** for the CRM mapping in §14.

| Dimension | Values |
|---|---|
| `software_state` | `PAPER`, `SPREADSHEET`, `GENERIC_TOOLS` (calendar + QuickBooks + notebook), `COMPETITOR`, `UNKNOWN` |
| `size_band` | `SOLO` (owner works the bays/desk), `SMALL` (2–3 staff), `MID` (4–9), `LARGE` (10+) — bands are a *sales* convenience, not a product limit (Core allows 3 users) |
| `location_count` | integer; `MULTI` when ≥ 2 |
| `language` | `FR`, `EN`, `UNKNOWN` (per business) + per-contact override |
| `digital_maturity` | `LOW`, `MEDIUM`, `HIGH` (judged from H1/H3; inferred unless stated) |
| `specialisation` | free tags: general, tires, European, diesel, fleet, body… |
| `seasonality` | `NONE`, `TIRE_SEASON`, `OTHER` |

### 4.6 Needs taxonomy and severity

Needs are the nine categories from the master plan. Each prospect need has a **severity 0–3**, a **provenance** (`VERIFIED` = prospect said it / showed it; `INFERRED` = rep judgement), and a short **evidence quote**.

| Need key | They might say (EN / FR) | Demo steps it activates (§5) | Plan relevance |
|---|---|---|---|
| `booking` | "The phone never stops." / « Le téléphone ne dérougit pas. » | D2, D3 | Core+ |
| `quotes_invoices` | "I write quotes on paper and retype them." / « Je fais mes soumissions sur papier et je les retape. » | D6, D8 | Core+ |
| `work_orders` | "Techs don't know what's approved." / « Les techniciens ne savent pas ce qui est approuvé. » | D7 | Core+ |
| `dvi` | "Customers don't believe they need it." / « Les clients ne croient pas en avoir besoin. » | D5 | Core basic; photos/report Pro+ |
| `communications` | "People keep calling to ask if it's ready." / « Les gens rappellent pour savoir si c'est prêt. » | D7, D9 | Core+; SMS [LIMIT] |
| `retention` | "Half my customers disappear after one visit." / « La moitié de mes clients disparaissent après une visite. » | D9 | basic reminders Core; rules + campaigns Pro+ |
| `inventory` | "I never know if I have the part." / « Je ne sais jamais si j'ai la pièce. » | D10 | Pro+ |
| `reporting` | "I have no idea which services make money." / « Je ne sais pas quels services rapportent. » | D10 | basic Core; advanced Pro+ |
| `multi_location` | "We're opening a second bay across town." / « On ouvre un second atelier ailleurs en ville. » | D10 | Complete |

**Severity rubric**

| Score | Meaning | Evidence needed |
|---:|---|---|
| 0 | No need / not applicable | They said it works well |
| 1 | Mild annoyance | Mentioned once, no cost described |
| 2 | Real recurring pain | A concrete example or a time/money estimate |
| 3 | Urgent, costly or blocking | Quantified or tied to a deadline (renewal date, busy season, staff loss) |

A need counts as **verified-3** only with an example *and* a consequence. The top three severities, ties broken by verified over inferred, select the **primary emphasis** of the demo (§6.1).

**Concern tags** (not needs; they pre-load objection handling in §7): `price`, `existing_software`, `migration`, `adoption`, `time`, `customer_prefers_phone`, `trust_security`, `sms_email`, `contract`.

### 4.7 Qualification: fit and intent are separate

Score them separately; never merge them into one number. Both are *explainable* and overridable by the rep, with a reason.

**Fit signals** (does GarageOS serve this shop well *today*?)

| Strong | Weak / caution |
|---|---|
| Independent repair shop; 1–10 staff; wants estimates → Work Orders → invoices in one place; open to CSV/Excel import of customers and vehicles | Needs card-payment processing built in (**[NO]**); needs full historical record migration (**[NO]**); needs a public API (**[NO]**); body shop/DMS-type needs not assessed; fleet with complex contract billing not assessed |
| French/English bilingual customers | Needs customer reschedule-from-link, deposits (**[NO]**) |
| Pro-relevant needs (DVI photos, reminders automation, inventory, tire storage) and a budget consistent with Pro | Needs a native mobile app (**[NO]**) |

**Intent signals**

| Higher | Lower |
|---|---|
| Specific trigger (contract renewing, hiring a service writer, a busy season ahead, an audit/accountant request) | "Just looking" with no trigger |
| Decision-maker on the call; agrees to a dated next step | Cannot name who decides; avoids dates |
| Shares real numbers, asks about migration and onboarding | Only asks "how much?" and ends the call |
| Asks to include a partner/bookkeeper/lead technician | Cancels or reschedules repeatedly |

**Suggested progression guardrails** (human-enforced now; candidate system checks later): do not book a prepared demo until (1) language is set, (2) at least one need is verified at severity ≥ 2, (3) a decision-maker is identified or the path to them is agreed, (4) a date for the demo is confirmed.

### 4.8 Decision-maker identification

Independent shops usually decide by **owner**, but verify. Typical influencers: **owner/operator** (final say, often also the main technician), **service manager / front-desk lead** (lives in the tool), **spouse or business partner**, **bookkeeper/accountant** (QuickBooks, tax), **lead technician** (adoption).

| Goal | EN | FR |
|---|---|---|
| Who decides | "When you've brought in a new tool before, who made the final call?" | « Quand vous avez adopté un nouvel outil par le passé, qui a pris la décision finale? » |
| Who else is involved | "Who else would want a say — a partner, your service manager, your bookkeeper?" | « Qui d'autre voudrait avoir son mot à dire — un associé, votre chef de service, votre comptable? » |
| Who uses it | "Who'd be using it every day and should see the demo?" | « Qui l'utiliserait tous les jours et devrait voir la démo? » |
| Process | "What would need to happen between today and 'yes'?" | « Qu'est-ce qui devrait arriver d'ici là pour que ce soit un « oui »? » |
| Authority check (soft) | "If you loved it, could you start a trial on your own, or would you want to run it past someone?" | « Si vous l'aimiez, pourriez-vous démarrer un essai vous-même, ou voudriez-vous en parler à quelqu'un? » |

Record each contact with title, decision role (`DECISION_MAKER`, `INFLUENCER`, `USER`, `BLOCKER`, `UNKNOWN`) and language. **Only the shop owner can complete activation and Stripe payment** (the activation flow binds to the intended owner email), so confirm the owner's name and email *before* the demo ends (step D11).

### 4.9 Budget and urgency

Do not open with price. Anchor on **what the problem costs today** using the prospect's own numbers. These are formulas, not claims: fill every variable from what the prospect told you, and show the working.

**Worksheet (verbal or on paper)**

| Item | Formula (only with prospect-provided inputs) |
|---|---|
| Current software and tool spend / month | G4 answer (software + any payment-terminal-linked tools + paper/printing they volunteer) |
| Missed-call value / month | (missed calls per week × share that would have booked × average repair ticket) × 4.3 |
| Time lost to double entry / month | (hours per week on paperwork the tool would remove × owner/staff hourly cost they state) × 4.3 |
| Invoices delayed or disputed | count per month × average amount (only if D3/E5 gave real examples) |
| GarageOS monthly price | §2.1 (Core $199, Pro $299, Complete $449, plus taxes) |

If their numbers don't support the price, say so and let the prospect conclude. Never supply "industry averages" you cannot source.

| Goal | EN | FR |
|---|---|---|
| Budget frame | "To make sure I recommend something sensible: roughly what do you spend each month on the tools you use to run the shop?" | « Pour que je vous recommande quelque chose de raisonnable : environ combien dépensez-vous chaque mois pour les outils qui font rouler l'atelier? » |
| Price expectation | "Is there a monthly range where a tool like this feels like an easy yes, and one where it feels too heavy?" | « Y a-t-il une fourchette mensuelle où un outil comme celui-ci est un oui facile, et une où ça devient trop lourd? » |
| Pricing disclosure | "For context, GarageOS runs from $199 to $449 a month depending on the plan, plus taxes, with a 14-day trial that starts with a payment method and $0 today. We'll pick the plan from what you actually need, not the other way around." | « Pour situer les choses : GarageOS va de 199 $ à 449 $ par mois selon le forfait, plus les taxes, avec un essai de 14 jours qui commence avec un mode de paiement et 0 $ aujourd'hui. On choisira le forfait selon vos vrais besoins, pas l'inverse. » |
| Urgency trigger | "Is there a date this needs to be solved by — a renewal, a busy season, a new hire?" | « Y a-t-il une date limite pour régler ça — un renouvellement, une haute saison, une nouvelle embauche? » |
| Timeline | "If this looked right, when would you realistically want to be running on it?" | « Si ça vous semblait bon, à quel moment voudriez-vous réalistement l'utiliser? » |
| Capacity | "What would make you say 'not now, even though it's good'?" | « Qu'est-ce qui vous ferait dire « pas maintenant », même si c'est bon? » |

Seasonality is real in this trade: ask when the shop's tire-changeover and spring/fall peaks are, and **avoid proposing a switch in the middle of the rush** unless the prospect asks. Offer a start date after the peak instead (§8.5).

### 4.10 Transition to the demo

**Step 1 — Mirror (30 seconds).** Summarise the top three verified needs in their words, with the consequence they gave.

> **EN:** "Let me play back what I heard: your phones are constantly interrupted and you're losing bookings when the desk is busy; you retype quotes and sometimes can't prove what a customer approved; and nobody reminds customers when the next service is due. Did I get that right? Anything important I missed?"
>
> **FR:** « Je vous répète ce que j'ai entendu : votre téléphone est constamment interrompu et vous perdez des rendez-vous quand l'accueil est occupé; vous retapez vos soumissions et vous ne pouvez parfois pas prouver ce que le client a approuvé; et personne ne rappelle aux clients quand leur prochain entretien est dû. Ai-je bien compris? Y a-t-il quelque chose d'important que j'ai manqué? »

**Step 2 — Propose the demo as a test of *their* problems.**

> **EN:** "What I'd suggest is a 30-minute look at the real product, built around those three things — nothing else. At the end you tell me honestly whether it would fix them. If it wouldn't, I'd rather you hear that from me."
>
> **FR:** « Ce que je propose, c'est un survol de 30 minutes du vrai produit, construit autour de ces trois points — rien d'autre. À la fin, vous me dites franchement si ça les réglerait. Si ce n'est pas le cas, je préfère que vous l'entendiez de ma bouche. »

**Step 3 — Lock the next step.** Date, time zone, channel (in person / video / phone + screen share), attendees (owner + the person who lives in the tool), duration.

> **EN:** "Would Thursday at 10 work, or is Friday afternoon quieter? Should [bookkeeper/service manager] join for the invoicing part?"
>
> **FR:** « Jeudi à 10 h, ça vous irait, ou le vendredi après-midi est plus tranquille? Voulez-vous que [comptable/chef de service] se joigne à nous pour la partie facturation? »

**Step 4 — Ask for what makes the demo feel like their shop** (all optional; never required).

> **EN:** "To make it feel like your shop, I can set it up with your name and logo — a photo of the sign works. It stays private to the demo and you can tell me to remove it afterwards. May I?"
>
> **FR:** « Pour que ça ressemble à votre atelier, je peux le préparer avec votre nom et votre logo — une photo de l'enseigne suffit. Ça reste privé à la démo et vous pouvez me demander de le retirer ensuite. Est-ce que je peux? »

Record permission (who, when, for what). Booking page photos and logo are *public brand assets* in the product, so if the demo shop is later deleted/expired, nothing remains public, but do not publish the prospect's branding anywhere outside the demo shop.

**Step 5 — Send nothing that is not asked for.** If you promised a calendar invite, send it once. Written outreach is governed by CASL and the Agent 2 workstream; do not improvise mass messages.

### 4.11 Discovery capture card (copy into the CRM when it exists)

```
Prospect: ______  City/Province: ______  Contact(s) & role: ______
Language: business ___ contact ___   Software state: ____  Size band: ____  Locations: __
Needs (key / severity 0-3 / VERIFIED|INFERRED / evidence quote / consequence):
 1. ______________________  2. ______________________  3. ______________________
Concern tags: ____________________________________________
Decision path: who decides ____ who else ____ timeline ____ trigger/deadline ____
Budget: current spend ____ expectation ____ price disclosed? Y/N
Fit: ____ (why)   Intent: ____ (why)
Next step: type ____ date ____ attendees ____ branding permission Y/N
Compliance: consent basis/source ____ DNC? ____
```

---

## 5. The ideal live demonstration (target 30 minutes; 25–35 supported)

**Design logic.** The demo follows one vehicle through one visit — **book → see the day → know the customer → inspect → estimate and approve → do the work → invoice and record payment → bring them back** — because that is the story the product was built around (`docs/feature-gap.md`: "Customer/booking → vehicle → appointment → estimate → approval → Work Order → DVI/work → status → invoice → payment → vehicle history → maintenance reminder"). Business value is shown at each hand-off (re-typing removed, proof kept, customer informed without a call). Feature tours (settings, every report, every list) are *excluded* unless a verified need calls for them.

### 5.1 Run sheet

Each step has a **full-depth** time (the complete card in §5.4) and a **standard 30-minute allocation** (what you actually spend when the demo is ordered by needs). Variants for 15, 25 and 35 minutes are in §5.6.

| ID | Step | Full depth (min) | Standard 30 (min) | Core question it answers for the owner |
|---|---|---:|---:|---|
| D0 | Preparation (before the meeting) | — | 30–45 min prior | — |
| D1 | Frame the session | 2 | 2 | "Is this worth my time?" |
| D2 | The customer's booking page | 4 | 3 | "Will this stop the phone chaos?" |
| D3 | The shop's day: dashboard and agenda | 3 | 2 | "Can I see my day at a glance?" |
| D4 | Customer and vehicle record | 3 | 2 | "Will I find everything about a car instantly?" |
| D5 | Inspect: digital vehicle inspection | 4 | 3 | "Will customers believe the findings?" |
| D6 | Estimate and customer approval | 4 | 4 | "Can I get approvals without phone tag, with proof?" |
| D7 | Work Order and job status | 3 | 3 | "Do my techs and front desk stay in sync?" |
| D8 | Invoice and recorded payment | 4 | 4 | "Does the paperwork finish itself, with the right taxes?" |
| D9 | Follow-up and retention | 4 | 3 | "How do I get them to come back?" |
| D10 | Business tools (need-driven, optional) | 0–4 | 0–1 | "Does it run the rest of my business?" |
| D11 | Plan fit and next step | 4 | 4 | "What happens now, and what does it cost me?" |
| | **Total** | **35 (+ up to 4 for D10)** | **30 (31 with a one-minute D10)** | |

Use **full depth only for the steps that serve the prospect's top three needs** (§6); compress the rest. D10 is shown only for a verified need (severity ≥ 2) in `inventory`, `reporting` or `multi_location`.

### 5.2 D0 — Preparation (do not skip; this is the difference between a demo and a tour)

**Checklist (print or keep on a second screen)**

| ✔ | Task | Detail / why |
|:-:|---|---|
| ☐ | Confirm launch state | The administrator has confirmed Stripe live billing is open (§2.4). If not, say "trial setup opens on [date]" only if that date has been confirmed in writing; otherwise run the demo and promise a follow-up. |
| ☐ | Create the prospect demo | `/platform/sales/new` (EN: *New prospect demo*, FR: *Nouvelle démonstration*): shop name, contact, preferred language, logo and photos (permission recorded in §4.10). **Language of the demo shop = the language of the meeting.** |
| ☐ | Start the real customer experience and finish onboarding | Business → Fiscal/logo → Services → Hours → Design → Plan (choose **Pro** as the default viewing tier; it lets you show Core vs Pro by switching). Rehearse once to learn how long it takes you. Do this **before** the meeting. |
| ☐ | Add the prospect's services (Settings → *Services*) | At least 3–5 realistic services with durations that match what they told you in discovery (e.g., "Oil change", "Brake inspection", "Winter tire changeover" if they do tires). Services drive the booking page. |
| ☐ | Enable online booking and publish the booking page | Settings → *Calendar & Hours* tab (`?tab=calendar`): enable online booking, check hours, slot interval and advance notice. Settings → *Booking Page* tab (`?tab=booking-page`): publish. Then open **Open real Booking Page** from `/admin/demo`. Verify at least one slot appears for the next workday. (Without hours, mechanics or services the page shows no times.) |
| ☐ | Load the quick demo scenario | `/admin/demo` → **Load quick demo scenario** (one client, vehicle, appointment tomorrow, quote, Work Order and draft invoice, all a single $120 line plus tax; every record is tagged with a seed batch). |
| ☐ | **Make the scenario a believable story (edit the tagged records)** | Edit the scenario client's name to an obviously fictional person (e.g., "Client Démo — M. Tremblay"), the vehicle to a plausible one for their market, and the lines to a realistic job with 2 labour lines and 2 parts (e.g., "Front brake pads and rotors"). Edits stay inside the tagged batch and are removed with it if you choose "Also remove this synthetic scenario batch" on Restart. Do **not** use a real customer's name, phone or email. |
| ☐ | Add one extra, *unsent* estimate for step D6 | Create a second draft estimate on the same fictional customer (`/admin/quotes/new`) so that D6 can show "send → customer view → accept" without altering the first record. This record is **not** in the tagged batch — remember to delete it, or tell the owner it is sample data, before sending the activation link (§8.2). |
| ☐ | Prepare one inspection | `/admin/inspections/new` on the fictional vehicle, with 6–8 items rated (e.g., front brakes: *Service required*, tires: *Needs attention*, battery: *Good*). On Pro, attach 1–2 photos you own the rights to; do not use a customer's photos. |
| ☐ | Decide the messaging mode | Default: **no live sends**. Use the customer-facing pages from the app (open the quote's public link in a second tab, the portal link) and the Garage Laurent assets. See the fallback matrix below. |
| ☐ | Open fallback tabs | `/demo` (their language), `/demo/booking`, `public/demo/garage-laurent/{lang}/15-invoice-pdf-page.webp` or `invoice-camille.pdf`, 14-ready-email, 19-maintenance-reminder-email. |
| ☐ | Screen hygiene | Close personal tabs; hide bookmarks; use a clean browser profile; set zoom so the text is readable on a shared screen (125%); plug in power; turn off notifications. |
| ☐ | Know the amber bar | Tell the prospect once: "The amber bar is my demo bar — it won't be in your account." Do not click **Convert to customer** or **Exit demo** by accident. |
| ☐ | Time-box | Put the §5.1 run sheet on a visible second screen. |

**Messaging fallback matrix (applies to D2, D6, D7, D8, D9)**

| Situation | Do this |
|---|---|
| You want to show the SMS/email the customer receives | Show the **prepared** public page from the app (quote link, portal) and the Garage Laurent captures/`messages.json` strings. Say it explicitly: "This is an example message." |
| The prospect volunteers to receive a real message on their own phone/email | Only if "Enable demo communications" is on **and** the rep did a same-day rehearsal of that exact send **and** the recipient is the prospect, in the room, who just agreed. Prefer **email of a quote** (the one validated Production channel). Treat SMS as **[LIMIT]**; the shop in the demo has no GarageOS-provisioned number, so it would use the shared-number path, which is not validated. If anything fails, say so and move on; do not retry live. |
| Any provider fails | "That's why we check every send and show the result in the product — let me show you the delivery status." Move to the next step. |
| Booking page has no slots | Switch to `/demo/booking` ("Garage Laurent — same engine, a fictional shop") and fix later. |

### 5.3 Rules during the demo

1. **Let the owner drive when you can.** On a shared screen, ask: "Want to try clicking that?" Ownership builds belief.
2. **Call out the hand-off** each time data flows forward without retyping ("the inspection becomes the estimate; the estimate becomes the Work Order").
3. **Check in every 5 minutes** with a micro-question (see each step) — it is not a trial close.
4. **Parking lot.** If asked about something later in the flow or irrelevant, say "Great question; I'll show that at [step]" or "Park it; I'll write it down."
5. **Record outcomes as you go** (manual until Demo Assistant ships): per step, `status` (`FULL`, `COMPACT`, `SKIPPED`, `DEFERRED`), `interest` (0–3), objections raised, and any new verified need. This feeds §14.4.
6. **Do not demo anything you have not rehearsed with the current build.** If a screen looks different from this playbook, trust the screen and tell the maintainer afterwards (§16).
7. **Never leave the prospect's demo with real prospect-entered data you did not mention**: if they typed real customers, say so before conversion (the conversion flow retains live records).

### 5.4 Step cards

Each card lists: **Objective · Time (full depth) · Show (feature, status, plan) · Path · Prep · Script (EN/FR) · Ask · Buying signal · Likely objections · Transition · Shortcut**. Paths use the English label; French labels follow in parentheses; routes are repository-verified (§5.7).

---

#### D1 — Frame the session (2 min)

- **Objective:** Re-establish agreement on purpose, agenda and what "success" looks like; confirm the top three needs.
- **Show:** Nothing in the product (or the prepared dashboard at most). Eye contact beats screen.
- **Path:** `/admin/dashboard` open but idle.
- **Prep:** Discovery capture card (§4.11) with the top three needs and consequences.
- **Script — EN:** "Thanks. Last time you told me [need 1 in their words], [need 2], and [need 3]. I've set this up with your shop's name so it's not a generic demo. I'll follow one car through a visit — booking to payment to the next reminder — and stop wherever you want to go deeper. At the end, you tell me honestly whether this fixes those three things. Okay?"
- **Script — FR:** « Merci. La dernière fois, vous m'avez dit [besoin 1 dans leurs mots], [besoin 2] et [besoin 3]. J'ai préparé ça avec le nom de votre atelier pour que ce ne soit pas une démo générique. Je vais suivre une voiture pendant une visite — de la réservation au paiement jusqu'au prochain rappel — et m'arrêter où vous voulez aller plus loin. À la fin, vous me dites franchement si ça règle ces trois points. D'accord? »
- **Ask:** "Has anything changed since we talked? Who else wanted to see a particular part?"
- **Buying signal:** They restate their problem with energy; they name a part they most want to see.
- **Objections:** "Just send me the pricing." → "Happy to — I'll include it. Give me 25 minutes so the price makes sense against what it fixes." (§7.1)
- **Transition:** "Let's start where your customer starts: how they book."
- **Shortcut (25 min):** Skip the frame to 60 seconds; state the three needs only.

---

#### D2 — The customer's booking page (4 min) — `booking`, `communications`

- **Objective:** Show that customers can self-book at any hour on a page that looks like the shop, and that bookings land in the agenda with the right service and time — reducing phone interruptions without removing the phone.
- **Show:** Public booking page **[IMPL]** (Classic template on every plan; Modern/Bold/Minimal templates and typography **[IMPL·PRO]**); the shop's own logo, colours, services, hours; booking form; the shop's logo QR code and embed snippet **[IMPL]**; the customer's manage link (confirm/cancel) **[IMPL]**; confirmation by email, and by SMS only if the shop has a number **[LIMIT]**.
- **Path:** `/admin/demo` → **Open real Booking Page** (opens `/book/{slug}`). Then settings: Settings (*Configuration*) → **Booking Page** tab (`?tab=booking-page`) for look and feel; Settings → **Calendar & Hours** (*Calendrier et horaires*) tab (`?tab=calendar`) for the QR code, embed code, slot interval, advance notice and mechanics. Show the page on a **phone-width window** (390 px) to demonstrate responsiveness.
- **Prep:** Booking enabled and published; ≥ 3 services; hours set; verify a slot exists; know the slug; have the QR visible; phone ready (if in person, let the owner scan the QR with their own phone).
- **Script — EN:** "This is your booking page — [shop name], your logo, your services. A customer can book at 9 p.m. on a Sunday without calling. They pick the service, the day and a time that fits your hours and the mechanic's availability, give their details, and that's it. [Open the agenda in the next step to show it landed.] The customer gets a confirmation and a link to confirm or cancel. You can put this QR on the counter, on the invoice or on your Google profile. And the phone still works — the front desk can book the same agenda by hand."
- **Script — FR:** « Voici votre page de réservation — [nom], votre logo, vos services. Un client peut réserver à 21 h un dimanche sans appeler. Il choisit le service, le jour et une heure qui respecte vos horaires et la disponibilité du mécanicien, il donne ses coordonnées, et c'est fait. [Montrer l'agenda à l'étape suivante.] Le client reçoit une confirmation et un lien pour confirmer ou annuler. Vous pouvez mettre ce code QR au comptoir, sur la facture ou sur votre fiche Google. Et le téléphone fonctionne toujours — l'accueil peut réserver dans le même agenda à la main. »
- **Ask:** "What would you do with the calls you'd stop getting?" / « Que feriez-vous des appels que vous ne recevriez plus? » · "Would your customers use this, or do they mostly call?" (calibrates §7.6)
- **Buying signal:** "That looks like my shop"; asks for the QR; asks "can it block off days?" (hours/availability); wants to see it on their phone.
- **Likely objections:** "My customers like to call" (§7.6); "What if two people book the same time?" → the agenda and booking engine guard against double-booking (`docs/feature-gap.md`: transaction-level protection **[IMPL]**; DST-specific tests were still pending in the same document — do not claim DST certification); "Can customers pay a deposit?" → **[NO]**.
- **Transition:** "Now let's see where that booking shows up in your day."
- **Shortcut:** Show the page on the phone-width window only (60–90 s); skip settings.
- **Safe alternative:** `/demo/booking` (Garage Laurent replica) or captures 03, 04, 05, 06.

---

#### D3 — The shop's day: dashboard and agenda (3 min) — `booking`, `reporting`

- **Objective:** Make the owner see that the morning starts with one screen: who's coming, who's waiting, what's due.
- **Show:** Dashboard command centre with today's appointments **[IMPL]**; agenda **[IMPL]**; the front-desk path for phone bookings (new appointment) **[IMPL]**; mechanic assignment on appointments **[IMPL]**; global search for customers/vehicles in the top bar **[IMPL]**.
- **Path:** Sidebar → **Dashboard** (*Tableau de bord*) `/admin/dashboard`; **Appointments** (*Rendez-vous*) `/admin/appointments`; **New appointment** `/admin/appointments/new`.
- **Prep:** The scenario appointment (tomorrow) and the booking made during D2 (if you made one) visible; assign a mechanic if the shop has more than one.
- **Script — EN:** "Here's your day. Appointments for today, what's coming tomorrow, recent activity. The booking from the page lands here [show it], with the service and the vehicle. If a customer phones instead, the front desk adds it in about a minute — same agenda, one source of truth. Notice you can assign the mechanic so nobody is double-booked."
- **Script — FR:** « Voici votre journée. Les rendez-vous d'aujourd'hui, ce qui s'en vient demain, l'activité récente. La réservation de la page arrive ici [la montrer], avec le service et le véhicule. Si un client appelle plutôt, l'accueil l'ajoute en environ une minute — même agenda, une seule source de vérité. Remarquez qu'on peut assigner le mécanicien pour éviter les doublons. »
- **Ask:** "Who maintains your schedule today — and where does it live?" / « Qui tient votre horaire aujourd'hui — et où est-il? »
- **Buying signal:** Compares to the whiteboard/paper; asks about multiple bays/mechanics; "I could send this to my front desk."
- **Likely objections:** "Does it sync with Google Calendar?" → **not available** (the public `/integrations` page lists external calendar sync under "Not available"); say so and offer to note it. "Can I see revenue?" → dashboard has revenue and top clients; full reports in D10.
- **Transition:** "Let's open the customer behind that booking."
- **Shortcut:** Combine with D2: land on the agenda straight from the booking.

---

#### D4 — Customer and vehicle record (3 min) — `retention`, `communications`, `quotes_invoices`

- **Objective:** Show that every car has a history and every customer has a language and a contact preference, so nothing is retyped and customers are reached the way they prefer.
- **Show:** Client detail, vehicle detail and service history **[IMPL]**; per-customer preferred language (EN/FR/ES) and notify channel (Auto, SMS, Email, Both) **[IMPL]**; customer portal card (send link by email, copy link, revoke) **[IMPL]**; import tool (mention only) **[IMPL]**.
- **Path:** **Clients** (*Clients*) `/admin/clients` → `/admin/clients/[id]` → vehicle `/admin/vehicles/[id]`; search box ("Search clients, vehicles…" / « Rechercher clients, véhicules… »). The **Customer portal** card is on the client detail page.
- **Prep:** The scenario client with at least one visit; a second fictional customer so search has something to find.
- **Script — EN:** "This is the customer and their car. Everything that happens to this vehicle — estimates, Work Orders, inspections, invoices, reminders — is attached here. Next visit, whoever answers the phone sees what was done last time. Notice the customer's language: documents and messages go out in it. And from this card you can give the customer a private link — their portal — where they see their vehicles, estimates and invoices."
- **Script — FR:** « Voici le client et sa voiture. Tout ce qui arrive à ce véhicule — soumissions, ordres de travail, inspections, factures, rappels — est rattaché ici. À la prochaine visite, la personne qui répond voit ce qui a été fait la dernière fois. Regardez la langue du client : les documents et messages partent dans sa langue. Et depuis cette fiche, vous pouvez donner au client un lien privé — son portail — où il voit ses véhicules, ses soumissions et ses factures. »
- **Ask:** "Where does a car's history live for you today?" / « Où se trouve l'historique d'une voiture chez vous aujourd'hui? »
- **Buying signal:** "I wish I had this"; mentions a recent dispute about previous work; asks about importing their customer list.
- **Likely objections:** "Can I bring my customers over?" → CSV/Excel import of customers and vehicles with a preview before saving; **past invoices, estimates and Work Orders do not import** (§2.3). Core: up to 500 rows per file; Pro/Complete: up to 10,000 and inventory. "Who sees my customers?" → role-based access (§7.7).
- **Transition:** "A new customer arrives with something wrong. Let's inspect it."
- **Shortcut:** 60 seconds: search → vehicle history → portal card.

---

#### D5 — Inspect: digital vehicle inspection (4 min) — `dvi`

- **Objective:** Show a repeatable inspection that turns findings into a priced estimate and, on Pro, gives the customer visual proof.
- **Show:** Standard checklist, condition levels (Good / Needs attention / Service required), notes, custom items, **Create quote from findings** **[IMPL]**; photos on findings, reusable templates and the shareable customer report **[IMPL·PRO]**.
- **Path:** **Inspections** (*Inspections*) `/admin/inspections` → open the prepared inspection `/admin/inspections/[id]`; templates `/admin/inspections/templates` (Pro); new `/admin/inspections/new`.
- **Prep:** Prepared inspection with mixed ratings; Pro tier selected; 1–2 photos attached; the customer report link opened in a second tab.
- **Script — EN:** "The mechanic walks around the car and rates each item: good, needs attention, service required — with a note and, on Pro, a photo. The customer doesn't have to take our word for it; they can see the report on their phone [show]. And with one action, the findings become a draft estimate — no retyping."
- **Script — FR:** « Le mécanicien fait le tour de la voiture et évalue chaque point : bon, à surveiller, service requis — avec une note et, avec Pro, une photo. Le client n'a pas à nous croire sur parole; il peut voir le rapport sur son téléphone [le montrer]. Et d'un geste, les constats deviennent une soumission brouillon — sans rien retaper. »
- **Ask:** "How do you show customers what you found today?" / « Comment montrez-vous aux clients ce que vous avez trouvé aujourd'hui? »
- **Buying signal:** "Customers would stop arguing about brakes"; asks about templates for different services; asks who needs to type.
- **Likely objections:** "My techs won't do this" (§7.4: front desk can enter findings; the technician's part can stay simple); "Photos are on Pro only?" → yes: basic DVI on every plan; photos/templates/report Pro+. Do **not** claim that photos or ratings prove a specific measured defect.
- **Transition:** "Now the findings need a price and a yes."
- **Shortcut:** If `dvi` is not a need, show only the admin screen for 60 seconds, or skip (go to D6 directly and create a quote by hand).
- **Safe alternative:** captures 08, 09 (inspection admin and customer report).

---

#### D6 — Estimate and customer approval (4 min) — `quotes_invoices`, `communications`

- **Objective:** Show a professional estimate that the customer can accept on their phone without logging in, with the decision recorded.
- **Show:** Estimate editor with lines, quantities, prices, GST/QST **[IMPL]**; **Send by email** / **Send by SMS** / **Mark as sent (no email)** **[IMPL]** (SMS **[LIMIT]**); public customer page with **Accept quote** **[IMPL]**; status becomes Accepted and staff are notified by email **[IMPL]**; staff can also record a verbal decision **[IMPL]**; **Create work order** and **Convert to invoice** on the estimate **[IMPL]**.
- **Path:** **Quotes** (*Soumissions*) `/admin/quotes` → `/admin/quotes/[id]` (send dialog; actions); customer page `/quote/[token]` (copy the link from the send flow, or open the prepared one in a second tab); new `/admin/quotes/new`.
- **Prep:** The extra unsent draft estimate on the fictional customer; the customer view opened in a private/incognito tab; **no real send** unless §5.2 conditions are met.
- **Script — EN:** "The estimate is built from the findings: labour, parts, taxes. Send it by email or text. The customer opens a page with your name and logo — no account, no password — reviews it and taps Accept [open the customer page; show the button]. GarageOS stores what they saw and when, and you get notified. If they say yes on the phone instead, you record that yourself. Nobody is arguing later about what was approved."
- **Script — FR:** « La soumission est construite à partir des constats : main-d'œuvre, pièces, taxes. Envoyez-la par courriel ou par texto. Le client ouvre une page à votre nom et à votre logo — sans compte, sans mot de passe — la consulte et appuie sur Accepter [ouvrir la page client; montrer le bouton]. GarageOS conserve ce qu'il a vu et quand, et vous êtes avisé. S'il dit oui au téléphone, vous l'inscrivez vous-même. Plus de discussion après coup sur ce qui a été approuvé. »
- **Ask:** "How do you get approval for extra work today, and has that ever gone wrong?" / « Comment obtenez-vous l'approbation pour du travail supplémentaire aujourd'hui, et est-ce déjà mal tourné? »
- **Buying signal:** Shares a dispute story; asks "can the customer decline part of it?" (answer only from what you see in the customer UI — do not assume partial acceptance); asks how fast customers answer.
- **Likely objections:** "Do I have to send by text?" → email or SMS; "Customers don't read texts" → the portal and email are alternatives, and the shop chooses; "Can customers pay online?" → **[NO]** (D8). Do **not** say "legally binding signature"; say "recorded approval with a snapshot of what the customer saw".
- **Do not navigate to an "approval history" page.** It does not exist as an admin list (§2.3). Show the status change, the staff notification and the stored decision on the estimate.
- **Transition:** "Approved — now the work. Watch how this becomes the job."
- **Shortcut:** Skip the editor; show only the customer view and the **Accepted** status.
- **Safe alternative:** captures 10, 11 (Alexandre's pending quote, labelled as another sample visit).

---

#### D7 — Work Order and job status (3 min) — `work_orders`, `communications`

- **Objective:** Show that the approved estimate becomes the Work Order, with a mechanic and a status the front desk sees, and that the customer is told when it's ready.
- **Show:** Work Order created from the estimate **[IMPL]**; assigned mechanic **[IMPL]**; job status — Checked in → Waiting approval → Waiting parts → In service → Ready for pickup **[IMPL]**; automatic "ready" notification by email and/or SMS, controlled in settings **[IMPL]** (SMS **[LIMIT]**); parts picked from inventory come off stock automatically **[IMPL·PRO]**; **Convert to draft invoice** **[IMPL]**.
- **Path:** **Work orders** (*Ordres de travail*) `/admin/work-orders` → `/admin/work-orders/[id]`; from an estimate: **Create work order**. Notification toggles: Settings → **Notifications** tab (`?tab=notifications`).
- **Prep:** Scenario Work Order; a part in inventory (Pro) linked to a line if inventory is a need.
- **Script — EN:** "When the customer accepts, you create the Work Order from the estimate with one click. The mechanic is assigned; the job has a status the front desk sees without walking to the bay. When it reaches 'Ready for pickup', the customer is notified automatically — email or text, your choice — so the phone stops ringing with 'is it ready?'. On Pro, parts picked on the order come off your inventory."
- **Script — FR:** « Quand le client accepte, vous créez l'ordre de travail à partir de la soumission en un clic. Le mécanicien est assigné; le travail a un statut que l'accueil voit sans aller jusqu'à la baie. Quand il passe à « Prêt pour la récupération », le client est avisé automatiquement — courriel ou texto, à votre choix — et le téléphone arrête de sonner pour « est-ce prêt? ». Avec Pro, les pièces choisies sur l'ordre sortent de votre inventaire. »
- **Ask:** "How does the front desk know a car is done?" / « Comment l'accueil sait-il qu'une voiture est terminée? »
- **Buying signal:** "My guys shout across the shop"; asks for who sees what; asks how techs would use it.
- **Likely objections:** "I don't want a kanban board" → there is none (deliberately simple status, managed by the front desk); "Time tracking?" → **[NO]**.
- **Transition:** "The car's done and the customer's been told. Let's get paid."
- **Shortcut:** Show the status dropdown and the "ready" setting only.

---

#### D8 — Invoice and recorded payment (4 min) — `quotes_invoices`, `reporting` — **key sales moment**

- **Objective:** Show a branded invoice with correct Canadian taxes created from the Work Order, sent to the customer, and the payment recorded — and be explicit that GarageOS records payments, it doesn't process the customer's card.
- **Show:** Draft invoice from the Work Order **[IMPL]**; GST/QST (taxes stored per invoice) **[IMPL]**; PDF with logo and shop details **[IMPL]**; send by email/SMS and download **[IMPL]**; **Mark as paid → Record payment** with methods Card, Cash, Interac e-Transfer (*Virement Interac*), Cheque, Other **[IMPL]**; refunds **[IMPL]**; cash drawer ("Caisse") **[IMPL]**; Accounting Light and accountant exports **[IMPL·PRO]**; QuickBooks Online sync **[IMPL·PRO / LIMIT]**.
- **Path:** **Invoices** (*Factures*) `/admin/invoices` → `/admin/invoices/[id]`; **Mark as paid** dialog; **Cash drawer** (*Caisse*) `/admin/caja`; **Accounting** (*Comptabilité*) `/admin/accounting`; Settings → **QuickBooks** tab (`?tab=integrations`).
- **Prep:** The scenario draft invoice finalised (or convert the Work Order); open the Garage Laurent PDF (`invoice-camille.pdf`) in a second tab as a polished example.
- **Script — EN:** "From the Work Order, one click creates the invoice — your logo, your tax numbers, GST and QST calculated and stored on the invoice so your books match. Send it by email or text, or download the PDF. When the customer pays — card at your terminal, cash, e-Transfer, cheque — you record it here. One thing to be clear on: GarageOS records payments you collect; it does not process your customers' cards. Whatever terminal you use today keeps working."
- **Script — FR:** « À partir de l'ordre de travail, un clic crée la facture — votre logo, vos numéros de taxes, la TPS et la TVQ calculées et conservées sur la facture pour que vos livres concordent. Envoyez-la par courriel ou par texto, ou téléchargez le PDF. Quand le client paie — carte à votre terminal, comptant, virement, chèque — vous l'inscrivez ici. Une précision importante : GarageOS consigne les paiements que vous encaissez; il ne traite pas les cartes de vos clients. Le terminal que vous utilisez aujourd'hui continue de fonctionner. »
- **Ask:** "Who does your invoices today, and how long does one take?" / « Qui fait vos factures aujourd'hui, et combien de temps ça prend? » · "What does your accountant need from you?" (→ Pro: Accounting Light / QuickBooks)
- **Buying signal:** Compares to retyping; asks about GST/QST numbers on the PDF; "my bookkeeper would love this"; asks for a sample PDF.
- **Likely objections:** "I need to take card payments through the software" → **[NO]** — be direct, ask whether their terminal is a hard dependency; "Does it do QuickBooks?" → **Pro**, and tested with a simulated Intuit only — do not promise a live sync until validated (§2.4); "What about my old invoices?" → they don't import (§2.3).
- **Transition:** "Paid. Now the part most shops skip: getting them back."
- **Shortcut:** PDF + the Record-payment dialog only.
- **Safe alternative:** captures 15, 16, 17 and `invoice-camille.pdf` (real renderer output, fictitious data).

---

#### D9 — Follow-up and retention (4 min) — `retention`, `communications`

- **Objective:** Show that the visit ends with a next visit scheduled in the system, and that past customers can be reached with consent.
- **Show:** Manual reminders per vehicle (service type, due date and/or mileage) with daily email one week before **[IMPL]**; reminder rules created from completed jobs, lead time, preferred channel **[IMPL·PRO]**; customer portal (vehicles, estimates, invoices, history, upcoming reminders) **[IMPL]**; campaigns — segmented **email** with unsubscribe: all consented, by language, inactive for X months, service due/overdue, manual list **[IMPL·PRO]**; two-way SMS inbox **[LIMIT]** (needs a GarageOS-provisioned shop number).
- **Path:** **Reminders** (*Rappels*) `/admin/reminders` → `/admin/reminders/new`; rules `/admin/reminders/rules` (Pro); **Campaigns** (*Campagnes*) `/admin/campaigns` → `/admin/campaigns/new`; **Inbox** (*Boîte de réception*) `/admin/inbox`; portal `/portal/[token]` (from the client's *Customer portal* card).
- **Prep:** One reminder created for the scenario vehicle ("Oil change in 6 months" or similar, due date set); the portal link opened in a second tab; on Pro, the rules page open; a draft campaign **not sent**.
- **Script — EN:** "The last step of every visit: set the next one. Here's a reminder tied to the car — oil change in six months. On Pro, it can create itself from the job you just completed and go out by the customer's preferred channel. Here's the portal the customer sees. And this is for the customers who haven't been back — pick 'inactive for twelve months', write a message, and it goes by email to those who consented, with an unsubscribe built in."
- **Script — FR:** « La dernière étape de chaque visite : planifier la suivante. Voici un rappel lié à la voiture — changement d'huile dans six mois. Avec Pro, il peut se créer tout seul à partir du travail que vous venez de terminer et partir selon le canal préféré du client. Voici le portail que voit le client. Et ceci s'adresse aux clients qui ne sont pas revenus : choisissez « inactifs depuis douze mois », rédigez un message, et il part par courriel à ceux qui ont consenti, avec un désabonnement intégré. »
- **Ask:** "How many customers haven't been back in a year?" / « Combien de clients ne sont pas revenus depuis un an? » (F4) · "What would it be worth to get a fraction of them back?" (their numbers only)
- **Buying signal:** Quantifies lapsed customers; asks about message wording; "I never do this".
- **Likely objections:** "SMS/email concerns" (§7.8: consent, unsubscribe, STOP handling are built; campaigns send email only); "I don't have time to write campaigns" → reminders are the low-effort start; start with Core's manual reminders.
- **CASL guardrail:** Maintenance reminders may be promotional in part; the repository's own CASL matrix marks them "REVIEW … before broad launch" (`docs/compliance/casl-matrix.md`). Say the product includes consent and unsubscribe controls; do not tell a prospect that their campaigns are automatically CASL-compliant.
- **Transition:** "That's the full visit. Before we talk fit, let me show the pieces that matter to *your* situation."
- **Shortcut:** Reminder + portal only (90 s), or reminder only.
- **Safe alternative:** captures 18, 19, 21.

---

#### D10 — Business tools (need-driven; 0–4 min) — `inventory`, `reporting`, `multi_location`

Show **only** what the discovery verified (severity ≥ 2); otherwise one sentence.

| Need | Show | Path | Plan |
|---|---|---|---|
| `reporting` | Overview, Sales, Receivables (aging), Jobs and quotes (approval rate), Customers (retention), Inventory; CSV export. "Which services make money? Who owes me?" | **Reports** (*Rapports*) `/admin/reports` | Basic Core (this month / last month / last 30 days); full Pro+ |
| `inventory` | Parts, stock levels, movements; auto-deduct on Work Orders; low-stock | **Inventory** (*Inventaire*) `/admin/inventory` | Pro+ |
| Tire shops | Tire storage: sets (summer/winter), size, condition, location, check-in/out | **Tire storage** (*Entreposage de pneus*) `/admin/tire-storage` | Pro+ |
| `multi_location` | Organization page, add a location, switch from the top bar, per-location access, consolidated and per-location reports | **Organization** (*Organisation*) `/admin/organization`; Settings → **Locations** tab (`?tab=locations`); **Reports → Locations** | Complete; per-location price is confirmed with the plan (§2.1) |
| Team / adoption | Invite staff, roles (Owner, Mechanic, Viewer), seat limit (Core 3), fine-grained permissions (Pro) | Settings → **Team** tab (`?tab=team`) | Core 3 users; Pro+ unlimited |
| Migration | Import wizard: upload → auto-matched columns → validation preview (nothing written yet) → duplicate handling → error rows downloadable | **Import data** (*Importer des données*) `/admin/import` | Core 500 rows (customers+vehicles); Pro 10,000 rows incl. inventory |
| Own domain/brand | Custom domain, branded sender | Settings → **Domain & Email** tab (`?tab=domain`) | Pro+ |

- **Script — EN:** "You told me [need]. This is how GarageOS handles that — [30–60 seconds, one screen]."
- **Script — FR:** « Vous m'avez dit [besoin]. Voici comment GarageOS s'en occupe — [30 à 60 secondes, un seul écran]. »
- **Likely objections:** Plan gating — respond with §2.2, never apologise for gating; explain it exists because those features have separate costs and complexity.
- **Shortcut:** Skip entirely unless a verified need requires it.

---

#### D11 — Plan fit and next step (4 min)

- **Objective:** Recap value against the three needs, recommend one plan with a reason, handle the first objection, and agree a dated next step (trial start or owner activation).
- **Show:** The **Viewing** selector in the amber bar to demonstrate how the product differs by plan (change it live; the gates really change) **[IMPL]**; pricing page `/pricing` for the written reference.
- **Path:** Amber bar → **Viewing: Core / Pro / Complete**; `/pricing`; `/admin/demo/convert` for the conversion flow (Convert to customer).
- **Script — EN:** "Let me play back what we solved. [Need 1] → [what they saw]. [Need 2] → [what they saw]. [Need 3] → [what they saw]. For what you described, I'd recommend [plan] because [specific reason, e.g., you want inspection photos and automatic reminders — that's Pro]. It's $[price] a month plus taxes; you'd start with a 14-day trial — you add a payment method, pay nothing today, and we show you the exact date and amount of the first charge before the trial begins. If it's not for you, you cancel in Billing before that date. What would you need to see or hear to feel comfortable starting?"
- **Script — FR:** « Reprenons ce qu'on a réglé. [Besoin 1] → [ce qu'ils ont vu]. [Besoin 2] → [ce qu'ils ont vu]. [Besoin 3] → [ce qu'ils ont vu]. Pour ce que vous avez décrit, je recommanderais [forfait] parce que [raison précise : p. ex. vous voulez les photos d'inspection et les rappels automatiques — c'est Pro]. C'est [prix] $ par mois plus les taxes; vous commenceriez par un essai de 14 jours — vous ajoutez un mode de paiement, vous ne payez rien aujourd'hui, et nous vous montrons la date et le montant exacts du premier prélèvement avant le début de l'essai. Si ce n'est pas pour vous, vous annulez dans Facturation avant cette date. De quoi auriez-vous besoin pour vous sentir à l'aise de commencer? »
- **Ask:** "On a scale of 1 to 10, how well does this fit your shop — and what would make it a 10?" / « Sur une échelle de 1 à 10, dans quelle mesure ça convient à votre atelier — et qu'est-ce qui en ferait un 10? »
- **Buying signal:** Asks about start date, migration help, who gets logins, pricing for annual; asks to include a partner; says "so what happens next?".
- **Likely objections:** §7 — price, existing software, migration, adoption, time, contract, security.
- **Next-step options** (§8): (1) **Convert to customer now** — owner name and email confirmed, plan and Monthly/Annual chosen, activation link sent from this screen; (2) **Start their own trial** from `/pricing` / `/get-started` if they prefer self-serve (the rep's demo shop is separate and expires); (3) **Second meeting** with the partner/bookkeeper with a date; (4) **Written follow-up** with the recommendation and a decision date.
- **Shortcut:** Recap in 60 seconds; propose the next step immediately.

### 5.5 Questions to ask in the demo (pocket card)

| Moment | EN | FR |
|---|---|---|
| After D2 | "Would your customers use this?" | « Vos clients l'utiliseraient-ils? » |
| After D4 | "Where does this live today?" | « Où est-ce aujourd'hui? » |
| After D6 | "How do you get approvals now?" | « Comment obtenez-vous les approbations maintenant? » |
| After D8 | "Who does the invoicing, how long?" | « Qui fait la facturation, et combien de temps? » |
| After D9 | "How many haven't been back in a year?" | « Combien ne sont pas revenus depuis un an? » |
| Mid-demo | "What's the one thing you'd want to fix first?" | « Quelle est la première chose que vous voudriez régler? » |
| End | "What would stop you from starting this week?" | « Qu'est-ce qui vous empêcherait de commencer cette semaine? » |

### 5.6 Demo lengths

| Variant | Total | Allocation (minutes) | What is cut |
|---|---:|---|---|
| **Express (15 min)** | 15 | D1 1 · D2 2 · D6 3 · D8 3 · D9 2 · D11 3 · buffer 1 | D3, D4, D5, D7, D10 reduced to one spoken sentence each |
| **25 min** | 25 | D1 1 · D2 3 · D3 1 · D4 2 · D5 2 · D6 3 · D7 2 · D8 3 · D9 2 · D11 4 · buffer 2 | D3 merged into D2; D4 shown as search only; no D10 |
| **Standard (30 min)** | 30 | D1 2 · D2 3 · D3 2 · D4 2 · D5 3 · D6 4 · D7 3 · D8 4 · D9 3 · D10 0–1 · D11 4 | D10 only if verified |
| **Extended (35 min)** | 35 | Every step at full depth (D1–D9 and D11 = 35). D10 is added only by shortening another step | When two or more decision-makers attend or the prospect drives |

### 5.7 Navigation verification (repository)

All routes are present as `page.tsx` under `src/app/`; labels from `src/lib/admin-locale/layout.ts` and `src/lib/admin-locale/settings.ts`; sidebar groups from `src/components/layout/Sidebar.tsx`. Sidebar group labels: Operations/*Opérations*, Customers/*Clients*, Communications, Finance/*Finances*.

| Area | EN label | FR label | Route | Gating |
|---|---|---|---|---|
| Dashboard | Dashboard | Tableau de bord | `/admin/dashboard` | — |
| Appointments | Appointments | Rendez-vous | `/admin/appointments`, `/new`, `/[id]/edit` | — |
| Work orders | Work orders | Ordres de travail | `/admin/work-orders`, `/new`, `/[id]`, `/[id]/edit` | — |
| Inspections | Inspections | Inspections | `/admin/inspections`, `/new`, `/[id]`, `/templates` | Photos/templates/report Pro |
| Quotes | Quotes | Soumissions | `/admin/quotes`, `/new`, `/[id]`, `/[id]/edit` | — |
| Reminders | Reminders | Rappels | `/admin/reminders`, `/new`, `/rules` | Rules Pro |
| Tire storage | Tire storage | Entreposage de pneus | `/admin/tire-storage`, `/new`, `/[id]` | Pro |
| Clients | Clients | Clients | `/admin/clients`, `/new`, `/[id]`, `/[id]/vehicles/new` | — |
| Vehicles | (via client) | (via client) | `/admin/vehicles/[id]` | — |
| Invoices | Invoices | Factures | `/admin/invoices`, `/new`, `/[id]`, `/[id]/edit` | — |
| Accounting | Accounting | Comptabilité | `/admin/accounting` | Pro |
| Import data | Import data | Importer des données | `/admin/import` | Inventory/10k rows Pro |
| Inbox | Inbox | Boîte de réception | `/admin/inbox`, `/[threadId]` | SMS replies need a shop number |
| Campaigns | Campaigns | Campagnes | `/admin/campaigns`, `/new`, `/[id]` | Pro |
| Cash drawer | Cash drawer | Caisse | `/admin/caja` | — |
| Reports | Reports | Rapports | `/admin/reports` | Full Pro; locations Complete |
| Organization | Organization | Organisation | `/admin/organization` | Complete |
| Inventory | Inventory | Inventaire | `/admin/inventory`, `/new`, `/[id]` | Pro |
| Settings (tabs) | General · Calendar & Hours · Notifications · Services · Booking Page · Team · Locations · Domain & Email · QuickBooks · Billing | Général · Calendrier et horaires · Notifications · Services · Page de réservation · Équipe · Emplacements · Domaine et courriel · QuickBooks · Facturation | `/admin/settings?tab=general\|calendar\|notifications\|services\|booking-page\|team\|locations\|domain\|integrations\|billing` | Tabs shown to Owner |
| Help | Help/Support | Aide | `/admin/support` | — |
| Public booking | — | — | `/book/[slug]`, `/book/[slug]/manage/[token]` | booking enabled |
| Customer quote / inspection / portal | — | — | `/quote/[token]`, `/inspection/[token]`, `/portal/[token]` | token links |
| Public demo | — | — | `/demo`, `/demo/booking` | — |
| Sales | Sales demos | Démonstrations de vente | `/platform/sales`, `/new`, `/[id]`, `/[id]/convert`; in-demo `/admin/demo`, `/admin/demo/convert` | `SUPER_ADMIN` only today |
| Owner activation | — | — | `/activate-demo/[id]`, `/admin/activation-payment` | token |

*Anything not in this table has not been verified and must not be navigated to in a live demo.*

---

## 6. Adaptive demonstrations

The base demo (§5) is the *spine*. Needs assessment (§4.6) decides **which steps come first, which are compressed and which are only mentioned** — not what is true about the product. The same facts, the same honesty rules, a different order and depth.

### 6.1 How the needs assessment reorders the demo

**Step 1 — Pick the primary emphasis.** Rank the prospect's needs by `severity` (3→0), verified before inferred, and take the top **three**. These are the *must-win* needs.

**Step 2 — Map needs to steps.**

| Need key | Primary step(s) | Support step(s) |
|---|---|---|
| `booking` | D2, D3 | D9 (appointment reminders / confirmations) |
| `quotes_invoices` | D6, D8 | D5 (findings → estimate), D4 |
| `work_orders` | D7 | D6 (estimate → Work Order), D3 |
| `dvi` | D5 | D6 |
| `communications` | D7 (ready notification), D9 | D2 (confirmations), D6 (send) |
| `retention` | D9 | D4 (language/channel), D8 |
| `inventory` | D10-inventory | D7 (parts on lines) |
| `reporting` | D10-reports | D3, D8 |
| `multi_location` | D10-organization | D11 |

**Step 3 — Apply the depth rule.** Every step gets one of four depths:

| Depth | Meaning | Typical time |
|---|---|---:|
| `FULL` | Complete card as in §5.4, owner clicks | 3–5 min |
| `COMPACT` | Only the single value moment (see each card's *Shortcut*) | 1–2 min |
| `MENTION` | One spoken sentence + the safe-alternative visual if useful | ≤ 30 s |
| `SKIP` | Not shown (record as `SKIPPED` with reason) | 0 |

Rules: a *primary* step is `FULL`; a *support* step is `COMPACT`; everything else is `MENTION` unless it is a **prerequisite** of a `FULL` step (then `COMPACT`); `D1`, `D2`-or-`D3` anchor, and `D11` are never skipped.

**Step 4 — Respect dependencies** (a step shown out of the base order needs its prerequisite in at least `COMPACT` so the data in the demo makes sense):

| Step | Needs earlier | Why |
|---|---|---|
| D5 inspection | D4 (a customer and vehicle exist) | The inspection is attached to a vehicle |
| D6 estimate/approval | D4; D5 optional | An estimate belongs to a customer and vehicle |
| D7 Work Order | D6 (accepted estimate) or a direct start | The normal path is estimate → Work Order; a Work Order can also be started directly |
| D8 invoice | D7 (Work Order → draft invoice) or D6 (Convert to invoice) | |
| D9 reminders | D4 (a vehicle) ; D8 for the "after the job" story | |
| D10 reports | D8 (paid invoices exist) — in a demo shop the reports are mostly empty; use the Garage Laurent capture 24 (`/demo`) rather than an empty page | Honest: do not present empty charts as results |

**Step 5 — Re-time to the available minutes** (§5.6). Cut `MENTION` first, then shrink `COMPACT`, then drop `D10`. Never cut D11.

**Step 6 — Re-open the same needs at the end.** D11 must play back the top three needs, in their words, against what they saw.

### 6.2 Selecting a variant

| Profile dimension (from §4.5) | → Variant |
|---|---|
| `software_state = PAPER` or `SPREADSHEET` | **P1** Paper / spreadsheet |
| `software_state = COMPETITOR` | **P2** Switching from software |
| top need `booking` (severity ≥ 2) | **P3** Phone bookings |
| top need `quotes_invoices` | **P4** Estimates and invoicing |
| top needs `communications`/`retention` | **P5** Communication and retention |
| `size_band = SOLO` | **P6** Owner-operated |
| `size_band ∈ {MID, LARGE}` | **P7** Larger multi-mechanic shop |
| `location_count ≥ 2` | **P8** Multi-location |

**Combining.** Choose the variant that matches the *highest-severity need* as the primary and borrow the *emphasis lines* of a second. A solo shop on paper with a phone problem = **P6 shell** + **P3 order** + **P1 reassurance** (e.g., open with D2, show the Excel import in D4, keep every screen to one value moment). If P8 applies, it is always the primary (a multi-location decision is an organisational one).

### 6.3 Variant P1 — Shops using paper or spreadsheets

- **Signals:** "It's all in a binder / in Excel / in my head." Low digital maturity. Worried about being overwhelmed.
- **Likely needs:** `quotes_invoices`, `work_orders`, `retention`; sometimes `booking`.
- **Core message:** *One place for each car's story, without learning accounting software.* Reassure first; features second.
- **Reordered run sheet (30 min):**

| Order | Step | Depth | Min | Why here |
|---:|---|---|---:|---|
| 1 | D1 Frame | FULL | 2 | Confirm the "binder" pain in their words |
| 2 | D4 Customer + vehicle | FULL | 4 | The binder/Excel replaced: search finds a car's history instantly; show **Import data** preview (nothing is saved until confirmed) |
| 3 | D6 Estimate + approval | FULL | 5 | Typed once, customer says yes on their phone |
| 4 | D8 Invoice + payment | FULL | 5 | Branded PDF, GST/QST handled, payment recorded |
| 5 | D7 Work Order | COMPACT | 2 | Status replaces shouting across the shop |
| 6 | D2 Booking | COMPACT | 3 | Optional modernisation, not required on day one |
| 7 | D9 Reminders | COMPACT | 3 | Basic reminders exist on every plan |
| 8 | D11 Plan fit | FULL | 5 | Recommend **Core** unless a verified need pulls to Pro; show the 14-day trial and Quick Start checklist |
| — | D3, D5, D10 | MENTION | 1 | |

- **Reassurance proof points (all verifiable):** import wizard with preview and downloadable error rows; the Quick Start checklist (`/quick-start`) lists setup in order; setup steps in the product are Business → Fiscal/logo → Services → Hours → Design → Plan; staff can start with a handful of customers and add as they go; the support/help area exists in the admin (`/admin/support`, *Aide*).
- **Bridge line — EN:** "You don't have to move your whole history on day one. Start with today's customers, put the next job in here, and bring the rest over with a spreadsheet when you're ready."
- **Bridge line — FR:** « Vous n'avez pas à tout déménager dès le premier jour. Commencez avec les clients d'aujourd'hui, mettez le prochain travail ici, et apportez le reste avec un chiffrier quand vous serez prêt. »
- **Avoid:** Don't show settings pages, template pickers or reports. Don't say it "digitises your paper history" — past invoices and Work Orders don't import (§2.3). Offer to keep the binder as the archive.
- **Plan lean:** Core if the team is ≤ 3 users and photos/automation aren't needed; Pro if inspection photos or automated reminders came up.
- **Success looks like:** The owner says the invoice or estimate "would take me half the time"; agrees to import a sample of 20–50 customers during the trial.

### 6.4 Variant P2 — Shops already using management software

- **Signals:** Names a product; "We're locked in until March"; "It works but it's clunky / expensive / support is slow."
- **Likely needs:** Whatever G3 (frustration) says; sometimes `communications`, `retention`, `reporting`.
- **Core message:** *Parity where it matters, difference where it hurts.* **Never criticise their current product.** Never compare to a named competitor's features, price or reliability — you have not verified them and the repository contains no competitor data.
- **Rules:**
  1. Ask G2 (what would you hate to lose?) **before** showing anything; build a **parity checklist** with the owner, marking each item *Yes*, *Partly*, *Not available* using §2.2/§2.3.
  2. Demonstrate the three things they dislike about their current tool, in the order of severity.
  3. Be explicit about migration limits (§2.3): customers, vehicles and inventory import; history does not.
  4. Surface contract timing (G4) and propose a **parallel run** inside the 14-day trial rather than a hard cut-over; the trial requires a payment method and starts billing after 14 days unless cancelled.
- **Reordered run sheet (30 min):**

| Order | Step | Depth | Min |
|---:|---|---|---:|
| 1 | D1 + parity checklist build | FULL | 4 |
| 2 | Top frustration #1 (the matching step) | FULL | 5 |
| 3 | Top frustration #2 | FULL | 4 |
| 4 | D6 → D7 → D8 as an end-to-end thread | COMPACT | 6 |
| 5 | D4 Import preview | FULL | 3 |
| 6 | D9 / D10 relevant support | COMPACT | 2 |
| 7 | D11 incl. switching plan | FULL | 6 |

- **Parity checklist template** (fill with the owner):

| They use today | GarageOS today | Say |
|---|---|---|
| Online booking | Yes — branded booking page, QR, embed | Show D2 |
| Estimates + customer approval | Yes | Show D6 |
| DVI with photos | Yes on Pro (basic on all) | D5; state plan |
| Work orders and status | Yes (simple status; no kanban board) | D7 |
| Card payments through the software | **No** — payments are recorded, not processed | D8; ask whether their terminal is a dependency |
| Parts catalogue / supplier ordering / labour guides | **Not available** (inventory exists; purchase orders and suppliers were removed from scope; no data-provider integrations in the repo) | Say so plainly |
| Accounting sync | QuickBooks Online on Pro (not provider-validated); Accounting Light exports | D8; caution |
| Time clock / payroll | **Not available** | |
| Text messaging with customers | Two-way SMS inbox with a GarageOS-provisioned number [LIMIT] | D9; no timeline promise |
| Data export | Reports CSV (Pro), invoices export, accountant exports (Pro) | Be accurate: check the exact export before promising a full data export |

- **Switching plan (offer, do not promise):** (1) export customers and vehicles to CSV/Excel from the current tool; (2) in trial, import them and check the preview; (3) run one or two jobs end to end in GarageOS while the old system stays in place; (4) decide before day 14; (5) cut over after their busiest week. Estimate the effort *with them*; do not quote hours.
- **Bridge line — EN:** "I won't pretend there's nothing good in what you have. Let's list what you'd hate to lose, and I'll tell you honestly which of those GarageOS does today and which it doesn't."
- **Bridge line — FR:** « Je ne prétendrai pas qu'il n'y a rien de bon dans ce que vous avez. Faisons la liste de ce que vous détesteriez perdre, et je vous dirai honnêtement ce que GarageOS fait aujourd'hui et ce qu'il ne fait pas. »
- **Avoid:** Disparaging, "everyone is leaving X", guessing their exit rights, advising on their contract, implying GarageOS can read their old system's database.
- **Success looks like:** A written parity list the owner agrees is accurate; a dated parallel-run trial that begins after their contract or busy period.

### 6.5 Variant P3 — Shops struggling with phone bookings

- **Signals:** Interrupted at the counter; missed calls; double-booked bays; late/no-shows; after-hours requests.
- **Primary needs:** `booking`, `communications`.
- **Reordered run sheet (≈28–30 min):** D1 (2) · **D2 FULL (6)** incl. QR on their own phone, embed code, hours/slot settings · **D3 FULL (4)** incl. front-desk **New appointment** speed and mechanic assignment · D4 COMPACT (2) search · D9 COMPACT (3) — *appointment reminders* (default 24 h before; configurable) and the customer **manage link** (confirm/cancel) · D7 COMPACT (2) ready notification (fewer "is it ready?" calls) · D6 COMPACT (3) · D8 MENTION · D11 (5).
- **Evidence to quote (only these):** online booking on every plan; slots respect hours, lead time (default 24 h), advance window (default 30 days), slot length (default 60 min) and mechanic availability; the booking page can be a QR/embed; confirmations by email (and SMS when a shop number exists); customers can confirm/cancel via link; double-booking is protected in the booking transaction.
- **Calls-per-day exercise (their numbers):** ask C3, then: *calls/day that are "do you have room…?" × minutes each × working days = interruption time per month.* Present as arithmetic on their numbers.
- **Bridge — EN:** "If the three calls an hour that are 'do you have room Thursday?' answered themselves, what would your front desk do with that time?"
- **Bridge — FR:** « Si les trois appels par heure du genre « avez-vous de la place jeudi? » se répondaient tout seuls, que ferait votre accueil avec ce temps? »
- **Avoid:** Don't promise fewer calls by a percentage. Don't claim deposits or prepayment. Don't claim WhatsApp, Google Calendar or Facebook integration.
- **Plan lean:** Core covers booking. Pro adds booking-page templates/typography, custom domain and sender identity — mention only if branding matters.

### 6.6 Variant P4 — Shops needing better invoicing and estimates

- **Signals:** Retyping; tax errors; disputes about what was approved; slow invoicing; accountant complaints; unpaid invoices.
- **Primary needs:** `quotes_invoices`, `reporting`.
- **Reordered run sheet (30 min):** D1 (2) · D4 COMPACT (2) · **D5 COMPACT (3)** findings → estimate · **D6 FULL (6)**: line-item suggestions (previously used descriptions autocomplete), taxes, send, customer **Accept quote**, status · D7 COMPACT (2) estimate → Work Order → **Convert to draft invoice** · **D8 FULL (7)**: PDF, GST/QST snapshot on the invoice, recording payment by method, mixed methods, refunds, **Cash drawer**, then (Pro) Accounting Light exports and Receivables aging in Reports · D10-reports (3) if `reporting` ≥ 2 · D11 (5).
- **Evidence to quote:** taxes are stored per invoice; invoices have atomic numbering; payments recorded by method; refunds with tax allocation; receivables aging and "oldest unpaid invoices" in full Reports (Pro); accountant exports and QuickBooks sync on Pro (QuickBooks sync not provider-validated).
- **Bridge — EN:** "If I told you the estimate you build is the same one that becomes the Work Order and the invoice, with the taxes already right, how much of your Friday paperwork disappears?"
- **Bridge — FR:** « Si la soumission que vous bâtissez est la même qui devient l'ordre de travail puis la facture, avec les taxes déjà correctes, combien de votre paperasse du vendredi disparaît? »
- **Avoid:** Don't say GarageOS is "tax compliant" or "certified"; say it calculates and stores GST/QST on each invoice and that the shop remains responsible for its filings with its accountant. Don't call it "accounting software" (it's Accounting Light; full accounting is out of scope).
- **Plan lean:** Core covers the document loop. Pro when exports, advanced reports, Accounting Light or QuickBooks matter.

### 6.7 Variant P5 — Shops with communication and retention problems

- **Signals:** "Customers call to ask if it's ready"; "I lose people after one visit"; no reminder system; language mismatches in messages.
- **Primary needs:** `communications`, `retention`.
- **Reordered run sheet (30 min):** D1 (2) · **D4 FULL (4)** language + notify channel + portal card · D2 COMPACT (3) confirmations · D6 COMPACT (3) send + customer view · **D7 FULL (4)** status → *Ready for pickup* notification and the toggles in Settings → Notifications · **D9 FULL (8)** reminders (manual → rules on Pro), campaigns segments, consent/unsubscribe, inbox · D8 COMPACT (2) · D11 (4).
- **Evidence to quote:** per-customer language and channel (Auto, SMS, Email, Both); automatic confirmation and change notices for appointments; "ready" notification once per Work Order; reminders (manual: Core; rule-based: Pro); campaigns are email only with unsubscribe link built in (Pro); STOP/START handling for SMS; every send's result is tracked and a failed SMS falls back to email for automatic notices (`docs/notifications.md`).
- **Honest caveats:** SMS requires a GarageOS-provisioned number and its availability timing is not promised; allowances are provisional (§2.2); shared-number SMS isn't validated; invoice/appointment/reminder email channels haven't been exercised with real recipients on Production yet — **do not stage a live send** (§5.2).
- **Bridge — EN:** "What if every car had its next service date attached, and the customer got a note in their language before it was due — without you remembering?"
- **Bridge — FR:** « Et si chaque voiture avait la date de son prochain entretien et que le client reçoive un message dans sa langue avant l'échéance — sans que vous ayez à y penser? »
- **Avoid:** No promised "return rate". No SMS marketing campaigns (campaigns are email). No assurance of CASL compliance (§D9).
- **Plan lean:** Core for confirmations, ready notice and manual reminders; Pro for automation, campaigns, custom sender/domain.

### 6.8 Variant P6 — Small owner-operated shops (1–3 people)

- **Signals:** "I'm the mechanic and the front desk"; paperwork at night; hates computers or wants speed.
- **Primary needs:** time, `quotes_invoices`, `booking`.
- **Core message:** *Ten minutes of paperwork becomes two; the phone stops owning your day.* Everything is described from the owner's seat — not "your team".
- **Reordered run sheet (25 min):** D1 (1) · D2 (4) booking page + QR — it works while he's under a car · D6 FULL (5) **on a phone-width window**: build and send an estimate; approval · D8 FULL (5) invoice → payment → PDF · D4 COMPACT (2) · D9 COMPACT (3) one reminder · D11 (5) show Core, the 3-user cap, and the trial.
- **Evidence:** the admin works in a phone browser (mobile drawer navigation exists; responsive design is part of the product's QA, but **do not claim a native app**); Core allows up to 3 users; setup is a short guided onboarding; Quick Start checklist.
- **Bridge — EN:** "Let's do one job from your phone, start to finish, the way you'd do it between cars."
- **Bridge — FR:** « Faisons un travail complet depuis votre téléphone, du début à la fin, comme vous le feriez entre deux voitures. »
- **Avoid:** Don't present reports, inventory, multi-location or roles. Don't overwhelm; one screen at a time. Don't suggest Pro just for revenue; recommend it only for a verified need (DVI photos, automatic reminders).
- **Success looks like:** The owner repeats the three-click flow himself; starts a trial the same day; the partner/spouse who does the books is invited to the next meeting.

### 6.9 Variant P7 — Larger shops with several mechanics

- **Signals:** 4+ staff; a service writer; handoffs between front desk and bays; wants accountability and visibility.
- **Primary needs:** `work_orders`, `dvi`, `reporting`, `inventory`, adoption.
- **Reordered run sheet (35 min):** D1 (2) · D3 FULL (3) multiple mechanics' appointments · **D5 FULL (4)** inspection by a mechanic role; templates; photos; customer report · D6 FULL (4) · **D7 FULL (5)**: assigned mechanic, status, parts from inventory auto-deducted; the front desk sees it without asking · D8 COMPACT (3) · **D10 FULL (6)**: Team (roles Owner/Mechanic/Viewer; seats; fine-grained permissions Pro), Inventory, Reports (jobs, approval rate, retention, receivables) · D9 COMPACT (3) · D11 (5) incl. adoption plan.
- **Evidence:** Pro: unlimited users and fine-grained permissions; Core is capped at 3 users — a shop with four or more staff is a Pro conversation by arithmetic; Work Order lines support parts from inventory with automatic stock movements and refusal to over-consume; Reports show jobs completed, average days to complete, quote approval rate, retention and top customers.
- **Adoption plan to propose (suggestions, not product promises):** appoint one champion; start with front desk + service writer; add mechanics to inspections in week 2; use the trial's 14 days to run the real workflow on a subset of vehicles; review reports at day 10.
- **Bridge — EN:** "When a car moves from the front desk to a bay and back, who sees what, and where does it get lost today?"
- **Bridge — FR:** « Quand une voiture passe de l'accueil à une baie et revient, qui voit quoi, et où ça se perd aujourd'hui? »
- **Avoid:** No time-clock, flat-rate/labour-guide, parts ordering or kanban-board claims (**[NO]**). No per-user pricing (none exists on Pro/Complete).
- **Plan lean:** Pro by default; Complete only when multi-location or its extras are a verified need (the Complete card lists standard migration included and white-glove onboarding — scope not defined in the repo; confirm).

### 6.10 Variant P8 — Multi-location businesses

- **Signals:** Two or more addresses; an expansion plan; an operations manager; a need to compare locations.
- **Primary needs:** `multi_location`, `reporting`, adoption at scale.
- **Reordered run sheet (≈33–35 min):** D1 (3) incl. who decides for all locations · D3 COMPACT (2) · D6/D7/D8 COMPACT thread (6) to prove the workflow in one location · **D10-organization FULL (10)**: Organization page, add a location, switch locations from the top bar, per-location access in Settings → Locations, each location's own customers/vehicles/appointments/Work Orders/invoices/inventory · **D10-reports FULL (6)**: Reports → *Locations* comparison (sales, jobs, new customers), consolidated vs per-location with permission respected · D11 (6) pilot proposal.
- **Critical honesty points:**
  - **Records are separated by location** — each location keeps its own customers, vehicles, appointments, Work Orders, invoices and inventory (`multi-location` guide). A customer who visits two locations is two records today. Say so; do not claim a shared customer database.
  - Multi-Shop requires **Complete**. Additional-location pricing is "confirmed with your plan"; the metering of a per-location charge in Stripe is **not wired yet** (`docs/subscription-plans.md`). **Do not quote or negotiate it; escalate to the administrator.**
  - Cross-location reporting and access follow each person's permissions.
  - Timeline: a phased rollout (pilot one location, then others) is a *suggestion*; the product has no tooling for bulk-onboarding multiple locations beyond adding each one and finishing its short setup (hours, services, booking).
- **Bridge — EN:** "Which location should be the pilot, and what would the group owner need to see to decide on the rest?"
- **Bridge — FR:** « Quel emplacement servirait de projet pilote, et que devrait voir le propriétaire du groupe pour décider pour les autres? »
- **Avoid:** Don't pitch consolidated customer history; don't compare to enterprise franchise systems; don't promise consolidated billing.
- **Plan:** Complete.

### 6.11 Quick-reference: emphasis matrix

| Step ↓ / Variant → | P1 Paper | P2 Switch | P3 Phone | P4 Docs | P5 Comms | P6 Solo | P7 Larger | P8 Multi |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| D2 Booking | C | var | **F** | M | C | **F** | M | M |
| D3 Day/agenda | M | var | **F** | M | M | M | **F** | C |
| D4 Customer/vehicle | **F** | C | C | C | **F** | C | M | M |
| D5 Inspection | M | var | M | C | M | M | **F** | M |
| D6 Estimate/approval | **F** | var | C | **F** | C | **F** | **F** | C |
| D7 Work Order | C | var | C | C | **F** | M | **F** | C |
| D8 Invoice/payment | **F** | var | M | **F** | C | **F** | C | C |
| D9 Follow-up | C | var | C | M | **F** | C | C | M |
| D10 Business tools | M | var | M | C(reports) | M | M | **F** | **F** |

F = FULL · C = COMPACT · M = MENTION · var = ordered by the owner's top two frustrations.

---

## 7. Objection handling

**Method — ACRC.** (1) **Acknowledge** the concern without arguing. (2) **Clarify** what's behind it with one question. (3) **Respond** with a verified fact and, if possible, a thing to show. (4) **Confirm** that it answered the concern before moving on. Most objections are a request for safety, not a "no".

**Rules for every objection:** use only §2 facts; say "not available today" when it isn't; never invent a discount, guarantee, case study or customer; if the answer needs a decision you cannot make, write it down and escalate (§16.3).

Each entry gives: **Real concern · Clarify · Response (EN/FR) · Show · Do not say**.

### 7.1 Price — "It's too expensive."

- **Real concern:** value not yet proven; budget anxiety; comparison with a cheaper or free tool; fear of paying while learning.
- **Clarify:** "Too expensive compared to what — what you spend now, or what you expected?" / « Trop cher par rapport à quoi — ce que vous payez maintenant, ou ce à quoi vous vous attendiez? »
- **Response — EN:** "That's fair, and I'd rather you decide on numbers than on a feeling. Core is $199 a month, Pro $299, Complete $449, plus taxes — and the trial lets you test the real thing for 14 days, with $0 today, before the first charge. Let's use your own figures: you told me [calls/invoicing time/lapsed customers]. If GarageOS gave you back [hours or jobs, using *their* number], what's that worth to you each month? If it doesn't add up, I'll be the first to tell you it's not a fit."
- **Response — FR:** « C'est légitime, et je préfère que vous décidiez avec des chiffres plutôt qu'avec une impression. Core coûte 199 $ par mois, Pro 299 $ et Complete 449 $, plus les taxes — et l'essai vous permet de tester le vrai produit 14 jours, avec 0 $ aujourd'hui, avant le premier prélèvement. Utilisons vos propres chiffres : vous m'avez dit [appels/temps de facturation/clients inactifs]. Si GarageOS vous redonnait [heures ou travaux, avec *leur* chiffre], ça vaut combien par mois pour vous? Si ça ne s'additionne pas, je serai le premier à vous dire que ce n'est pas pour vous. »
- **Show:** The §4.9 worksheet filled with their numbers; the plan table in §2.2; annual option (10 months for 12; "2 mois gratuits").
- **Plan options (honest):** If the price is a stretch and the verified needs fit Core (≤ 3 users, no DVI photos/automation/inventory/tire storage/advanced reports needed), Core is the right answer, say so. Never push Pro for margin.
- **Do not say:** "It pays for itself" or any % improvement; "I can give you a discount" (no discount program exists in the repository — if the administrator has authorised one, it must be given to you in writing); "competitor X charges more/less" (unverified); "the first month is free" (the trial is 14 days with a payment method, billed afterwards).

### 7.2 Existing software — "I already have a system."

- **Real concern:** switching cost, sunk cost, fear of losing history, contract.
- **Clarify:** "What does it do well? What would you hate to lose?" (G2) then "What do you wish it did?" (G3).
- **Response — EN:** "Keep what's working — don't switch for the sake of switching. If there are two or three things it doesn't do for you, I'd like to show you those and nothing else, so you can compare honestly. And if you're in a contract, we'd plan around it — nothing says you have to move before it ends."
- **Response — FR:** « Gardez ce qui fonctionne — inutile de changer pour changer. S'il y a deux ou trois choses que votre système ne fait pas pour vous, j'aimerais vous montrer celles-là et rien d'autre, pour que vous compariez honnêtement. Et si vous avez un contrat, on planifie en fonction de lui — rien ne vous oblige à changer avant son échéance. »
- **Show:** Parity checklist (§6.4). The three frustrations only.
- **Do not say:** Anything about the competitor's quality, price or business health; "we import everything from [named product]" (**[NO]**); "your contract can't be enforced".
- **Escalate:** If they ask for a formal comparison document — do not create one from memory; escalate.

### 7.3 Migration effort — "Moving everything sounds like a nightmare."

- **Real concern:** time, data loss, downtime, being stuck half-way.
- **Clarify:** "What would you have to move for it to feel safe — customers, cars, parts, old invoices?" / « Que faudrait-il déménager pour que ce soit sécurisant — clients, voitures, pièces, anciennes factures? »
- **Response — EN:** "You don't need to move your history to start. GarageOS imports your customers and vehicles from a CSV or Excel file — with a preview before anything is saved and a list of any problem rows — and, on Pro, your parts inventory. What it doesn't import is past invoices, estimates and Work Orders, so keep the old system or its PDFs as the archive. The way I'd suggest is: import your customer list, run the next real job in GarageOS, keep the old system open for reference, and decide within the trial. If you've already seen the demo shop, your name, logo, services and hours are already set up and carry over."
- **Response — FR:** « Vous n'avez pas besoin de déménager votre historique pour commencer. GarageOS importe vos clients et vos véhicules à partir d'un fichier CSV ou Excel — avec un aperçu avant l'enregistrement et la liste des lignes à corriger — et, avec Pro, votre inventaire de pièces. Ce qui n'est pas importé, ce sont les anciennes factures, soumissions et ordres de travail; gardez l'ancien système ou ses PDF comme archives. Voici ce que je suggère : importez votre liste de clients, faites le prochain vrai travail dans GarageOS, gardez l'ancien système ouvert pour référence, et décidez pendant l'essai. Si vous avez déjà vu l'atelier de démo, votre nom, votre logo, vos services et vos heures sont déjà configurés et sont conservés. »
- **Show:** `/admin/import` wizard with a 10-row sample file (prepared in advance, no real data); the 500 / 10,000 row limits; error-row download.
- **Verify before promising:** limits — Core: customers + vehicles, ≤ 500 rows per file; Pro/Complete: also inventory, ≤ 10,000 rows per file, duplicate "update". Assisted onboarding (Pro/Complete) and standard migration (Complete) exist as public plan lines but their scope is not defined in the repository — say "included in the plan; I'll confirm exactly what it covers in writing" and escalate.
- **Do not say:** "We'll migrate everything for you" or a duration; "no downtime" (nothing is promised about the other system); "no data loss" (promise only the preview and validation that exist).

### 7.4 Employee adoption — "My guys won't use it."

- **Real concern:** past failures; fear of slowing the shop; technicians' comfort; owner doesn't want to be the enforcer.
- **Clarify:** "Who specifically worries you, and what did they struggle with last time?" (H1, H4)
- **Response — EN:** "That's the most common reason software fails in a shop, so let's design around it. In GarageOS the front desk or service writer can do most of the typing — estimates, Work Orders, invoices — and the technician's part can stay simple: look at the assigned job, update the status, and — if you want — record inspection findings. People get their own login, with access matched to their job, and Pro has no user limit. Start with the front desk, add the bays in week two, and use the trial to find out what sticks."
- **Response — FR:** « C'est la principale raison pour laquelle les logiciels échouent dans un atelier, alors concevons autour de ça. Dans GarageOS, l'accueil ou le chef de service peut faire la plupart de la saisie — soumissions, ordres de travail, factures — et la part du technicien peut rester simple : consulter le travail assigné, mettre à jour le statut et, si vous le souhaitez, consigner les constats d'inspection. Chacun a son propre accès, adapté à son rôle, et Pro n'a aucune limite d'utilisateurs. Commencez par l'accueil, ajoutez les baies à la deuxième semaine, et servez-vous de l'essai pour voir ce qui prend. »
- **Show:** Settings → **Team** tab: roles (Owner, Mechanic, Viewer), seat limit; the Work Order status control; the phone-width view of a Work Order.
- **Facts:** Core up to 3 users, Pro/Complete unlimited; fine-grained permissions on Pro; MECHANIC/VIEWER differentiation was still listed as "partial" in `docs/feature-gap.md` — **do not claim a precise permission matrix you haven't verified in the Team screen**.
- **Do not say:** "Takes 5 minutes to learn", "technicians love it" (no customers yet), "we provide on-site training" (not documented).

### 7.5 Lack of time — "I don't have time for this."

- **Real concern:** survival mode; the cost of change in a busy season; decision fatigue.
- **Clarify:** "What's the busiest part of your year? When would a start actually be realistic?" / « Quelle est la période la plus chargée de votre année? Quand un démarrage serait-il réaliste? »
- **Response — EN:** "I hear you — and that's a reason to do the setup once, properly, not to avoid it. I've already set up your name, logo, services and hours in the demo, and if you go ahead, that carries over, so most of the work is done. The sign-up is a couple of minutes, plus a short guided setup. If this is your busy season, we can agree a start date after it and I'll check in then — no pressure."
- **Response — FR:** « Je comprends — et c'est une raison de faire la configuration une fois, bien, plutôt que de l'éviter. J'ai déjà préparé votre nom, votre logo, vos services et vos heures dans la démo, et si vous allez de l'avant, tout est conservé, donc l'essentiel est fait. L'inscription prend quelques minutes, suivie d'une courte configuration guidée. Si c'est votre haute saison, on peut convenir d'une date de départ après, et je vous rappelle à ce moment-là — sans pression. »
- **Show:** `/get-started` steps ("2 minutes", "2 minutes", "A few minutes"); Quick Start checklist; the already-prepared shop.
- **Do not say:** "It takes no time", "setup in an hour" (no measured figure exists); don't push a start inside their rush.
- **Next step:** Book the start date and a short check-in; record `timing` as the loss reason only if they decline.

### 7.6 Customer booking preferences — "My customers just call."

- **Real concern:** doubts about customer behaviour; fear of losing the personal touch.
- **Clarify:** "Do any customers ask to book after hours, by text or on weekends? Who is online, who isn't?" (C5, C6)
- **Response — EN:** "Totally — the phone isn't going away, and it shouldn't. This doesn't replace it. Customers who like to call still call, and your front desk books them in the same agenda in about a minute. The booking page is for the ones who'd rather not call, or can't during your hours. You can try it quietly: share the QR at the counter and see who uses it."
- **Response — FR:** « Tout à fait — le téléphone ne disparaît pas, et il ne devrait pas. Ça ne le remplace pas. Les clients qui aiment appeler continuent d'appeler, et votre accueil les inscrit dans le même agenda en environ une minute. La page de réservation s'adresse à ceux qui préfèrent ne pas appeler, ou qui ne peuvent pas pendant vos heures. Vous pouvez l'essayer discrètement : mettez le code QR au comptoir et voyez qui l'utilise. »
- **Show:** D2/D3: the same agenda receiving both a web booking and a manual one; QR; embed snippet.
- **Do not say:** "Most customers prefer online booking"; a percentage of online bookings; "customers will book more".

### 7.7 Security and reliability — "Is my data safe? What if it goes down?"

- **Real concern:** customer data, business continuity, accountability, privacy law.
- **Clarify:** "Is it a specific worry — someone leaving with data, a breach, the system being down during the day, or where it's stored?"
- **Response — EN:** "Good question to ask any vendor. Here's what I can tell you accurately. Each shop's data is separated from other shops', and we run automated tests that try to read one shop's data from another. People have their own logins with roles, and the links we send customers — estimates, inspection reports, the portal — are private, expire, and can be revoked. Your subscription card is handled by Stripe; GarageOS doesn't see your card number. What I can't give you from memory is a formal uptime promise or a backup statement; I'll send you our current written answer — including where the data is hosted and who our service providers are — from our privacy policy and provider list."
- **Response — FR:** « C'est une bonne question à poser à tout fournisseur. Voici ce que je peux vous dire avec exactitude. Les données de chaque atelier sont séparées de celles des autres, et nous exécutons des tests automatisés qui tentent d'accéder aux données d'un atelier à partir d'un autre. Chaque personne a son propre accès avec un rôle, et les liens envoyés aux clients — soumissions, rapports d'inspection, portail — sont privés, expirent et peuvent être révoqués. La carte de votre abonnement est traitée par Stripe; GarageOS ne voit pas votre numéro de carte. Ce que je ne peux pas vous donner de mémoire, c'est un engagement formel de disponibilité ou un énoncé sur les sauvegardes; je vous enverrai notre réponse écrite à jour — y compris l'endroit où les données sont hébergées et la liste de nos fournisseurs — à partir de notre politique de confidentialité. »
- **Show:** Privacy Policy and Terms (public pages `/privacy`, `/terms`); Settings → Team (roles); Billing portal handoff to Stripe.
- **Verified facts you may use:** tenant-isolation test suites exist (`docs/launch-readiness.md`: 129 cross-tenant attack cases in the integration suite on a Preview database); customer-facing links are tokenised and expire (portal links expire after 30 days and can be revoked; estimate approval tokens expire); the subscription is billed through Stripe's hosted Checkout/Billing Portal; Stripe webhooks are signature-verified; restricted mode keeps read access and exports available.
- **Must not claim:** data residency in Canada (hosting and key providers are in the USA — `docs/compliance/subprocessors.md`; the Privacy Policy says data may be processed outside Québec/Canada); two-factor authentication (none); a specific uptime/SLA; specific backup retention or recovery times (the repository's backup status is in flux — escalate); "bank-level security", "military-grade", "SOC 2/ISO certified" (no such evidence); "Law 25 compliant" (a legal conclusion).
- **Escalate:** Any written security/privacy questionnaire; any request about data location, retention, deletion, breach history or subprocessors → the privacy officer/administrator, with a promised reply date.

### 7.8 SMS and email concerns — "I don't want to spam my customers" / "Will my texts and emails actually arrive?"

- **Real concern:** customer annoyance; legal exposure; deliverability; cost; who owns the number.
- **Clarify:** "Is it the legal side, the cost, or the customer experience?"
- **Response — EN:** "Two different things. Service messages — appointment confirmations, an estimate to approve, 'your car is ready', an invoice — are tied to a job the customer already has with you. Marketing is separate: campaigns go by email only, to customers who have consented, with an unsubscribe link built in. If a customer texts STOP, we stop texting that number, and they can opt back in with START. You choose per customer whether they hear by text, email or both, and you can turn the 'ready' notice off. On cost, SMS has a monthly allowance by plan, and I'll give you the exact current figures in writing. One honest limit: texting needs a dedicated number that GarageOS sets up for your shop, and I can't give you a date for that today."
- **Response — FR:** « Ce sont deux choses différentes. Les messages de service — confirmation de rendez-vous, soumission à approuver, « votre voiture est prête », facture — sont liés à un travail que le client a déjà avec vous. Le marketing est distinct : les campagnes partent par courriel seulement, aux clients qui ont consenti, avec un lien de désabonnement intégré. Si un client répond STOP par texto, nous cessons d'écrire à ce numéro, et il peut se réabonner avec START. Vous choisissez, client par client, s'il est joint par texto, par courriel ou les deux, et vous pouvez désactiver l'avis « prêt ». Pour le coût, les SMS ont une allocation mensuelle selon le forfait, et je vous donnerai les chiffres exacts à jour par écrit. Une limite honnête : les textos exigent un numéro dédié que GarageOS met en place pour votre atelier, et je ne peux pas vous donner de date aujourd'hui. »
- **Show:** Customer card (language + notify channel); Settings → Notifications tab (ready toggles, reminder settings); Campaigns new-campaign form (audience, consent note, unsubscribe); `messages.json` strings for SMS examples (Garage Laurent).
- **Verified facts:** STOP/ARRET/START/HELP/AIDE handling (`docs/notifications.md`); STOP blocks sends server-side before the provider call (Production-validated on a dedicated number, 2026-10-01); a failed automatic SMS falls back to email; campaigns are email with automatic unsubscribe; SMS allowance per plan is provisional (Core 300 / Pro 1,000 / Complete 2,500 segments per month; overage $0.05 CAD per segment) — **confirm before quoting a figure**; the shop's staff alert emails are separate.
- **Must not claim:** "CASL compliant", "guaranteed delivery", "your emails won't go to spam", a number-provisioning date, SMS campaigns, WhatsApp. For CASL questions: "The product includes the consent and unsubscribe controls; whether a particular message is a commercial electronic message depends on its purpose, and your lawyer or the CRTC guidance is the right authority."
- **Escalate:** Anything about consent evidence, importing a list for marketing, or transactional vs promotional classification.

### 7.9 Contract and subscription — "What am I locked into?"

- **Real concern:** commitment length, cancellation, price changes, what happens to the data.
- **Clarify:** "Are you worried about being stuck, or about what happens if you stop?"
- **Response — EN:** "Fair. Monthly plans renew monthly; annual plans are billed upfront for the year, at ten months' price for twelve. You can cancel in Settings → Billing, and cancellation normally takes effect at the end of the period you've paid. The trial: you add a payment method, pay $0 today, and we show you the exact date and amount of the first charge before you start. If you cancel before that date you aren't charged. Our Terms say amounts already paid are non-refundable except where the law requires, so I'd start monthly and move to annual once you're sure. And before access ends, export what you need — the Terms recommend it."
- **Response — FR:** « C'est juste. Les forfaits mensuels se renouvellent chaque mois; les forfaits annuels sont facturés d'avance pour l'année, au prix de dix mois pour douze. Vous pouvez annuler dans Configuration → Facturation, et l'annulation prend normalement effet à la fin de la période payée. L'essai : vous ajoutez un mode de paiement, vous payez 0 $ aujourd'hui, et nous vous montrons la date et le montant exacts du premier prélèvement avant le début. Si vous annulez avant cette date, vous n'êtes pas facturé. Nos conditions précisent que les sommes déjà payées ne sont pas remboursables sauf si la loi l'exige, alors je commencerais au mois et je passerais à l'annuel quand vous serez sûr. Et avant la fin de l'accès, exportez ce dont vous avez besoin — les conditions le recommandent. »
- **Show:** `/pricing` (annual note), `/terms` (sections "Plans, trial and billing", "Failed payments, restriction and cancellation", "Termination and data"), Settings → Billing (Stripe portal, cancel).
- **Verified facts:** `src/app/terms/page.tsx`; there is **no free tier** after expiry; a failed payment keeps access for 48 hours then restricts (reads/billing/exports stay); a shop that has had a trial won't get another; plan changes with a live subscription go through the Stripe customer portal.
- **Do not say:** "no contract" or "cancel anytime, full refund"; any price-lock or discount; any promise about future price changes.

### 7.10 "I need to think about it / talk to my partner."

- **Clarify:** "Of course — what would you want to be sure about? Is it the money, the switch, or whether the team will use it?"
- **Response — EN:** "Makes sense. So I'm useful rather than a nuisance: what are the one or two questions you'd want answered before you decide? I'll send you a short summary of what we covered and the plan I'd recommend, and — if it helps — a 20-minute session with your partner. Can we pencil in [date] to hear where you landed?"
- **Response — FR:** « Tout à fait. Pour que je sois utile et non dérangeant : quelles sont les une ou deux questions auxquelles vous voudriez une réponse avant de décider? Je vous enverrai un court résumé de ce qu'on a vu et du forfait que je recommande, et — si ça aide — une rencontre de 20 minutes avec votre associé. Peut-on réserver le [date] pour savoir où vous en êtes? »
- **Rule:** Never leave without a dated next step or an explicit "no". See §8.5.

### 7.11 "Another product has feature X / is cheaper."

- **Response — EN:** "I can't speak to their product, and I don't want to guess. Tell me what you need from feature X and I'll show you whether GarageOS does it today — and tell you plainly if it doesn't."
- **Response — FR:** « Je ne peux pas parler de leur produit et je ne veux pas deviner. Dites-moi ce dont vous avez besoin de la fonction X, et je vous montrerai si GarageOS le fait aujourd'hui — et je vous dirai franchement si ce n'est pas le cas. »
- **Rule:** The parity checklist (§6.4) is the only comparison tool.

### 7.12 Objection log (for coaching and for the CRM)

For each objection raised: `objectionId` (§14.5), step in which it occurred, intensity (0–3), resolved Y/N, evidence shown, follow-up needed. Patterns across reps (e.g., "migration" recurring in D4) feed content updates (§14.7).

---

## 8. Closing and follow-up

### 8.1 Principles

- Close on **their stated criteria**, not on urgency tricks. No fake deadlines, no "limited offer", no invented scarcity.
- One ask at a time, in a ladder: *agree it fits → agree a plan → agree a date → agree who does what*.
- The product's own flow is the close: **prepare → demo → Convert to customer → owner activation → Stripe → Won (Stripe-confirmed)**. Sales never takes a card or sets a password.
- A "no" or "not now" with a reason is a successful call. Record the reason.

### 8.2 Closing during the demo

**Trial close (during D8–D9)** — EN: "On what you've seen so far, is this closer to what you're looking for, or are we missing something?" · FR: « D'après ce que vous avez vu jusqu'ici, est-ce plus proche de ce que vous cherchez, ou est-ce qu'il nous manque quelque chose? »

**Soft close (D11)** — EN: "Based on what matters to you, I'd put you on [plan]. Would you like to try it for 14 days with your own shop?" · FR: « D'après ce qui compte pour vous, je vous placerais sur [forfait]. Voulez-vous l'essayer pendant 14 jours avec votre propre atelier? »

**Alternative close (plan/interval)** — EN: "Would you rather start monthly while you get comfortable, or annual and get the two months free?" · FR: « Préférez-vous commencer au mois, le temps de vous sentir à l'aise, ou à l'année pour obtenir les deux mois gratuits? »

**Direct close with activation** — EN: "If you're happy with that, I can send your activation link right now. You'll choose your own password, then add your payment method on a secure Stripe page — I never see your card or your password — and your shop opens exactly as we just saw it. Shall I send it? What's the best email for you as owner?" · FR: « Si ça vous convient, je peux vous envoyer le lien d'activation tout de suite. Vous choisirez votre propre mot de passe, puis vous ajouterez votre mode de paiement sur une page Stripe sécurisée — je ne vois jamais votre carte ni votre mot de passe — et votre atelier s'ouvre exactement comme on vient de le voir. Je l'envoie? Quelle est la meilleure adresse courriel pour vous, comme propriétaire? »

**Partner close** — EN: "Who else should see this before you decide? Let's book 20 minutes with them and I'll focus on what they care about." · FR: « Qui d'autre devrait voir ça avant que vous décidiez? Réservons 20 minutes avec cette personne et je me concentrerai sur ce qui l'intéresse. »

**Self-serve close** — EN: "If you'd rather set it up yourself, start the trial at [garageos site]/get-started. I'll check in after two days to see how it's going — and your demo shop stays here until it expires." · FR: « Si vous préférez le configurer vous-même, démarrez l'essai à [site GarageOS]/get-started. Je vous reviens dans deux jours pour voir comment ça se passe — et votre atelier de démo reste ici jusqu'à son expiration. »

*Note: the self-serve route creates a **new** shop, not the prepared demo shop. If the owner wants to keep the prepared setup, use Convert to customer.*

### 8.3 Sending the owner activation

**Pre-send checklist (read it with the owner)**

| ✔ | Check |
|:-:|---|
| ☐ | Owner name and email spelled out and confirmed aloud — the activation is bound to this email. A different email creates a different (or conflicting) account. |
| ☐ | The owner's language (the activation email is localised in English or French). |
| ☐ | Final plan (Core / Pro / Complete) and Monthly / Annual match what was agreed. The form defaults to the demo's current viewing plan; **change it if the sold plan differs**. |
| ☐ | Sample/synthetic data decision: the form asks whether to keep the marked scenario records. Delete or flag any sample records you created manually (§5.2) — they are live data and will remain. |
| ☐ | Real prospect-entered data is not accidentally lost (conversion keeps live records). |
| ☐ | Expectations set: the link is single-use and valid for 24 hours (or until the demo expires). |
| ☐ | The owner knows to look in spam/promotions, and that the email is titled "Your GarageOS is ready" / « Votre GarageOS est prêt ». |

**Where:** amber bar → **Convert to customer** (`/admin/demo/convert`) or `/platform/sales/[id]/convert`. Fields: Owner name · Owner email · Final plan · Billing (Monthly / Annual · 10 months for 12) · retain-scenario option → **Send activation link**. The status becomes *Activation sent* (*Activation envoyée*).

**Say — EN:** "I've sent it. You'll get an email titled 'Your GarageOS is ready'. Click **Activate my GarageOS account**, choose your password, then you'll land on a page that says 'You're almost done' with [plan, interval] preselected. Enter your card on Stripe's secure page — you'll see the exact date and amount of the first charge, and today is $0 if you're eligible for the trial. Then you'll see your shop exactly as we just saw it. Can we stay on the line until it arrives?"

**Say — FR:** « C'est envoyé. Vous recevrez un courriel intitulé « Votre GarageOS est prêt ». Cliquez sur **Activer mon compte GarageOS**, choisissez votre mot de passe, puis vous arriverez sur une page « Vous y êtes presque » avec [forfait, fréquence] présélectionnés. Entrez votre carte sur la page sécurisée de Stripe — vous verrez la date et le montant exacts du premier prélèvement, et aujourd'hui c'est 0 $ si vous êtes admissible à l'essai. Ensuite vous verrez votre atelier exactement comme on vient de le voir. Pouvons-nous rester en ligne jusqu'à ce qu'il arrive? »

**Troubleshooting (verified behaviours)**

| Situation | What to do |
|---|---|
| Email not received | Check spam and the address typed; wait, then **Resend activation**. A one-minute cooldown applies; changing details during the cooldown is refused. Resending replaces the hash and **invalidates the older link**. |
| "Invalid, expired, replaced or already used" | Resend (new link). If the owner already activated, they sign in to finish payment. |
| Owner email already has an account | Same shop's OWNER: they sign in and accept. An account in **another** shop, a SUPER_ADMIN, a MECHANIC or a VIEWER is never promoted or moved — use a different email. |
| Checkout not completed | The status stays *Awaiting payment* (*En attente de paiement*). The owner can resume from the dashboard/activation-payment page; use "Check payment" if the confirmation seems delayed. Never mark as won yourself. |
| Trial/amount surprise | Show the Stripe page's first-charge line; remind them: trial only if eligible; prior trials don't repeat. |
| Link expiry vs. demo expiry | The link expires within 24 h; the demo lasts 30 days; an already-activated owner can still pay after demo expiry. |

**Won rule:** the opportunity is **Won only when Stripe confirms** an accepted plan with TRIALING or ACTIVE status. A sent link, an opened link or a Checkout screen is **not** Won.

### 8.4 Follow-up after an interested demo

**Cadence (suggested):** same day (within 2 hours) recap → +2 business days check-in → +5 business days decision call → then stop and move to §8.5/§8.6. Every touch adds something new (an answer, a clarified fact, a booked time), not "just checking in".

**Same-day recap email — EN** (send only to people who attended or asked; keep it short; no attachments with sensitive data):

> Subject: Your GarageOS demo — what we covered and what's next
>
> Hi [Name],
> Thanks for the time today. Here's the short version.
> **What you told me matters most:** (1) [need 1], (2) [need 2], (3) [need 3].
> **What you saw:** [one line per need, e.g., "estimates your customers accept on their phone, with the decision recorded"].
> **What I'd recommend:** [plan] — because [specific reason]. It's $[price] CAD per month plus taxes. You can start with a 14-day trial: add a payment method, pay $0 today, and see the exact date and amount of the first charge before it begins.
> **Things I'm confirming for you:** [open items, e.g., "SMS number set-up timing", "scope of assisted onboarding"] — I'll come back by [date].
> **Next step:** [agreed next step, date and time].
> Reply with any question, or tell me if this isn't the right fit — I'll respect that.
> [Rep], GarageOS · [phone] · [address and unsubscribe/contact details as required by Agent 2's templates]

**Same-day recap email — FR:**

> Objet : Votre démo GarageOS — ce qu'on a vu et la suite
>
> Bonjour [Nom],
> Merci du temps accordé aujourd'hui. Voici l'essentiel.
> **Ce qui compte le plus pour vous :** (1) [besoin 1], (2) [besoin 2], (3) [besoin 3].
> **Ce que vous avez vu :** [une ligne par besoin, p. ex. « des soumissions que vos clients acceptent sur leur téléphone, avec la décision consignée »].
> **Ce que je recommande :** [forfait] — parce que [raison précise]. C'est [prix] $ CAD par mois plus les taxes. Vous pouvez commencer par un essai de 14 jours : vous ajoutez un mode de paiement, vous payez 0 $ aujourd'hui, et vous voyez la date et le montant exacts du premier prélèvement avant le début.
> **Points que je vérifie pour vous :** [éléments en suspens, p. ex. « délai de mise en place du numéro de texto », « portée de l'accompagnement au démarrage »] — je reviens vers vous d'ici le [date].
> **Prochaine étape :** [étape convenue, date et heure].
> Répondez-moi pour toute question, ou dites-moi si ce n'est pas le bon choix — je le respecterai.
> [Représentant], GarageOS · [téléphone] · [adresse et coordonnées/désabonnement requis par les modèles de l'Agent 2]

**+2 days — call script**

> **EN:** "Hi [Name], it's [Rep] from GarageOS. I promised to come back on [open item] — here's the answer: [answer]. Did you get a chance to think about [their stated criterion]? What's still open for you?"
> **FR:** « Bonjour [Nom], c'est [Représentant] de GarageOS. Je vous avais promis de revenir sur [point en suspens] — voici la réponse : [réponse]. Avez-vous eu le temps de réfléchir à [critère mentionné]? Qu'est-ce qui reste en suspens pour vous? »

**Voicemail (≤ 20 s)**

> **EN:** "Hi [Name], [Rep] at GarageOS. I have the answer to the [open item] question you asked. Call me at [number], or I'll try you again [day]. Thanks."
> **FR:** « Bonjour [Nom], [Représentant] de GarageOS. J'ai la réponse à votre question sur [point en suspens]. Rappelez-moi au [numéro], ou j'essaierai de vous joindre le [jour]. Merci. »

**+5 days — decision call**

> **EN:** "I want to respect your time, so let me ask directly: where does this stand — are you going ahead, do you need something else from me, or is it better to leave it for now?"
> **FR:** « Je veux respecter votre temps, alors je vous pose la question directement : où en êtes-vous — allez-vous de l'avant, avez-vous besoin d'autre chose de ma part, ou vaut-il mieux laisser ça de côté pour l'instant? »

### 8.5 Handling undecided prospects

| Underlying cause | Diagnose | Move |
|---|---|---|
| Money | "If price weren't a factor, would this be right?" | Re-run §4.9 with their numbers; Core vs Pro honesty; monthly first; defer start to when cash is easier |
| Partner / bookkeeper | "What does [Name] care about most?" | Book the 20-minute session; send them the recap; prepare their view (accounting → D8/Accounting) |
| Switch fear | "What's the worst thing that could happen in the first two weeks?" | Parallel-run plan (§6.4); import sample; keep the old system |
| Timing | "When is the right time?" | Agree a date after the peak; schedule the check-in; set the trigger |
| Feature gap | "Is that a must-have or a nice-to-have?" | Be honest (**[NO]** list); if must-have → respectful disqualification (§8.7) |
| Unknown | "What would you need to see to decide?" | Offer the smallest next step: second demo of one area; sample import; talk to your accountant |

**Script — EN:** "It sounds like [cause]. I don't want to push you into something that isn't right, and I don't want to disappear either. What if we agree on one specific thing — [action] — and one date — [date] — to decide? If it's a no, that's a fine answer."
**Script — FR:** « On dirait que c'est [cause]. Je ne veux pas vous pousser vers quelque chose qui ne convient pas, ni disparaître non plus. Et si on s'entendait sur une chose précise — [action] — et une date — [date] — pour décider? Si c'est non, c'est une très bonne réponse. »

**Rules:** at most three follow-ups without a reply (the third is the §8.7 "closing the loop" message); every touch adds value; log each with outcome; if the prospect asks to stop, stop and record do-not-contact.

### 8.6 Re-engaging a prospect later

**Triggers (use at most one per touch, and only if true):** their stated renewal date or busy-season end; a change you verified (e.g., a feature that is now implemented and visible in the product — check `/changelog`, not memory); a seasonal moment (pre-tire-season, start of the new year); a conversation they asked to resume.

**Rules:** wait the interval you agreed; no more than one re-engagement per trigger; if the original demo shop has expired (30 days), prepare a new one only when they re-engage; do not message anyone on a do-not-contact list; commercial emails require a lawful basis and identification/unsubscribe (Agent 2 templates, `docs/compliance/casl-matrix.md`). For calls, honour internal do-not-call records.

**Script — EN (call or message):** "Hi [Name], it's [Rep] from GarageOS. When we spoke in [month], you said [the specific reason and timing, e.g., 'revisit after tire season']. It's that time, so I wanted to ask if it still makes sense to take another look. If not, no problem — tell me and I'll close the loop."
**Script — FR :** « Bonjour [Nom], c'est [Représentant] de GarageOS. Quand on s'est parlé en [mois], vous m'aviez dit [la raison précise et le moment, p. ex. « reparlons-en après la saison des pneus »]. C'est le moment, alors je voulais voir si ça a encore du sens de regarder à nouveau. Sinon, aucun problème — dites-le-moi et je ferme le dossier. »

**What has changed (only if verified) — EN:** "Since we spoke, [verified change, e.g., 'the inspection report can now be shared with customers on Pro']. I thought of the [need] you raised." · **FR :** « Depuis notre conversation, [changement vérifié, p. ex. « le rapport d'inspection peut maintenant être partagé avec les clients avec Pro »]. J'ai pensé au besoin de [besoin] que vous aviez soulevé. »

### 8.7 Respectful disqualification

**When:** the prospect states a hard requirement that is **[NO]** (e.g., built-in card processing, full history migration, public API); the shop is outside the target (not an independent repair shop; fleet/enterprise needs not supported); the timing/budget will not change; they say no; repeated no-shows; the contact asks not to be contacted.

**Script — EN (fit):** "I appreciate your honesty. From what you've told me, you need [requirement], and GarageOS doesn't do that today. I'd rather say that now than sell you something that frustrates you. If it changes — and only if it actually does — may I let you know? Either way, thank you for the time, and I wish you a good season."
**Script — FR (fit) :** « Je vous remercie de votre franchise. D'après ce que vous m'avez dit, vous avez besoin de [exigence], et GarageOS ne le fait pas aujourd'hui. Je préfère vous le dire maintenant plutôt que de vous vendre quelque chose qui vous décevra. Si cela change — et seulement si c'est vraiment le cas — puis-je vous en informer? Dans tous les cas, merci pour votre temps, et bonne saison. »

**Script — EN (declined):** "Understood. Thanks for being straightforward. I'll close this on my side. If anything changes, you know where to find me."
**Script — FR (refus) :** « C'est bien compris. Merci d'avoir été franc. Je ferme le dossier de mon côté. Si quelque chose change, vous savez où me joindre. »

**Script — EN (do not contact):** "Absolutely — I'll make sure you're not contacted again. Sorry for the interruption."
**Script — FR (ne pas contacter) :** « Absolument — je m'assure que vous ne soyez plus contacté. Désolé du dérangement. »

**Required actions:** record the outcome code and reason (`UNQUALIFIED`, `LOST` with reason, or `DO_NOT_CONTACT`); record the date and who asked; stop all outreach; remove them from any list/sequence (manual until CRM suppression exists); if they gave feedback on a missing feature, log it as product feedback (no commitment). Do not argue, re-pitch, or say the door is "always open" in a way that triggers more follow-up.

### 8.8 Outcome and reason codes (proposed enums for the CRM)

`WON` (Stripe-confirmed only) · `LOST` · `UNQUALIFIED` · `DO_NOT_CONTACT`.
`LOST` reasons: `PRICE`, `COMPETITOR_CHOSEN`, `STAYED_WITH_CURRENT`, `NO_DECISION`, `TIMING`, `FEATURE_GAP`, `MIGRATION_CONCERN`, `ADOPTION_CONCERN`, `PARTNER_VETO`, `UNREACHABLE`, `OTHER`.
`UNQUALIFIED` reasons: `NOT_A_SHOP`, `TOO_LARGE_OR_COMPLEX`, `HARD_REQUIREMENT_NOT_AVAILABLE`, `OUT_OF_AREA_OR_LANGUAGE`, `DUPLICATE`.

---

## 9. Bilingual delivery guide (Canadian French and English)

### 9.1 Principles

1. **One shop, one language at a time.** Resolve it first (§4.2), then stay in it. If the prospect switches, switch with them and say nothing about it. In a mixed room, give numbers and next steps in both languages.
2. **Use the label on the screen.** The product's French labels are the vocabulary (e.g., *Ordres de travail*, *Soumissions*, *Boîte de réception*, *Entreposage de pneus*, *Caisse*). When a marketing or colloquial word differs (*bon de travail*, *devis*), say it once and move to the screen label.
3. **Natural, not translated.** Scripts in §4–§8 are written in Québec French, not word-for-word. Adapt rhythm and register to the person; keep the facts and numbers identical.
4. **Tone for independent garage owners:** practical, direct, respectful of the trade. No hype ("révolutionnaire", "game-changer", "disruptif"), no corporate jargon ("SaaS", "écosystème", "onboarding" — say *mise en route* / *démarrage*), no condescension about technology.
5. **Honesty beats polish.** "Ce n'est pas disponible aujourd'hui" / "It isn't available today" is always an acceptable sentence.

### 9.2 French register and conventions

| Topic | Convention |
|---|---|
| Address | *Vous* by default. Switch to *tu* only if the owner does first. |
| Greeting on the phone | « Bonjour — hello! » then ask the language (§4.2). |
| Money | `199 $`, `1 990 $` (space before `$`; use a non-breaking space), `0,05 $`. State "plus les taxes" and "CAD" when comparing with a US figure. |
| Time and dates | `21 h`, `9 h 30`; « le 8 octobre », « jeudi à 10 h ». |
| Percent | `5 %` (space before `%`). Avoid quoting percentages (§1). |
| Download / upload | *télécharger* = download (the PDF), *téléverser* = upload (the logo). |
| Email / text | *courriel*; *texto* (spoken) or *message texte*; *SMS* is fine on screen. |
| Plan | *forfait* (the product says *forfait* / *plan* in settings; use *forfait* when speaking). |
| Trial | *essai gratuit de 14 jours*, never « gratuit sans carte ». |
| Avoid / prefer | « faire du sens » → *avoir du sens*; « supporter » → *prendre en charge / soutenir*; « opportunité » → *occasion*; « meeting » → *rencontre*; « deadline » → *échéance*; « follow-up » → *suivi*; « booking » → *réservation / rendez-vous*; « email » → *courriel*; « updater » → *mettre à jour*. |
| Inclusivity | Prefer neutral phrasing (*la personne responsable de l'accueil*) when the person's gender is unknown; do not assume a title from a first name. |

### 9.3 English conventions

Canadian spelling (colour, centre, cheque, labour, licence plate, "GST/QST"), CAD, plain words ("set up" not "onboard"), "p.m." for times, no US-only references (no "DMV", "sales tax", "401(k)").

### 9.4 Glossary (use the screen label)

| English | French (product) | Notes |
|---|---|---|
| Estimate / Quote | Soumission | Product: *Quotes* / *Soumissions*. Not *devis*. |
| Work order | Ordre de travail | Reports/marketing also say *bon de travail*. |
| Job status — Ready for pickup | Prêt pour la récupération | Marketing copy also says *Prêt à récupérer*. Follow the screen. |
| Checked in | Reçu | |
| Invoice | Facture | |
| Appointment | Rendez-vous | |
| Digital vehicle inspection (DVI) | Inspection numérique du véhicule | Screen: *Inspections*. Ratings: Good / Needs attention / Service required. |
| Reminder | Rappel | |
| Campaign | Campagne | Email only. |
| Customer portal | Portail client | |
| Inbox | Boîte de réception | |
| Front desk | Accueil / réception | |
| Mechanic / technician | Mécanicien / technicien | |
| Parts / labour | Pièces / main-d'œuvre | |
| Tire storage | Entreposage de pneus | |
| Cash drawer | Caisse | |
| Reports | Rapports | |
| Organization (Multi-Shop) | Organisation (Multi-atelier) | |
| Payment method | Mode de paiement | Card, Cash, Interac e-Transfer, Cheque, Other = Carte, Comptant, Virement Interac, Chèque, Autre |
| GST / QST | TPS / TVQ | |
| Plan: Core / Pro / Complete | Forfait Core / Pro / Complete | Plan names are not translated. |
| Free trial | Essai gratuit | 14 days, payment method required, $0 today |
| Billing | Facturation | Settings → Billing |
| Activate my GarageOS account | Activer mon compte GarageOS | Email CTA |
| Your GarageOS is ready | Votre GarageOS est prêt | Email subject/heading |
| You're almost done | Vous y êtes presque | Payment page |
| Sales demo | Démo de vente | Amber bar label |

---

## 10. Compliance, privacy and honesty guardrails (operational, not legal advice)

Authority: `docs/compliance/casl-matrix.md`, `docs/compliance/privacy-governance.md`, `docs/compliance/subprocessors.md`, `docs/compliance/legal-verification-2026-10-02.md`, and the administrator/privacy officer. When in doubt, stop and ask.

| Area | Rule |
|---|---|
| **Commercial messages (CASL)** | "GarageOS marketing to prospects" is classified as needing CEM controls unless a specific basis or exception applies (`casl-matrix.md`). Do not assume that B2B email is exempt. Every commercial message needs a lawful basis you can evidence (address, source, date/time, wording or relationship), sender identification, contact details and a working unsubscribe, and suppression must be honoured everywhere. Unsolicited written outreach is **not** part of this playbook and is owned by the Sales Communications workstream. |
| **Phone and in-person** | Honour internal do-not-contact records. Follow the telemarketing rules that apply to your calls — confirm with the administrator which apply to which call type; do not rely on this playbook for legal conclusions. Never call at unreasonable hours; never use a misleading caller identity. |
| **Recording** | Do not record calls or video demos without announcing it and getting a clear yes. Store only what the CRM process allows. |
| **Prospect personal information (Law 25)** | Collect only what you need (name, role, contact, business facts). Record the source and purpose. Do not collect sensitive personal data. Honour access, correction and deletion requests by routing them to the privacy officer (`docs/compliance/privacy-request-procedure.md`). |
| **Demo data** | No real customer's name, phone, email, vehicle, photo or plate in any demo. Use fictional records, the synthetic scenario, or Garage Laurent. The prospect's own logo/photos only with recorded permission, and remove them on request. |
| **Real messages in demos** | Only to the prospect, in the room, with their explicit agreement, after a same-day rehearsal (§5.2). Never to the prospect's customers. |
| **Credentials and cards** | Never ask for, see, or store a prospect's password or card. Never log into a prospect's owner account. Activation is by the owner via the emailed link. |
| **Claims** | Only §2 facts. No testimonials, case studies, counts of customers, uptime figures, ROI percentages, "compliance" assurances or competitor claims. |
| **Mistakes** | If you said something inaccurate, correct it in writing within one business day and log it. Correcting is professional; hiding is not. |
| **Respect "no"** | One respectful close-out (§8.7), then stop. Record do-not-contact immediately. |

---

## 11. Debrief and coaching

### 11.1 Post-demo debrief (5 minutes, immediately after)

| Field | Capture |
|---|---|
| Prospect / date / duration / language / demo variant (P1–P8) | |
| Attendees and decision roles | |
| Top three needs: confirmed, changed, new? (severity, provenance) | |
| Steps run and depth (`FULL/COMPACT/MENTION/SKIPPED/DEFERRED`) | |
| Moments of highest interest (step, quote) | |
| Objections (id, intensity, resolved?) | |
| What did not work (technical, confusing, missing capability) | |
| Claims I made that need verification | |
| Agreed next step (type, date, owner) | |
| Fit / intent update and reason | |
| Product feedback (gaps, never promises made) | |

### 11.2 Coaching rubric (manager or peer, 0–2 per line; 20 points)

| # | Dimension | 0 | 1 | 2 |
|---|---|---|---|---|
| 1 | Preparation | Demo shop unprepared | Mostly ready | Shop, scenario, fallbacks and rehearsal done |
| 2 | Discovery fidelity | Generic | Some needs confirmed | Top three needs verified with consequences |
| 3 | Personalisation | Feature tour | Some order change | Ordered by needs (§6) with their words |
| 4 | Storyline | Jumps around | Follows steps | Follows the car's visit with explicit hand-offs |
| 5 | Prospect involvement | Rep drives all | Occasional | Prospect clicks/answers throughout |
| 6 | Accuracy and honesty | Overclaims | Minor slips | Every claim in §2; limits stated |
| 7 | Objection handling | Argues / avoids | Answers | ACRC with proof and confirmation |
| 8 | Language quality | Mixed / unnatural | Understandable | Natural, correct vocabulary for the language |
| 9 | Close | No next step | Vague | Dated, specific, owner-confirmed |
| 10 | Follow-up | None / late | Generic | Same-day recap with open items and dates |

Score ≥ 16 and no 0 on lines 6 or 8 = "demo-ready" for that observation (§12.3).

---

## 12. Sales Academy — curriculum

**Audience:** new and existing reps (today: founder-led; future: `SALES_REP`/`SALES_MANAGER`). **Delivery:** self-paced reading of this document, hands-on practice in a **training demo shop** (never a real prospect's), role-plays, and observed demos. **Languages:** each module is delivered and assessed in the language(s) the rep will sell in (EN, FR or both); the FR/EN endorsement is certified separately (§12.3).

**Safety rule for training:** any exercise that sends email/SMS, creates an owner account, or opens Stripe Checkout runs only in an environment the administrator designates for training (provider side effects disabled or Stripe **test mode**, internal recipients only). Never practise on a real prospect or customer. Never trigger Production providers "just to see".

### 12.1 Module map

| ID | Module (EN) | Module (FR) | Time | Format |
|---|---|---|---:|---|
| A0 | Orientation: who we are, what we can say | Orientation : qui nous sommes, ce que nous pouvons dire | 1.5 h | Reading + quiz |
| A1 | The independent repair shop: workflow and vocabulary | L'atelier de réparation indépendant : flux de travail et vocabulaire | 2 h | Reading + interview |
| A2 | GarageOS product fluency | Maîtrise du produit GarageOS | 3 h | Hands-on lab |
| A3 | Discovery and needs capture | Découverte et saisie des besoins | 3 h | Role-play |
| A4 | Qualification, decision-makers, budget | Qualification, décideurs, budget | 2 h | Role-play + worksheet |
| A5 | The 30-minute core demo | La démo de base de 30 minutes | 4 h + 3 rehearsals | Rehearsal + observation |
| A6 | Adaptive demos (P1–P8) | Démos adaptées (P1–P8) | 3 h | Case work |
| A7 | Objection handling | Gestion des objections | 3 h | Drills |
| A8 | Closing, activation and follow-up | Conclusion, activation et suivi | 2.5 h | Lab + role-play |
| A9 | Bilingual delivery (Québec French / English) | Prestation bilingue (français québécois / anglais) | 2 h + ongoing | Oral practice |
| A10 | Compliance, privacy and ethics | Conformité, vie privée et éthique | 1.5 h | Scenario quiz |
| A11 | Capstone: certification demo | Projet final : démo de certification | 2 h | Observed |

Recommended order: A0 → A1 → A2 → A3 → A4 → A10 → A5 → A6 → A7 → A8 → A9 (continuous) → A11.

### 12.2 Module specifications

For every module: **Objectives**, **Material**, **Practice**, **Checklist**, **Readiness criteria**, **Assessment**, **Tracking events**. Assessment passes at **≥ 80 %** unless stated. Keys are model answers, not scripts.

---

#### A0 — Orientation / Orientation

**Objectives**
- EN: State what GarageOS is and who it serves; apply the five evidence labels; recite the twelve claim rules; name what is planned vs available.
- FR : Dire ce qu'est GarageOS et à qui il s'adresse; appliquer les cinq étiquettes de preuve; réciter les douze règles sur les affirmations; distinguer ce qui est prévu de ce qui est disponible.

**Material:** §0, §1, §2, §3, §10.

**Practice — Claim audit.** Label each statement `IMPL / IMPL·PRO / LIMIT / PLANNED / NO` and rewrite the unacceptable ones into an honest sentence.

| # | Statement | Key |
|---:|---|---|
| 1 | "GarageOS processes your customers' card payments." | **NO** — it records payments the shop collected. |
| 2 | "A customer can accept an estimate on their phone without logging in." | **IMPL** |
| 3 | "Inspection photos are included in every plan." | **IMPL·PRO** — basic DVI on all, photos Pro+. |
| 4 | "We import your old invoices and Work Orders." | **NO** — customers, vehicles, inventory only. |
| 5 | "Two-way texting works on day one." | **LIMIT** — needs a GarageOS-provisioned number; no date. |
| 6 | "You can send an SMS campaign." | **NO** — campaigns are email. |
| 7 | "QuickBooks sync is live and proven." | **IMPL·PRO + LIMIT** — not provider-validated. |
| 8 | "Your data stays in Canada." | **Do not claim** — providers are in the USA. |
| 9 | "We have a public API." | **NO** |
| 10 | "Reports support custom date ranges." | **IMPL·PRO** |
| 11 | "Reps will get a lead inbox in the platform." | **PLANNED** — never tell prospects. |
| 12 | "Customers can reschedule from their link." | **NO** — they can confirm or cancel. |

**Checklist / Liste de vérification**

| EN | FR |
|---|---|
| I can explain GarageOS in one sentence without superlatives | Je peux expliquer GarageOS en une phrase sans superlatifs |
| I know the three prices and the trial mechanics | Je connais les trois prix et le fonctionnement de l'essai |
| I know five things GarageOS does not do | Je connais cinq choses que GarageOS ne fait pas |
| I know launch-state caveats and who confirms them | Je connais les réserves sur l'état du lancement et qui les confirme |
| I know there are no customer references yet | Je sais qu'il n'y a pas encore de références clients |

**Readiness:** Claim audit 12/12; quiz ≥ 80 %.

**Assessment**

| # | Question (EN / FR) | Key (EN / FR) |
|---:|---|---|
| 1 | What does a "free trial" mean at GarageOS? / Que signifie « essai gratuit » chez GarageOS? | 14 days; payment method required; $0 today; first charge date/amount shown before; billing starts automatically unless cancelled; no repeat trial. / 14 jours; mode de paiement requis; 0 $ aujourd'hui; date et montant du premier prélèvement affichés; facturation automatique sauf annulation; pas de second essai. |
| 2 | A prospect asks for a reference customer. What do you say? / Un prospect demande un client de référence. Que dites-vous? | There are none yet; offer the demo, the trial and the public Garage Laurent walkthrough; never invent. / Il n'y en a pas encore; offrir la démo, l'essai et la visite publique de Garage Laurent; ne rien inventer. |
| 3 | Name three things that are not available. / Nommez trois fonctions non disponibles. | Any of: card processing, importing history, public API, time clock, VIN lookup, kanban, deposits, SMS campaigns, MFA. / Parmi : traitement des cartes, import d'historique, API publique, pointage, recherche NIV, tableau kanban, dépôts, campagnes SMS, authentification à deux facteurs. |
| 4 | Who can confirm that Stripe live billing is open? / Qui peut confirmer que la facturation Stripe en production est ouverte? | The platform administrator, in writing. / L'administrateur de la plateforme, par écrit. |
| 5 | Why are "planned" features never mentioned to prospects? / Pourquoi ne mentionne-t-on jamais les fonctions « prévues »? | They may change or never ship; promises create liability and distrust. / Elles peuvent changer ou ne jamais être livrées; les promesses créent un risque et de la méfiance. |

**Tracking events:** `module.start`, `exercise.submit(claim-audit)`, `assessment.complete(A0)`, `module.complete`.

---

#### A1 — The independent repair shop / L'atelier indépendant

**Objectives**
- EN: Describe the full visit (contact → booking → arrival → inspection → estimate → approval → work → ready → invoice → payment → follow-up); explain the roles (owner, service writer, technician, bookkeeper); use correct EN/FR trade vocabulary; name the typical pains and seasonal peaks.
- FR : Décrire la visite complète (contact → rendez-vous → arrivée → inspection → soumission → approbation → travaux → prêt → facture → paiement → suivi); expliquer les rôles (propriétaire, conseiller au service, technicien, comptable); employer le vocabulaire du métier en français et en anglais; nommer les irritants courants et les pointes saisonnières.

**Material:** §4.4 blocks B–F, §9.4 glossary, `/demo` public walkthrough, `docs/feature-gap.md` "Flujo objetivo".

**Practice:** (1) Interview a real shop owner or service writer for 20 minutes (you are *learning*, not selling; no pitch) and map one real job on a single page. (2) Do the same for a second shop in the other language if you serve both. (3) Present the maps to the group.

**Checklist**

| EN | FR |
|---|---|
| I can draw the visit lifecycle from memory | Je peux dessiner le cycle d'une visite de mémoire |
| I can explain estimate vs Work Order vs invoice | Je peux expliquer soumission vs ordre de travail vs facture |
| I can name two seasonal peaks and a typical pain at each stage | Je peux nommer deux pointes saisonnières et un irritant typique à chaque étape |
| I know 20 glossary terms in the language(s) I sell in | Je connais 20 termes du glossaire dans la ou les langues où je vends |

**Readiness:** Lifecycle map reviewed by a manager; quiz ≥ 80 %.

**Assessment**

| # | Question | Key |
|---:|---|---|
| 1 | Put these in the order they normally occur: invoice, estimate approval, inspection, Work Order, reminder. / Mettez dans l'ordre habituel : facture, approbation de la soumission, inspection, ordre de travail, rappel. | Inspection → estimate approval → Work Order → invoice → reminder. / Inspection → approbation → ordre de travail → facture → rappel. |
| 2 | Why does a recorded approval matter to a shop? / Pourquoi une approbation consignée compte-t-elle? | It is the shop's evidence of what the customer agreed to; prevents disputes. / C'est la preuve de ce que le client a accepté; évite les litiges. |
| 3 | Who typically decides on software in a 3-bay independent shop? / Qui décide généralement du logiciel dans un atelier indépendant de 3 baies? | Usually the owner, with influence from the service writer and the bookkeeper. / Habituellement le propriétaire, avec l'influence du conseiller au service et du comptable. |
| 4 | Give the French and English terms for "work order" and "estimate" as they appear on screen. / Donnez les termes français et anglais à l'écran. | Ordre de travail (Work order); Soumission (Quote/Estimate). |

**Tracking events:** `exercise.submit(lifecycle-map)`, `assessment.complete(A1)`.

---

#### A2 — GarageOS product fluency / Maîtrise du produit

**Objectives**
- EN: Navigate every route in §5.7 quickly; explain which features differ by plan and demonstrate the gate by switching the demo's viewing plan; perform the visit end to end in the training shop; know exactly where the product's limits are.
- FR : Naviguer rapidement vers chaque route du §5.7; expliquer quelles fonctions diffèrent selon le forfait et montrer le verrou en changeant le forfait affiché de la démo; réaliser une visite de bout en bout dans l'atelier de formation; connaître précisément les limites du produit.

**Material:** §2, §3, §5.7; `/pricing`, `/guides`, `/quick-start`; `src/config/entitlements.ts` (read-only).

**Practice — Scavenger hunt (timed, 15 s per target):** reach: booking page; QR code; agenda; New appointment; client + vehicle; inspections new; quote new; quote send dialog; customer quote page; Work Order status; Convert to draft invoice; Mark as paid; Reports; Reminders; Rules (Pro); Campaigns (Pro); Import; Team tab; Locations tab; Billing tab; `/demo`; `/demo/booking`. Then: (a) build and "send" a quote to yourself in the training environment; (b) switch Viewing to Core and list what gets locked; (c) switch to Pro and Complete.

**Checklist**

| EN | FR |
|---|---|
| I completed the scavenger hunt in the time limit | J'ai réussi la chasse au trésor dans le temps imparti |
| I can list the Pro-only capabilities from memory | Je peux énumérer de mémoire les fonctions réservées à Pro |
| I can state plan prices and users/locations limits | Je peux énoncer les prix et les limites d'utilisateurs/emplacements |
| I can show the customer-facing page of a quote | Je peux montrer la page client d'une soumission |
| I know where payments are recorded and what that means | Je sais où les paiements sont consignés et ce que cela signifie |

**Readiness:** Scavenger hunt ≥ 20/22 within the limit; end-to-end visit completed unaided; quiz ≥ 80 %.

**Assessment**

| # | Question | Key |
|---:|---|---|
| 1 | Which plan first includes inventory, tire storage, campaigns and advanced reports? / Quel forfait inclut d'abord l'inventaire, l'entreposage de pneus, les campagnes et les rapports avancés? | Pro. |
| 2 | How many users does Core include and how many locations does Pro include? / Combien d'utilisateurs Core inclut-il et combien d'emplacements Pro inclut-il? | Core: 3 users; Pro: 1 location (Complete for multi-location). |
| 3 | Where do you find the booking QR code and embed snippet? / Où trouve-t-on le code QR et l'extrait d'intégration? | Settings → Calendar & Hours tab (`?tab=calendar`). |
| 4 | A prospect needs the customer to pay by card inside GarageOS. Response? / Un prospect veut que le client paie par carte dans GarageOS. Réponse? | Not available; GarageOS records payments; their terminal continues to work. |
| 5 | What happens to the booking page design if a Pro shop downgrades to Core? / Que devient le design de la page de réservation si une boutique Pro passe à Core? | The preference is stored, but the public page renders Classic (the effective design falls back). |
| 6 | Which documents can be imported and what are the Core/Pro row limits? / Quels documents peut-on importer et quelles sont les limites? | Customers, vehicles (all plans, 500 rows); inventory + 10,000 rows (Pro+). Not invoices/Work Orders. |

**Tracking events:** `lab.complete(scavenger-hunt, time, score)`, `exercise.submit(e2e-visit)`, `assessment.complete(A2)`.

---

#### A3 — Discovery and needs capture / Découverte et saisie des besoins

**Objectives**
- EN: Open a call in the right language; ask Block A–H questions in natural order; separate verified from inferred; score needs 0–3 with evidence; produce a one-page capture card.
- FR : Ouvrir un appel dans la bonne langue; poser les questions des blocs A à H dans un ordre naturel; distinguer le vérifié de l'inféré; évaluer les besoins de 0 à 3 avec preuves; produire une fiche de saisie d'une page.

**Material:** §4 entire.

**Practice:** Three role-plays (20 min each, recorded with consent for coaching) with persona cards (Appendix B): *P1 Marcel* (paper), *P3 Julie* (phone chaos), *P7 Dave* (6 techs). The partner plays the owner and holds a hidden list of five needs; the rep must surface at least four with evidence. Debrief with §11.2 lines 2 and 8.

**Checklist**

| EN | FR |
|---|---|
| Resolved language before pitching | Langue établie avant de présenter |
| Asked for a story, not a feature list | Demandé une histoire, pas une liste de fonctions |
| Captured top three needs with consequences | Saisi les trois principaux besoins avec leurs conséquences |
| Tagged each fact verified/inferred | Étiqueté chaque fait vérifié/inféré |
| Talked ≤ 40% of the time | Parlé ≤ 40 % du temps |

**Readiness:** ≥ 4/5 hidden needs surfaced in two of three role-plays; capture cards judged complete; quiz ≥ 80 %.

**Assessment**

| # | Question | Key |
|---:|---|---|
| 1 | "We lose a lot of calls." Which need and what follow-up? / « On perd beaucoup d'appels. » Quel besoin et quelle relance? | `booking`; ask how many per day/week, what happens, any consequence (C2–C3). |
| 2 | Is "I think they use Excel" a verified need? / « Je crois qu'ils utilisent Excel » est-ce vérifié? | No — inferred; confirm with G1. |
| 3 | What distinguishes severity 3 from 2? / Qu'est-ce qui distingue la gravité 3 de 2? | A quantified or time-bound consequence (a deadline, a cost, staff loss). |
| 4 | Why not ask the gatekeeper whether the shop is unhappy with its software? / Pourquoi ne pas demander à la réception si l'atelier est insatisfait de son logiciel? | Inappropriate/misleading; ask who handles scheduling/invoicing. |
| 5 | How do you resolve language when it's unknown? / Comment établir la langue quand elle est inconnue? | Ask; never assume French silently. |

**Tracking events:** `roleplay.complete(persona, needsFound)`, `exercise.submit(capture-card)`, `assessment.complete(A3)`.

---

#### A4 — Qualification, decision-makers, budget / Qualification, décideurs, budget

**Objectives**
- EN: Score fit and intent separately and justify each; identify the decision path; run the §4.9 worksheet using only the prospect's numbers; transition to a demo with a mirror statement and a confirmed date.
- FR : Évaluer l'adéquation et l'intention séparément et les justifier; repérer le parcours de décision; utiliser la feuille du §4.9 avec les seuls chiffres du prospect; passer à la démo avec un énoncé miroir et une date confirmée.

**Material:** §4.7–§4.11.

**Practice:** (1) Score six written case summaries for fit and intent; compare with the manager's reasoning. (2) Run the budget worksheet on two personas; present the arithmetic aloud. (3) Role-play the §4.10 transition with an objection ("just send pricing").

**Checklist**

| EN | FR |
|---|---|
| Fit and intent scored separately with reasons | Adéquation et intention évaluées séparément avec raisons |
| Decision-maker and influencers recorded | Décideur et influenceurs consignés |
| No invented ROI | Aucun rendement inventé |
| Date and attendees confirmed for the demo | Date et participants confirmés pour la démo |

**Readiness:** Case scoring within ±1 of the key in 5/6; transition role-play passes rubric lines 2, 6 and 9; quiz ≥ 80 %.

**Assessment**

| # | Question | Key |
|---:|---|---|
| 1 | A prospect needs built-in card processing. Fit or intent issue? / Un prospect veut le traitement de cartes intégré. Problème d'adéquation ou d'intention? | Fit (a **[NO]** requirement). |
| 2 | Why record a decision role per contact? / Pourquoi consigner un rôle de décision par contact? | The owner alone completes activation/payment; influencers shape the decision. |
| 3 | Give the formula for missed-call value and its inputs. / Donnez la formule de la valeur des appels manqués et ses intrants. | (missed calls/week × share that would book × average ticket) × 4.3; all inputs from the prospect. |
| 4 | When should you not propose a start date? / Quand ne pas proposer de date de démarrage? | During the shop's rush; propose after the peak. |

**Tracking events:** `exercise.submit(case-scoring)`, `roleplay.complete(transition)`, `assessment.complete(A4)`.

---

#### A5 — The 30-minute core demo / La démo de base de 30 minutes

**Objectives**
- EN: Prepare a demo shop to standard (§5.2); deliver D1–D11 within 30 ± 5 minutes; hand off between steps explicitly; keep the prospect involved; recover gracefully from a failed send or missing slot; run the 15-, 25- and 35-minute variants.
- FR : Préparer un atelier de démo selon la norme (§5.2); livrer D1 à D11 en 30 ± 5 minutes; faire des transitions explicites; garder le prospect actif; se rétablir d'un échec d'envoi ou d'une absence de créneau; exécuter les variantes de 15, 25 et 35 minutes.

**Material:** §5 entire; public `/demo`; Garage Laurent assets.

**Practice (three rehearsals):**
1. **Clean room** — alone, timer on, no interruptions; self-score with §11.2.
2. **Interrupted** — a partner interrupts three times (a parking-lot question; "just tell me the price"; "can it do X?" where X is **[NO]**).
3. **Failure drill** — the booking page shows no slots and a send fails; the rep switches to `/demo/booking` and fallbacks (§5.2) without losing the thread.

**Checklist (D0)** — see §5.2 (use it verbatim). Additional: **Bilingual** — run the same demo in both languages if endorsed for both.

**Readiness:** One observed rehearsal ≥ 16/20, no 0 on lines 6 or 8; timing 25–35 min; all fallbacks used correctly; quiz ≥ 80 %.

**Assessment**

| # | Question | Key |
|---:|---|---|
| 1 | List the demo steps in order and their full-depth minutes. / Listez les étapes et leurs minutes à pleine profondeur. | Full depth: D1 2 · D2 4 · D3 3 · D4 3 · D5 4 · D6 4 · D7 3 · D8 4 · D9 4 · D10 0–4 · D11 4 (= 35); standard 30-minute allocation per §5.6. |
| 2 | In D8, what must you say before the prospect assumes otherwise? / En D8, que devez-vous dire avant que le prospect suppose autre chose? | GarageOS records payments; it doesn't process customers' cards. |
| 3 | You are at 22 minutes and have not shown D9. What do you do? / À 22 minutes, D9 n'est pas faite. Que faites-vous? | Compact D9 (reminder + portal), mention campaigns, protect D11. |
| 4 | Can you click "Approval history" in D6? / Peut-on cliquer sur « Historique d'approbation » en D6? | No such admin screen; show the status change and notification. |
| 5 | When may you send a real message during a demo? / Quand peut-on envoyer un vrai message pendant une démo? | Only to the prospect, in the room, with agreement, after a same-day rehearsal, ideally a quote email. |
| 6 | What does the amber bar do and what must you never press by accident? / Que fait la barre ambre et que ne faut-il jamais presser par erreur? | Demo controls; Convert to customer and Exit demo. |

**Tracking events:** `rehearsal.complete(type, minutes, score)`, `observation.submit(rubric)`, `assessment.complete(A5)`.

---

#### A6 — Adaptive demos / Démos adaptées

**Objectives**
- EN: Convert discovery output into a re-ordered run sheet (order, depth, minutes) in ten minutes; explain the reasoning; combine variants; respect dependencies.
- FR : Convertir le résultat de la découverte en feuille de route réordonnée (ordre, profondeur, minutes) en dix minutes; expliquer le raisonnement; combiner les variantes; respecter les dépendances.

**Material:** §6 entire.

**Practice:** Eight persona cards (Appendix B). For each, write the run sheet, then compare with the key table below; then role-play the first three steps of two variants.

| Persona | Key (primary variant · first three steps) |
|---|---|
| Marcel (paper, 2 staff) | P1 + P6 · D1, D4 (import preview), D6 |
| Julie (phones) | P3 · D1, D2 (full), D3 (full) |
| Pierre (competitor software, contract March) | P2 · D1 + parity checklist, top frustration, … |
| Lise (invoice errors) | P4 · D1, D4 compact, D6 full |
| Karim (retention) | P5 · D1, D4 full, D2 compact |
| Dave (6 techs) | P7 · D1, D3, D5 |
| Hélène (2 locations) | P8 · D1, D3 compact, D6/D7/D8 compact thread |
| Tony (solo, phones, Excel) | P6 shell + P3 order + P1 reassurance · D1, D2, D6 |

**Checklist**

| EN | FR |
|---|---|
| Picked primary variant with a reason | Choisi la variante principale avec une raison |
| Every FULL step maps to a top-3 need | Chaque étape COMPLÈTE correspond à un des 3 besoins principaux |
| Prerequisites honoured | Prérequis respectés |
| D1 and D11 kept | D1 et D11 conservées |
| Total time within target | Durée totale dans la cible |

**Readiness:** 7/8 run sheets correct on primary variant and first three steps; two variant role-plays pass line 3 of the rubric.

**Assessment**

| # | Question | Key |
|---:|---|---|
| 1 | Why is multi-location always the primary variant when it applies? / Pourquoi le multi-emplacement est-il toujours la variante principale? | The decision is organisational; requires Complete and a pilot plan. |
| 2 | In P2, why build the parity checklist before showing anything? / En P2, pourquoi bâtir la liste de parité avant de montrer quoi que ce soit? | Elicits what they'd hate to lose; keeps comparisons honest. |
| 3 | What must you tell a multi-location prospect about customers? / Que dire au multi-emplacement sur les clients? | Records are separated per location. |
| 4 | Which step can never be skipped? / Quelle étape ne peut jamais être omise? | D1 and D11. |

**Tracking events:** `exercise.submit(run-sheet, persona)`, `assessment.complete(A6)`.

---

#### A7 — Objection handling / Gestion des objections

**Objectives**
- EN: Apply ACRC to the nine required objections plus two extras in both languages; use only verified facts; escalate correctly.
- FR : Appliquer ACRC aux neuf objections obligatoires et à deux autres dans les deux langues; n'utiliser que des faits vérifiés; escalader correctement.

**Material:** §7 entire; §2.

**Practice:** (1) Objection roulette: a partner draws a card; the rep answers within 45 seconds; peers score ACRC and accuracy. (2) Write the "do not say" list from memory. (3) Escalation drill: three questions you must not answer (a written security questionnaire, a discount, a per-location price).

**Checklist**

| EN | FR |
|---|---|
| Acknowledged before responding | Reconnu l'objection avant de répondre |
| Asked one clarifying question | Posé une question de clarification |
| Used a fact + a thing to show | Utilisé un fait + un élément à montrer |
| Confirmed the concern was addressed | Vérifié que la préoccupation est réglée |
| Escalated what I could not answer | Escaladé ce que je ne pouvais pas répondre |

**Readiness:** ≥ 9/11 objections handled accurately in both languages the rep sells in; no "do not say" violation; quiz ≥ 80 %.

**Assessment**

| # | Question | Key |
|---:|---|---|
| 1 | "Can you give me a discount?" / « Pouvez-vous me faire un rabais? » | No program exists in the product; escalate; don't invent; offer annual (10 for 12) as the published option. |
| 2 | "Is my data in Canada?" / « Mes données sont-elles au Canada? » | Don't claim; hosting/providers are in the USA; share the privacy policy and provider list; escalate details. |
| 3 | "Can I switch my old invoices over?" / « Puis-je transférer mes anciennes factures? » | No; customers, vehicles, inventory only; keep archive; offer parallel run. |
| 4 | "What if I cancel?" / « Et si j'annule? » | Cancel in Billing; usually effective at end of paid period; trial cancel before first charge; paid amounts non-refundable except as law requires; export before access ends. |
| 5 | "Are your texts CASL-compliant?" / « Vos textos respectent-ils la LCAP? » | Product includes consent/unsubscribe/STOP controls; classification depends on message purpose; no blanket assurance. |
| 6 | Pick the false statement: A) Pro has no user limit B) Core includes DVI photos C) Reports basic exists in Core / Choisissez l'énoncé faux. | B. |

**Tracking events:** `drill.complete(objectionId, accuracy, acrc)`, `assessment.complete(A7)`.

---

#### A8 — Closing, activation and follow-up / Conclusion, activation et suivi

**Objectives**
- EN: Close in context using the right ladder step; run the pre-send checklist; send owner activation and coach the owner through it; troubleshoot the verified failure cases; send same-day recaps; handle undecided, re-engage and disqualify respectfully; use outcome codes.
- FR : Conclure en contexte avec le bon échelon; appliquer la liste de contrôle avant l'envoi; envoyer l'activation au propriétaire et l'accompagner; dépanner les cas d'échec vérifiés; envoyer des résumés le jour même; gérer l'indécision, relancer et disqualifier avec respect; utiliser les codes de résultat.

**Material:** §8 entire; §3.1 (activation behaviour); `docs/sales-demo-wave-3-validation.md`.

**Practice:** (1) In the **designated training environment only**: prepare a training prospect, convert, send activation to an internal mailbox, activate, and reach the payment page (Stripe test mode); then resend and observe the old link failing. (2) Write a same-day recap for a recorded demo in both languages. (3) Role-play three endings: a hesitant partner; a hard requirement **[NO]**; a "please stop calling".

**Checklist**

| EN | FR |
|---|---|
| Owner email read back and confirmed | Courriel du propriétaire relu et confirmé |
| Plan/interval equals what was agreed | Forfait/fréquence conformes à l'entente |
| Sample data cleaned or disclosed | Données d'exemple nettoyées ou divulguées |
| Won only after Stripe confirms | Gagné seulement après la confirmation de Stripe |
| Next step is dated | Prochaine étape datée |
| Do-not-contact recorded immediately | Ne-pas-contacter consigné immédiatement |

**Readiness:** Activation lab completed; recap judged accurate with no unsupported claims in both languages; the three endings pass line 9; quiz ≥ 80 %.

**Assessment**

| # | Question | Key |
|---:|---|---|
| 1 | When is an opportunity Won? / Quand une occasion est-elle gagnée? | Only when Stripe sync confirms a mapped plan with TRIALING or ACTIVE status. |
| 2 | The owner's email already belongs to a MECHANIC in another shop. What now? / Le courriel appartient à un MÉCANICIEN d'un autre atelier. | Never reassign; use a different email. |
| 3 | The link says "invalid or expired". Steps? / Le lien est « invalide ou expiré ». | Resend (1-minute cooldown; new link replaces old); if already activated, sign in to finish payment. |
| 4 | What does the activation email contain/promise about validity? / Que dit le courriel d'activation sur la validité? | Single-use, expires in 24 hours (or at demo expiry). |
| 5 | After 3 unanswered follow-ups, what do you do? / Après trois relances sans réponse? | Send the closing-the-loop message and stop. |

**Tracking events:** `lab.complete(activation, env)`, `exercise.submit(recap, locale)`, `roleplay.complete(ending)`, `assessment.complete(A8)`.

---

#### A9 — Bilingual delivery / Prestation bilingue

**Objectives**
- EN: Deliver the opening, D2, D6, D8 and the closing in natural Québec French and Canadian English; use the product's French vocabulary; switch mid-conversation without friction.
- FR : Livrer l'ouverture, D2, D6, D8 et la conclusion dans un français québécois naturel et un anglais canadien; utiliser le vocabulaire français du produit; changer de langue en cours de conversation sans friction.

**Material:** §9, scripts throughout.

**Practice:** (1) Glossary sprint: 30 terms, 3 minutes. (2) Switch drill: the "owner" changes language at D6; the rep continues. (3) Record D8 in each language; a native speaker marks vocabulary, register and anglicisms. (4) Convert one English script into your own natural French (or the reverse) and compare with the playbook version.

**Checklist**

| EN | FR |
|---|---|
| Used the on-screen label | Utilisé l'étiquette à l'écran |
| Used *vous* | Employé le *vous* |
| Avoided anglicisms listed in §9.2 | Évité les anglicismes du §9.2 |
| Stated money/time correctly | Montants et heures bien présentés |
| Switched language without comment | Changé de langue sans commentaire |

**Readiness (per language):** Native-level reviewer rates register, vocabulary and clarity ≥ 4/5 on a recorded D8 and an objection response; glossary ≥ 90 %. The rep earns an **EN-ready** and/or **FR-ready** endorsement separately.

**Assessment**

| # | Question | Key |
|---:|---|---|
| 1 | Say "estimate", "work order" and "ready for pickup" as shown on the French screen. | Soumission · Ordre de travail · Prêt pour la récupération. |
| 2 | Convert $1,990 CAD annual to Québec convention. | 1 990 $ (CAD). |
| 3 | Which verb: upload a logo / download a PDF? | téléverser / télécharger. |
| 4 | Replace "faire du sens". | avoir du sens. |

**Tracking events:** `endorsement.review(locale, scores)`, `assessment.complete(A9)`.

---

#### A10 — Compliance, privacy and ethics / Conformité, vie privée et éthique

**Objectives**
- EN: Apply §10; spot CASL-sensitive situations; protect personal information and demo data; handle mistakes and complaints correctly.
- FR : Appliquer le §10; repérer les situations sensibles à la LCAP; protéger les renseignements personnels et les données de démo; gérer correctement erreurs et plaintes.

**Material:** §10; `docs/compliance/casl-matrix.md`, `privacy-governance.md`, `privacy-request-procedure.md`.

**Practice:** Eight scenario cards (e.g., "A prospect gave their email at a trade show; may you email a promotion?"; "May you demo with a real customer's photo?"; "The prospect says 'stop contacting me'").

**Checklist**

| EN | FR |
|---|---|
| I know what to log when a prospect says stop | Je sais quoi consigner quand un prospect dit d'arrêter |
| I never use real customer data in demos | Je n'utilise jamais de données de vrais clients en démo |
| I never ask for credentials or cards | Je ne demande jamais d'identifiants ni de carte |
| I escalate legal classification questions | J'escalade les questions de classification juridique |

**Readiness:** Scenario quiz ≥ 90 % (pass mark higher for compliance); any "unsafe" answer triggers a coaching conversation before progression.

**Assessment**

| # | Question | Key |
|---:|---|---|
| 1 | May you record a video demo? / Peut-on enregistrer une démo? | Only after announcing it and obtaining a clear yes. |
| 2 | Can a quote be sent in a demo to a prospect's customer? / Envoyer une soumission à un client du prospect? | Never. |
| 3 | A prospect asks for deletion of their information. / Un prospect demande la suppression de ses renseignements. | Route to the privacy officer under the request procedure; stop outreach. |
| 4 | Is a marketing campaign by a shop automatically CASL compliant? / Une campagne est-elle automatiquement conforme? | No; controls exist, compliance depends on consent basis and content. |

**Tracking events:** `assessment.complete(A10)`, `ack.sign(compliance-policy)`.

---

#### A11 — Capstone: certification demo / Projet final

**Objectives**
- EN: Run a full discovery summary → adaptive 30-minute demo → objection round → close → recap for an unseen persona, in each language you will sell in, observed by a manager.
- FR : Mener un résumé de découverte → démo adaptée de 30 minutes → ronde d'objections → conclusion → résumé pour un personnage inconnu, dans chaque langue de vente, devant un gestionnaire.

**Practice:** The manager chooses a persona and two surprise objections from §7 and one [NO] requirement.

**Readiness:** Rubric ≥ 16/20, no 0 on lines 6 and 8; the recap contains no unsupported claim; the manager signs the certification record.

**Assessment:** The observed performance (rubric §11.2) is the assessment. A written reflection (200 words) names two things to improve.

**Tracking events:** `observation.submit(capstone)`, `certification.grant(level, locale)`.

---

### 12.3 Readiness levels

| Level | Name | Requirements | Allowed to |
|---|---|---|---|
| **R0** | Not started | — | Shadow only |
| **R1** | Knowledge-certified | A0, A1, A2, A3, A4, A10 passed (≥ 80 %; A10 ≥ 90 %) | Run discovery calls under supervision; use public `/demo` with prospects |
| **R2** | Demo-ready (supervised) | R1 + A5 observation ≥ 16/20 + A6 + A9 for the language | Run live demos with a manager present or reviewing recordings (with consent) |
| **R3** | Independent | R2 + A7 + A8 + A11 + three supervised real demos ≥ 16/20 with no 0 on lines 6 or 8; manager sign-off | Run demos, conversions and follow-ups independently |
| **Endorsements** | `EN-ready` / `FR-ready` | A9 per language | Sell in that language |

**Recertification triggers:** *PATCH* playbook version (typo/clarity) → notify only. *MINOR* (new step, new fact, new objection answer) → read-and-acknowledge + 5-question check on the changed content within 14 days. *MAJOR* (pricing, product capability, process, compliance) → reassess affected modules before the next live demo. Annual refresher quiz. Any rubric 0 on honesty → coaching and a re-observation before the next independent demo.

---

## 13. Progress-tracking requirements

These are requirements for how training and demo progress must be tracked. **Until the CRM and Academy are built, track in a shared spreadsheet or the administrator's chosen tool with the same fields; do not build tracking in the application as part of this document.** Names are proposals (§14.11 maps them to the master plan).

### 13.1 Training

| Requirement | Detail |
|---|---|
| Enrolment pinned to a playbook version | Each rep's progress records `playbookVersionId` (§14.2). A new MAJOR/MINOR version creates a *review task*, never silently rewrites old completions. |
| Per-module status | `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `NEEDS_REVIEW`; timestamps (`startedAt`, `completedAt`, `lastViewedItemId`); optional time spent. |
| Per-locale | Progress and endorsements tracked per `locale` (`en-CA`, `fr-CA`). |
| Assessment attempts | Each attempt stored: attempt number, locale, started/submitted, item ids and order seed, answers, score, pass/fail, reviewer (for subjective items). Max 3 attempts per 24 h; after 2 failures a coaching note is required. Keys are never shown before a pass. |
| Exercises and role-plays | Submission (text/rating/recording link), reviewer, status (`SUBMITTED`, `PASSED`, `REVISE`), feedback. |
| Observations | Coaching rubric §11.2 scores per line, observer, context (rehearsal / real), notes. |
| Certifications | Level (R1–R3), endorsements (EN/FR), grantedBy, grantedAt, expiresAt/recertify-by, evidence references, revocation with reason. |
| Visibility | A rep sees their own progress. A manager sees their team. Super Admin sees all. Managers cannot edit assessment answers or scores. |
| Audit | Immutable event log: who, what, when, before/after (safe metadata). Certification grants/revocations are always audited. |
| Privacy | Training records are employee data: minimal, retained per policy, never exposed to prospects or in demo views. Recordings stored only with consent and per retention rules. |
| Reporting | Completion rate, time-to-R2/R3, pass rate per module and per question (flag items < 40 % or > 98 % for review), rubric trends, most-skipped demo steps, most frequent objections by variant. Not a gamified volume leaderboard (master plan §8). |

### 13.2 Demo progress (per live demo; mirrors master plan `CrmDemoRun`/`CrmDemoStepOutcome`)

| Requirement | Detail |
|---|---|
| Run record | `demoRunId`, opportunity/prospect, rep, `playbookVersionId`, variant (`P1…P8`, composite allowed), language, planned vs actual duration, start/end, mode (`IN_PERSON`/`VIDEO`/`PHONE`), `salesDemoId` (existing technical demo) when applicable. |
| Step outcome | For each step: `stepId`, `plannedDepth`, `actualDepth` (`FULL/COMPACT/MENTION/SKIPPED/DEFERRED`), `startedAt`/`durationSec`, `interest` (0–3), notes (private), `skipReason` (`NOT_RELEVANT`, `TIME`, `PROSPECT_REQUEST`, `TECH_ISSUE`). |
| Objections | `objectionId`, `stepId`, intensity, resolved Y/N. |
| Needs delta | New or re-scored needs (`needKey`, severity, provenance) found during the demo. |
| Outcome | Next step (type/date), plan recommended, billing interval, activation sent, status; `outcomeCode` (§8.8). |
| Immutability | A completed run's playbook version and step list are frozen; later edits create new versions. |
| Privacy | Notes are visible only to the rep, their manager and Super Admin; **never in any prospect-facing screen** (master plan §7). |

---

## 14. Implementation handoff — proposed structured playbook contract

> **Proposal only.** Nothing here is implemented, no Prisma model or migration is created, and Agent 1 owns the CRM models. This section defines the *shape* in which the content of §4–§13 should be represented so that Agent 3's implementation phase can consume it without re-authoring. Field and type names are suggestions; the master plan's model names (`CrmPlaybook`, `CrmPlaybookVersion`, `CrmPlaybookStep`, `CrmTrainingProgress`, `CrmDemoRun`, `CrmDemoStepOutcome`, `CrmProspectNeed`) remain authoritative, subject to Agent 1's actual schema.

### 14.1 Principles

1. **Content is data.** Scripts, questions, objection answers, assessments and step definitions are structured records, not UI strings. The UI renders them; it does not contain them.
2. **Published versions are immutable.** Editing creates a new draft; demos and training progress pin the version they used (master plan §7: "historic demos retain version used").
3. **Both locales are mandatory for publication.** There is no silent cross-language fallback in prospect-facing scripts.
4. **Facts are references, not text.** Prices, trial days, limits, plan gates, route paths and UI labels are *tokens* or *refs* resolved from the source of truth (`src/config/entitlements.ts`, `src/lib/marketing-plans.ts`, `src/lib/admin-locale/*`, the Next route tree), so content cannot drift silently from the product.
5. **Claims are traceable.** Every product assertion in a script points to a claim record with evidence and a verification commit.
6. **No secrets and no PII** in playbook content. Persona cards and examples are fictional.
7. **Rep-private by construction.** Playbook content and demo notes are never rendered in any prospect-facing surface (master plan §7).

### 14.2 Package layout and versioning

**Authoring format (recommended):** version-controlled structured files (JSON or YAML, one file per entity) authored in-repo, validated by a script, then *imported* as a `DRAFT` version into the database for Super Admin review/publish. This keeps the content reviewable by pull request while honouring "Super Admin edits/publishes versions".

```
sales-playbook/                      (illustrative path; location is Agent 3's decision)
  manifest.json                      playbookId, version, schemaVersion, locales, hash
  registries/needs.json              need keys + definitions
  registries/profile.json            software_state, size_band, ... enums
  registries/objections.json         objection ids + concern-tag mapping
  registries/outcomes.json           outcome and reason codes
  claims/claims.json                 claim records with evidence
  tokens/tokens.json                 token definitions and sources
  steps/demo.frame.json              one file per step id
  steps/demo.booking.json            ...
  variants/p1-paper.json             adaptation rules per variant
  objections/obj.price.json          one per objection
  discovery/questions.json           question bank
  followup/templates.json            recap/follow-up/closing scripts (internal; not outbound email templates)
  academy/modules/a0-orientation.json
  academy/assessments/a0.json
  glossary.json
```

**Version metadata**

| Field | Rule |
|---|---|
| `playbookId` | Stable string, e.g. `garageos.sales`. |
| `version` | SemVer `MAJOR.MINOR.PATCH`. **MAJOR** = pricing/product capability/process/compliance change that invalidates earlier guidance. **MINOR** = new/changed step, fact, objection answer, question. **PATCH** = wording/translation/typo. Matches the recertification rules in §12.3. |
| `schemaVersion` | Version of *this contract*; the importer rejects unknown major schema versions. |
| `status` | `DRAFT → IN_REVIEW → APPROVED → PUBLISHED → SUPERSEDED / RETIRED`. Exactly one `PUBLISHED` "current" per `playbookId`; older versions stay readable. |
| `contentHash` | SHA-256 of canonical JSON. Used to detect drift and to guarantee immutability. |
| `sourceCommit` / `verifiedAtCommit` | Repository commit the product facts were verified against. |
| `locales` | Required: `["en-CA","fr-CA"]`. |
| `createdBy`, `reviewedBy`, `approvedBy`, `publishedAt` | Audit trail; approval by Super Admin (master plan §7). |
| `changelog` | Human-readable list; required for MINOR/MAJOR. |
| Rollback | Re-publish the previous content as a **new** higher version (never mutate or un-publish history). |

### 14.3 Step contract

**Step ID convention:** `<area>.<kebab-name>`, lower-case, never reused or renumbered. Areas: `demo.*`, `discovery.*`, `closing.*`. Initial step IDs:

| ID | This document | Base order |
|---|---|---:|
| `demo.frame` | D1 | 1 |
| `demo.booking` | D2 | 2 |
| `demo.day-agenda` | D3 | 3 |
| `demo.customer-vehicle` | D4 | 4 |
| `demo.inspection` | D5 | 5 |
| `demo.estimate-approval` | D6 | 6 |
| `demo.work-order` | D7 | 7 |
| `demo.invoice-payment` | D8 | 8 |
| `demo.follow-up-retention` | D9 | 9 |
| `demo.business-tools` | D10 (with optional sub-blocks `reports`, `inventory`, `tire-storage`, `organization`, `team`, `import`, `domain`) | 10 |
| `demo.plan-next-step` | D11 | 11 |

```ts
type Locale = "en-CA" | "fr-CA";
type LocalizedText = Record<Locale, string>;          // both required to publish
type Depth = "FULL" | "COMPACT" | "MENTION" | "SKIP";
type EvidenceStatus = "IMPL" | "IMPL_PLAN_GATED" | "LIMIT" | "PLANNED" | "NO";
type NeedKey = "booking" | "quotes_invoices" | "work_orders" | "dvi" | "communications"
             | "retention" | "inventory" | "reporting" | "multi_location";

interface PlaybookStep {
  id: string;                         // "demo.estimate-approval"
  kind: "frame" | "feature" | "business-tools" | "close";
  baseOrder: number;
  title: LocalizedText;
  objective: LocalizedText;
  durationSec: { target: number; min: number; max: number };
  needs: { primary: NeedKey[]; support: NeedKey[] };
  prerequisites: string[];            // step ids that must appear earlier at least at COMPACT depth
  alwaysInclude?: boolean;            // frame and plan-next-step
  depths: Partial<Record<Exclude<Depth,"SKIP">, {
    durationSec: number;
    show: string[];                   // ids of `blocks` to present at this depth
  }>>;
  features: FeatureRef[];
  prep: ChecklistItem[];
  blocks: ScriptBlock[];              // the talk track, ordered
  questions: PlaybookQuestion[];
  buyingSignals: LocalizedText[];
  objections: string[];               // objection ids likely at this step
  transition: LocalizedText;
  fallbacks: FallbackRef[];           // safe alternatives (public /demo assets, captures)
  claimIds: string[];                 // every product assertion made in blocks
  notes?: LocalizedText;              // rep-private
}

interface FeatureRef {
  id: string;                         // "booking.public-page"
  status: EvidenceStatus;
  capabilityKey?: string;             // key of CAPABILITY_MIN_PLAN; minPlan is DERIVED, never copied
  navigation: NavRef[];
  limits?: LocalizedText[];           // honest caveats shown to the rep
}

interface NavRef {
  route: string;                      // template, e.g. "/admin/quotes/[id]" — must match the Next route tree
  labelKey?: string;                  // e.g. "layout.nav.quotes" → resolved from admin-locale dictionaries
  settingsTab?: string;               // e.g. "booking-page"
  verifiedAt: string;                 // ISO date
  verifiedAtCommit: string;
}

interface ScriptBlock {
  id: string;
  role: "say" | "show" | "ask" | "do-not-say" | "transition";
  text: LocalizedText;                // supports tokens {{...}} and ui refs {{ui:...}}
  audience?: "rep-only";              // all playbook text is rep-only; field kept for future shared content
}

interface PlaybookQuestion {
  id: string;
  text: LocalizedText;
  needKeys: NeedKey[];                // "listen for" mapping
  required?: boolean;
}

interface FallbackRef { kind: "public-demo" | "capture" | "static-pdf"; ref: string; note?: LocalizedText; }
interface ChecklistItem { id: string; text: LocalizedText; }
```

### 14.4 Demo run and step outcomes (progress tracking contract)

```ts
interface DemoRunPlan {                         // computed at planning time, then editable by the rep
  playbookVersionId: string;
  effectiveLanguage: "FR" | "EN";               // snapshot; never rewritten
  variantIds: string[];                         // ["P3"] or composite ["P6","P3","P1"]
  needsSnapshot: { needKey: NeedKey; severity: 0|1|2|3; provenance: "VERIFIED"|"INFERRED" }[];
  budgetSec: number;                            // 900 | 1500 | 1800 | 2100
  steps: { stepId: string; depth: Depth; plannedSec: number; reason: string }[]; // ordered
  overrides: { by: string; at: string; reason: string }[];
}

interface DemoStepOutcome {
  demoRunId: string;
  stepId: string;
  plannedDepth: Depth;
  actualDepth: Depth | "DEFERRED";
  startedAt?: string; durationSec?: number;
  interest?: 0|1|2|3;
  skipReason?: "NOT_RELEVANT" | "TIME" | "PROSPECT_REQUEST" | "TECH_ISSUE";
  objections: { objectionId: string; intensity: 0|1|2|3; resolved: boolean }[];
  privateNote?: string;                         // rep/manager/Super Admin only
}

interface DemoRun {
  id: string;
  prospectId: string; opportunityId: string; repStaffId: string;
  salesDemoId?: string;                         // link to the existing technical SalesDemo
  plan: DemoRunPlan;
  mode: "IN_PERSON" | "VIDEO" | "PHONE";
  startedAt: string; endedAt?: string;
  outcome?: { nextStep?: { type: string; dueAt?: string }; recommendedPlan?: "CORE"|"PRO"|"COMPLETE";
              billingInterval?: "MONTH"|"YEAR"; outcomeCode?: "WON"|"LOST"|"UNQUALIFIED"|"DO_NOT_CONTACT"; reason?: string };
  needsDelta: { needKey: NeedKey; severity: number; provenance: string }[];
}
```

**Adaptation rules (normative, implement as data + a small pure function):**

1. Take `CrmProspectNeed` rows for the opportunity; keep rows with `severity ≥ 1`; sort by severity desc, `VERIFIED` before `INFERRED`, then a stable need order.
2. Top three = *must-win* needs.
3. For every step compute depth: `FULL` if it is `primary` for a must-win need; else `COMPACT` if `support` for a must-win need **or** a prerequisite of a `FULL` step; else `MENTION`; `SKIP` only if explicitly allowed by the selected variant. Steps with `alwaysInclude` are never `SKIP`.
4. Order: `demo.frame` first; then must-win steps in descending severity subject to `prerequisites`; then remaining steps by `baseOrder`; `demo.plan-next-step` last.
5. Fit to `budgetSec`: if the sum of depth durations exceeds the budget, downgrade `MENTION → SKIP`, then `COMPACT → MENTION`, then drop `demo.business-tools`; never remove `alwaysInclude` or a must-win `FULL` step; if still over, mark the plan `OVER_BUDGET` and require a rep decision.
6. Variant selection (§6.2) is a *label and an emphasis pack* (extra lines, honesty reminders), applied after steps 1–5; composite variants are allowed.

```json
{
  "id": "P3",
  "title": { "en-CA": "Phone-booking pain", "fr-CA": "Prise de rendez-vous par téléphone" },
  "match": { "anyOf": [ { "need": "booking", "minSeverity": 2 } ] },
  "priority": 60,
  "stepOverrides": [
    { "stepId": "demo.booking",   "minDepth": "FULL" },
    { "stepId": "demo.day-agenda","minDepth": "FULL" }
  ],
  "emphasisBlocks": ["p3.calls-per-day", "p3.avoid-deposit-claims"]
}
```

### 14.5 Registries

**Needs** (`NeedKey`) — nine keys, definitions in §4.6; **severity** `0..3`; **provenance** `VERIFIED | INFERRED`.

**Profile dimensions** (§4.5): `software_state` {`PAPER`,`SPREADSHEET`,`GENERIC_TOOLS`,`COMPETITOR`,`UNKNOWN`}; `size_band` {`SOLO`,`SMALL`,`MID`,`LARGE`}; `location_count` int; `language` {`FR`,`EN`,`UNKNOWN`}; `digital_maturity`; `specialisation[]`; `seasonality`.

**Objections** (IDs and the concern tag that triggers them):

| Objection id | Concern tag | Section |
|---|---|---|
| `obj.price` | `price` | 7.1 |
| `obj.existing-software` | `existing_software` | 7.2 |
| `obj.migration` | `migration` | 7.3 |
| `obj.adoption` | `adoption` | 7.4 |
| `obj.no-time` | `time` | 7.5 |
| `obj.customer-booking-preference` | `customer_prefers_phone` | 7.6 |
| `obj.security-reliability` | `trust_security` | 7.7 |
| `obj.sms-email` | `sms_email` | 7.8 |
| `obj.contract-subscription` | `contract` | 7.9 |
| `obj.think-about-it` | — | 7.10 |
| `obj.competitor-feature` | — | 7.11 |

**Outcome codes and reasons:** §8.8. **Depth/skip reasons:** §14.4.

### 14.6 Translations

- **Locales:** `en-CA`, `fr-CA` (BCP-47). The rep's UI locale is independent of the demo's `effectiveLanguage` (master plan §4).
- **Completeness:** a version cannot be `APPROVED` unless every `LocalizedText` has both locales, a non-empty string, and `translationStatus ∈ {AUTHORED, TRANSLATED, REVIEWED_NATIVE}` with reviewer/date for `REVIEWED_NATIVE`. Customer-facing wording in French requires `REVIEWED_NATIVE` before `PUBLISHED`.
- **Tokens:** `{{price.PRO.monthly}}`, `{{price.CORE.yearly}}`, `{{trial.days}}`, `{{limits.CORE.users}}`, `{{limits.import.basicRows}}`, `{{sms.allowance.PRO}}` (flagged `provisional`) resolve at render time from `PLAN_PRICING_CAD`, `TRIAL_DAYS`, `PLAN_LIMITS`, `IMPORT_LIMITS`. **Literal prices or limits in content are a validation error.** Formatting is locale-aware (`199 $` vs `$199`).
- **UI label refs:** `{{ui:nav.workOrders}}` resolve from the admin-locale dictionaries (`AdminLocale` `en`/`fr`) so the script always matches the screen. Where the product's own labels are inconsistent (e.g., *Prêt pour la récupération* vs marketing *Prêt à récupérer*), the playbook follows the screen.
- **Placeholders:** ICU-style `{name}` variables must match across locales (a checker compares the set of placeholders).
- **Terminology enforcement:** `glossary.json` (§9.4) lists preferred and forbidden terms per locale; a linter flags forbidden terms (e.g., *devis*, *email* in `fr-CA` customer-facing text).
- **Snapshotting:** `DemoRun.plan.effectiveLanguage` and the `playbookVersionId` are stored when the run starts.

### 14.7 Claims registry and content lifecycle

```json
{
  "id": "claim.payments.recorded-not-processed",
  "text": { "en-CA": "GarageOS records payments the shop collected; it does not charge customers' cards.",
            "fr-CA": "GarageOS consigne les paiements encaissés par l'atelier; il ne traite pas les cartes des clients." },
  "status": "NO",
  "evidence": [
    { "type": "code", "path": "src/domain/fiscal.ts", "symbol": "PAYMENT_METHODS", "verifiedAtCommit": "729f14d" },
    { "type": "doc",  "path": "src/lib/marketing-resources.ts", "note": "estimate-to-invoice guide" }
  ],
  "owner": "platform-admin",
  "reviewAfter": "2027-01-09"
}
```

- Steps/objections reference `claimIds`. **A script that asserts something without a claim fails validation.**
- **Staleness:** a nightly or pre-publish check compares each claim's evidence paths to `verifiedAtCommit`; if the file changed, the claim is `STALE` and any version that references it cannot be published until re-verified.
- **Product-change workflow:** when a PR changes `src/config/entitlements.ts`, `src/lib/marketing-plans.ts`, `src/lib/admin-locale/layout.ts`, the sidebar, the route tree or `docs/subscription-plans.md`, the playbook validator should fail or warn, opening a content-review task.
- **Feedback loop:** objection frequency by variant, step skip rates and rep-reported "unverified claim" flags feed a content backlog; resulting edits follow the version rules (§14.2).

### 14.8 Training content contract

```ts
interface AcademyModule {
  id: string;                                   // "academy.a5-core-demo"
  order: number; title: LocalizedText; objectives: LocalizedText[];
  estMinutes: number;
  items: ModuleItem[];                          // ordered
  prerequisites: string[];
  readiness: { assessmentId?: string; passMarkPct?: number; observation?: { minScore: number; zeroForbiddenLines?: number[] } };
  eventKeys: string[];                          // tracking events emitted (see §12.2)
}
type ModuleItem =
  | { type: "reading"; ref: string }                         // section anchors in the playbook
  | { type: "exercise"; id: string; prompt: LocalizedText; reviewer: "SELF"|"PEER"|"MANAGER" }
  | { type: "roleplay"; id: string; personaId: string; rubric: string }
  | { type: "lab"; id: string; environment: "TRAINING_ONLY"; steps: LocalizedText[] }
  | { type: "assessment"; id: string };

interface AssessmentItem {
  id: string; moduleId: string; type: "mcq"|"multi"|"short"|"scenario"|"ordering";
  prompt: LocalizedText; options?: { id: string; text: LocalizedText; correct?: boolean }[];
  keyRationale: LocalizedText; claimIds?: string[]; needKeys?: NeedKey[]; difficulty: 1|2|3;
  gradedBy: "AUTO" | "MANAGER";
}
```

Randomise option and item order per attempt (seed stored). Subjective items are `MANAGER`-graded with the rubric in §11.2. Assessment answer keys are never exposed to the client before a pass.

### 14.9 Publish-gate validations (all must pass)

1. Schema validity; unknown fields rejected; `schemaVersion` supported.
2. Every `LocalizedText` has both locales; placeholder sets match; no forbidden glossary terms; French customer-facing text `REVIEWED_NATIVE`.
3. No literal price, trial length, limit or SMS allowance in text; tokens resolve.
4. Every `NavRef.route` exists in the Next route tree (template match); every `settingsTab` exists in the settings tab list; every `labelKey` resolves in both admin locales.
5. Every `capabilityKey` exists in `CAPABILITY_MIN_PLAN`; displayed plan badges are derived, not typed.
6. Every `FeatureRef.status` consistent with its claim records; no `PLANNED` feature appears in a `say` block.
7. Every `say` block that asserts a product fact has `claimIds`; no `STALE` claims.
8. Step graph: IDs unique and stable versus the previous published version (no deletions without a MAJOR bump; deprecations are marked); prerequisites acyclic and reference existing steps; the base order is complete (`1..n`).
9. Time budgets: the sum of base `target` durations of steps with `baseOrder ≤ 11` is within 1,500–2,100 s; each depth has a duration.
10. Variant rules reference existing needs/steps; every need key is primary for at least one step.
11. Objection set includes the nine required ids; each has EN/FR responses, `show` references and a `do-not-say` block.
12. Academy: every module has a readiness rule; every assessment item has a key and rationale in both locales; every `claimId` in assessments exists.
13. No secrets or PII patterns (emails, phone numbers, tokens) in any text.
14. `contentHash` recomputed matches; the version number is greater than the current published version and bumped correctly versus the diff classification.
15. Changelog present for MINOR/MAJOR.

### 14.10 Example (excerpt)

```json
{
  "id": "demo.estimate-approval",
  "kind": "feature",
  "baseOrder": 6,
  "title": { "en-CA": "Estimate and customer approval", "fr-CA": "Soumission et approbation du client" },
  "objective": {
    "en-CA": "Show a professional estimate the customer can accept on their phone without logging in, with the decision recorded.",
    "fr-CA": "Montrer une soumission professionnelle que le client peut accepter sur son téléphone sans se connecter, avec la décision consignée."
  },
  "durationSec": { "target": 240, "min": 180, "max": 300 },
  "needs": { "primary": ["quotes_invoices"], "support": ["communications", "work_orders", "dvi"] },
  "prerequisites": ["demo.customer-vehicle"],
  "depths": {
    "FULL":    { "durationSec": 240, "show": ["editor", "send", "customer-view", "status"] },
    "COMPACT": { "durationSec": 90,  "show": ["customer-view", "status"] },
    "MENTION": { "durationSec": 20,  "show": ["one-liner"] }
  },
  "features": [
    {
      "id": "quotes.customer-approval",
      "status": "IMPL",
      "navigation": [
        { "route": "/admin/quotes/[id]", "labelKey": "layout.nav.quotes", "verifiedAt": "2026-10-09", "verifiedAtCommit": "729f14d" },
        { "route": "/quote/[token]", "verifiedAt": "2026-10-09", "verifiedAtCommit": "729f14d" }
      ],
      "limits": [
        { "en-CA": "SMS sending needs a GarageOS-provisioned shop number; do not stage a live send.",
          "fr-CA": "L'envoi par SMS exige un numéro d'atelier fourni par GarageOS; ne pas mettre en scène un envoi réel." }
      ]
    }
  ],
  "blocks": [
    {
      "id": "say.main",
      "role": "say",
      "text": {
        "en-CA": "Send it by email or text. The customer opens a page with your name and logo — no account — and taps Accept. GarageOS stores what they saw and when, and you get notified.",
        "fr-CA": "Envoyez-la par courriel ou par texto. Le client ouvre une page à votre nom et à votre logo — sans compte — et appuie sur Accepter. GarageOS conserve ce qu'il a vu et quand, et vous êtes avisé."
      }
    },
    {
      "id": "dont.approval-history",
      "role": "do-not-say",
      "text": {
        "en-CA": "Do not navigate to an \"approval history\" screen: the admin has no list of approval decisions.",
        "fr-CA": "Ne pas naviguer vers un écran « historique d'approbation » : l'administration n'a pas de liste des décisions."
      }
    }
  ],
  "objections": ["obj.competitor-feature", "obj.sms-email"],
  "claimIds": ["claim.quote.accept-without-login", "claim.quote.staff-notified", "claim.sms.needs-shop-number"],
  "fallbacks": [ { "kind": "capture", "ref": "11-estimate-customer-mobile" } ]
}
```

### 14.11 Mapping to the master plan's models (names to be confirmed after Agent 1)

| Master-plan model | This contract | Notes |
|---|---|---|
| `CrmPlaybook` | `playbookId`, title, owner | One per playbook family. |
| `CrmPlaybookVersion` | version metadata (§14.2) + content JSON (or normalised children) | Immutable once `PUBLISHED`; `contentHash`. |
| `CrmPlaybookStep` | `PlaybookStep` (§14.3) + localized children | `stepId` is the stable key across versions. |
| `CrmProspectNeed` | **input** to adaptation: `needKey`, severity 0–3, provenance, evidence | **Agent 1 contract needed** (§16.4): enum vs string for `needKey`; storage of severity/provenance. |
| `CrmTrainingProgress` | §13.1 + §14.8 | Per staff, per version, per locale. |
| `CrmDemoRun` | `DemoRun` + `DemoRunPlan` | Links `salesDemoId` (existing) and the Agent 1 opportunity. |
| `CrmDemoStepOutcome` | `DemoStepOutcome` | One per step per run. |
| Staff identity | `repStaffId` | From Agent 1's platform-staff model (not tenant `Role`). |
| Permissions | `prepare_demo`, `manage_playbooks`, `view_team_reporting` (master plan §3) | Server-side checks on every read/write. |

---

## 15. How the eventual Agent 3 implementation will consume this playbook

### 15.1 Phasing and gates

| Phase | Work | Gate to start |
|---|---|---|
| **0 — now** | This document (content only) on a docs-only branch. | None. Not merged without approval. |
| **1 — Content package** | Convert §4–§13 into the structured files of §14.2; write the validator (§14.9) and persona fixtures (Appendix B); unit tests only. No UI, no schema. | Playbook content approved by the platform administrator. |
| **2 — Models and import** | Add Academy/Playbook/DemoRun Prisma models and an additive migration; import the package as a `DRAFT` version; admin publish flow. | **Agent 1 merged and deployed**; integration contracts in §16.4 confirmed in writing; no conflict with Agent 2 files (shared nav, auth, migrations) — otherwise serialise after Agent 2 (master plan §10). |
| **3 — Academy** | `/platform/sales/academy` consuming `AcademyModule`s, assessments and progress (§13.1); manager views. | Phase 2 + platform-staff authorization from Agent 1. |
| **4 — Demo Assistant** | A collapsible, private panel for the rep inside a live demo: computes `DemoRunPlan` from `CrmProspectNeed`, shows the current step's blocks (script, questions, objections, fallbacks), captures `DemoStepOutcome` and objections. Never visible in prospect-facing views. | Phase 3 + stable `CrmProspectNeed` and SalesDemo ↔ opportunity link. |
| **5 — Conversion attribution and reporting** | Consume the existing Stripe-confirmed conversion; attribute Won, MRR (normalised), plan, interval; team dashboards. | Phase 4 + Agent 2 contracts for meetings/emails if linked. |

### 15.2 Integration points in the existing code (read-only references for the later phase)

| Concern | Existing artefact | How the playbook uses it |
|---|---|---|
| Authorization | `requireSalesActor()`, `authorizedDemoSession()` in `src/lib/sales-demo.ts` (to be reworked by Agent 1) | Every playbook read/write must use the staff-permission layer from Agent 1, not tenant `Role`. |
| Active demo | `getCurrentDemo()`; `SalesDemoToolbar` (`src/components/sales-demo/SalesDemoToolbar.tsx`); `/admin/demo` | The Demo Assistant mounts where the toolbar mounts (`src/app/admin/(shop)/layout.tsx`, `src/app/admin/onboarding/layout.tsx`) as an extra, rep-only, collapsible element; it links `DemoRun.salesDemoId`. |
| Plan gates | `src/config/entitlements.ts` | `capabilityKey` → derived minimum-plan badges; the "Viewing" plan can be suggested per step (e.g., "switch to Pro for DVI photos"). |
| Labels | `src/lib/admin-locale/*` | `{{ui:…}}` resolution. |
| Public fallbacks | `src/lib/demo-journey.ts`, `public/demo/garage-laurent/*` | `FallbackRef` targets. |
| Conversion | `src/actions/sales-demo-conversion.ts`, `src/lib/sales-demo-conversion.ts`, `/admin/demo/convert`, `/activate-demo/[id]`, `/admin/activation-payment` | Closing steps link to the conversion screen; Won is **only** set from the Stripe-confirmed event path. |
| Needs | Agent 1 `CrmProspectNeed` | Adaptation rules input (§14.4). |
| Language | Agent 1 effective-language resolution (explicit override > contact > business > UNKNOWN) | `DemoRun.plan.effectiveLanguage` snapshot; `UNKNOWN` blocks starting a run until set. |
| Email/meeting contracts | Agent 2 (templates, meetings) | Referenced by IDs only; playbook never embeds outbound email templates. |

### 15.3 Tests the implementation should include

- **Validator tests:** one failing fixture per rule in §14.9.
- **Rule-engine tests with persona fixtures:** the eight personas in Appendix B map to expected `DemoRunPlan`s (the A6 key table is the oracle).
- **Authorization tests:** a rep cannot read another rep's demo notes or training records; managers are team-scoped; Super Admin global; tenant owners and shop staff get nothing; prospect-facing routes never include playbook data.
- **Immutability tests:** published versions cannot change; runs retain their version after a new publish.
- **Locale tests:** FR/EN completeness; `UNKNOWN` language requires a decision.
- **No-leak tests:** the demo shop's customer-facing pages (`/book/*`, `/quote/*`, `/portal/*`, `/admin/*` as the prospect) contain no playbook text.
- **Responsive/a11y:** assistant panel usable at 390 px / tablet / desktop; keyboard operable; does not cover the demo toolbar or primary navigation.

### 15.4 What the implementation must not do

Modify Agent 2's inbox/templates/calendar; add `SALES` to the tenant `Role`; mark Won from anything but Stripe-confirmed status; expose rep-private notes to prospect-facing UI; embed prices or limits as literals; start before Agent 1 is merged and deployed and the contracts in §16.4 are confirmed.

---

## 16. Known gaps, open questions and items to confirm

### 16.1 Verify in a running environment before the first live demo (rehearsal items)

I verified navigation, tab ids, route files, dictionary labels and plan gates **from the repository**. I did not run the application. A human must confirm in a rehearsal:

1. The label of each action I quoted from the dictionaries appears on screen in both EN and FR at the quoted place (e.g., **Create quote from findings**, **Create work order**, **Convert to invoice**, **Mark as paid**, **Send by email / SMS**, **Customer portal** card, **Open real Booking Page**).
2. After **Load quick demo scenario**, what each record looks like (client "Demo scenario", Toyota Corolla 2020 "DEMO", $120 single line) and that editing the tagged records as suggested in §5.2 behaves as described, including "Also remove this synthetic scenario batch".
3. The booking page shows slots for the demo shop with only the configuration steps in §5.2.
4. The Viewing selector changes gates immediately for DVI photos, reminder rules, campaigns, inventory, tire storage and advanced reports.
5. The Settings tab label for QuickBooks (the dictionary shows `QuickBooks`) and the exact `?tab=` values listed in §5.7.
6. `/demo` and `/demo/booking` are reachable in both languages and the invoice PDF opens.
7. The activation lab (A8) in the designated training environment end to end, including the one-minute resend cooldown and old-link invalidation.

### 16.2 Product and documentation observations (feedback only — no promises were made in this playbook)

- The **quick demo scenario is minimal**; a richer, clearly-marked scenario (realistic lines, an inspection, a pending estimate) would materially improve demos. The playbook works around it (§5.2).
- No **admin screen lists estimate approval decisions** (confirmed in `docs/demo-journey/validation.md`), though the help article "approval-history" (`src/lib/marketing-resources.ts`) suggests reviewing recorded decisions on the estimate. Align the article or the product.
- `docs/subscription-plans.md` still labels some implemented capabilities (advanced reports, DVI media, QuickBooks, Accounting Light) as "Future" in places, while `src/config/entitlements.ts` and `src/lib/marketing-plans.ts` implement and sell them. This playbook follows the code and the public plan copy.
- French labels for "ready for pickup" differ between the product (*Prêt pour la récupération*) and marketing (*Prêt à récupérer*).
- `docs/navigation-map.md` is stale (pre-Work Orders; Spanish). The sidebar source (`Sidebar.tsx`) was used instead.
- The Sales workspace is `SUPER_ADMIN`-only; the demo shop's SMS path would use the shared number (not provider-validated).
- The prepared demo shop is a 30-day object; the playbook assumes one prepared shop per prospect.

### 16.3 Decisions needed from the platform administrator (the playbook states the safe default)

| # | Question | Safe default used here |
|---|---|---|
| 1 | Is Stripe live billing open for first customers, and from when? | Not assumed; confirm in writing before selling (§2.4). |
| 2 | Is there any discount, launch offer or free-month policy? | None — reps may not offer any (§7.1). |
| 3 | What exactly do "assisted onboarding" (Pro/Complete), "white-glove onboarding" and "standard data migration" (Complete) include? | Not defined; reps say "included in the plan; I'll confirm scope in writing". |
| 4 | Multi-Shop additional-location price and billing method? | "Confirmed with your plan"; escalate (§2.1). |
| 5 | Final SMS allowances and overage price? | Provisional figures only; confirm before quoting. |
| 6 | A written, approved security/backup/data-location statement for prospects? | None; reps share the privacy policy and escalate (§7.7). |
| 7 | Reference/testimonial/case-study policy once there are customers? | None allowed. |
| 8 | Designated training environment (Stripe test mode, internal recipients)? | Required for A8; not assumed to exist. |
| 9 | Call-recording policy and storage? | Do not record without consent; storage per CRM process. |
| 10 | Legal review of scripts, including telemarketing and CASL treatment of each outreach type? | Scripts are conversation-only; written outreach waits for Agent 2 and legal review. |
| 11 | Who is the contact for prospect privacy/security questionnaires and Law 25 requests? | The privacy officer named in `docs/operations-runbook.md` / compliance docs. |
| 12 | Native-speaker review of the French copy? | Required before this version is `PUBLISHED` (§14.6); the French here has not been reviewed by an independent native reviewer. |

### 16.4 Integration contracts to confirm with Agent 1 (before Phase 2) and Agent 2 (before reconciliation)

**Agent 1:** (1) the actual name, location and type of the prospect/opportunity/contact/need models and a stable `needKey` representation (string vs enum) with `severity` 0–3 and `provenance`; (2) the platform-staff identity and permission helpers (including `prepare_demo`, `manage_playbooks`, `view_team_reporting`) and their server-side usage; (3) the relation between an opportunity and `SalesDemo` (`currentDemoId`) and whether one opportunity can have several demos; (4) language fields (business/contact override/`UNKNOWN`) and resolution helper; (5) audit event API; (6) navigation registry changes in `PlatformChrome`/`AdminSidebar`/`routes.ts` and the final URL of the academy; (7) migration ordering and naming; (8) test harness for platform authorization.

**Agent 2:** (1) the reference format for email templates and meetings; (2) whether the meeting object carries a `playbookVariant` hint; (3) event hooks when a meeting is booked so a `DemoRun` can be pre-planned; (4) file ownership to avoid conflicts.

### 16.5 Risks

- **Content drift** as the product evolves → mitigated by the claims registry and validators (§14.7), not by memory.
- **Overclaiming under pressure** → rules in §1, coaching rubric lines 6 and 8, immediate correction policy (§10).
- **French quality** → mandatory native review.
- **Demo failures** from provider-dependent steps → fallbacks in §5.2.
- **Launch-state ambiguity** → explicit gate in §2.4 and D0.

---

## Appendix A — Source index (verified at `729f14d`)

| Topic | Files |
|---|---|
| Plans, gates, limits, prices | `src/config/entitlements.ts`, `src/lib/marketing-plans.ts`, `src/lib/marketing-pricing.ts`, `docs/subscription-plans.md` |
| Navigation and labels | `src/components/layout/Sidebar.tsx`, `src/lib/routes.ts`, `src/lib/admin-locale/layout.ts`, `src/lib/admin-locale/settings.ts`, `src/app/admin/(shop)/settings/page.tsx` |
| Route tree | `src/app/**/page.tsx` |
| Demo tooling | `src/lib/sales-demo.ts`, `src/actions/sales-demo*.ts`, `src/components/sales-demo/*`, `src/lib/admin-locale/sales-demo*.ts`, `src/domain/sales-demo.ts`, `src/emails/SalesDemoActivationEmail.tsx`, `docs/sales-demo-implementation-plan.md`, `docs/sales-demo-wave-3-validation.md` |
| Public demo | `src/lib/demo-journey.ts`, `src/lib/marketing-flow.ts`, `public/demo/garage-laurent/*`, `docs/demo-journey/validation.md` |
| Import | `src/domain/import.ts`, `src/lib/import-service.ts`, `src/lib/marketing-resources.ts` (guide) |
| Payments | `src/domain/fiscal.ts`, `src/lib/marketing-resources.ts` |
| Campaign segments | `src/lib/communications/segments.ts`, `src/lib/admin-locale/campaigns.ts` |
| Notifications and SMS | `docs/notifications.md`, `docs/communications-activation-todo.md`, `src/domain/sms.ts` |
| Reports | `src/lib/admin-locale/reports.ts`, `src/app/admin/(shop)/reports/page.tsx` |
| Launch state and providers | `docs/launch-readiness.md`, `docs/operations-runbook.md` |
| Compliance | `docs/compliance/casl-matrix.md`, `subprocessors.md`, `privacy-governance.md`, `privacy-request-procedure.md` |
| Terms | `src/app/terms/page.tsx`, `src/app/privacy/page.tsx` |

## Appendix B — Persona cards (fictional; for role-play and test fixtures)

Hidden needs list `key / severity`. The expected variant is the answer key for A6 and for rule-engine fixtures.

| ID | Persona | Language | Shop | Software / state | Hidden needs | Traps | Expected variant |
|---|---|---|---|---|---|---|---|
| `persona.marcel` | Marcel, owner | FR | 2-bay, 2 staff, 1 location | Paper binder | `quotes_invoices` 3, `retention` 2, `booking` 1 | Fears computers; asks "can you move my old invoices?" | P1 + P6 |
| `persona.julie` | Julie, owner/manager | FR→EN | 4-bay, 4 staff | Google Calendar + notebook | `booking` 3, `communications` 2 | Wants deposits; "customers love to call" | P3 |
| `persona.pierre` | Pierre, owner | FR | 6-bay, 7 staff | Competitor package, contract ends March | `communications` 2, `reporting` 2, `dvi` 2 | Wants card processing inside; won't switch mid-season | P2 |
| `persona.lise` | Lise, bookkeeper + co-owner | FR | 3 staff | Spreadsheet + QuickBooks | `quotes_invoices` 3, `reporting` 3 | Asks "is it Law 25 / CASL compliant?" | P4 |
| `persona.karim` | Karim, owner | EN | 3-bay | Basic invoicing app | `retention` 3, `communications` 3 | Wants SMS campaigns | P5 |
| `persona.dave` | Dave, service manager | EN | 8 techs | Competitor package | `work_orders` 3, `dvi` 3, `inventory` 2, `reporting` 2 | Technicians resist typing; "Is there a kanban board?" | P7 |
| `persona.helene` | Hélène, group owner | FR/EN | 2 locations | Different tools per location | `multi_location` 3, `reporting` 3 | "Shared customer database?"; asks per-location price | P8 |
| `persona.tony` | Tony, solo mechanic-owner | EN | 1-bay, alone | Excel + phone | `booking` 3, `quotes_invoices` 2 | "I have no time"; evenings only | P6 shell + P3 order + P1 reassurance |

## Appendix C — Version history

| Version | Date | Change |
|---|---|---|
| 0.1.0 | 2026-10-09 | First complete draft: discovery, demo, adaptive variants, objections, closing, curriculum, tracking requirements, structured contract. Not yet reviewed by an independent native French reviewer or approved by the platform administrator. |
