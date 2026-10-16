# From a national qualified-business database to a legally reviewed email pipeline

**Status:** infrastructure for *discovery staging* and *readiness reporting* is built; **no sending, sequence or campaign is enabled and none is enabled by this work.** This is product/engineering guidance, **not legal advice**; items marked *Pending legal review* need a Canadian lawyer (CASL, Québec language rules, and privacy law).

## 1. A business is not a lead you may email

The ladder (domain `contact-readiness.ts`, funnel on `/platform/sales/lead-radar/national`) — each rung counts only prospects that cleared every rung before it:

| # | Rung | Where the truth lives | Built? |
|---|---|---|---|
| 1 | Qualified business | `CrmProspect.repairFit = VERIFIED_REPAIR`, active | Yes (PR #131/#133) |
| 2 | Contact discovered | `CrmDiscoveredContact` (staging) or `CrmContact` with an address | **Yes (new)** — Overture-published addresses are recorded automatically as PENDING |
| 3 | Contact source recorded | `source`, `sourceDataset`, `sourceUrl`, `capturedAt` on the discovered row (mandatory) or structured CASL evidence | **Yes (new)** |
| 4 | Email validated | syntax/shape + role/free-mailbox flags now; `mxStatus` column ready, **MX/SMTP check not built** | Partly |
| 5 | Language decided | `preferredLanguage` on contact/prospect; never defaulted, never guessed from province or name (existing rule) | Existing rule; **no automatic detection** |
| 6 | CASL basis reviewed | `CrmSendingBasis` structured evidence + second-person approval for published addresses (existing `evaluateSendingBasis`) | Existing |
| 7 | Suppression / DNC clear | `CrmEmailSuppression`, contact/prospect DNC, bounces (existing; staging already drops suppressed addresses) | Existing |
| 8 | Outreach ready | `CrmOutreachEligibility.decision = ELIGIBLE` (also requires owner, active seller with booking page, verified sender, FIELD-territory rule) | Existing |

Invariants (tested in `tests/contact-readiness-db.test.ts`): importing a prospect creates no contact; seeding creates no contact/basis/enrollment/message; **accepting** a discovered address creates a plain contact only; an excluded/DNC prospect or suppressed address can never be accepted; the funnel's last rung is read from the eligibility engine, never inferred.

A published address (Overture or a website) is **not consent**. Under CASL, commercial electronic messages need consent (express, or implied under narrow rules such as an existing business relationship or the *conspicuous publication* exception: address published without a "no unsolicited messages" statement **and** the message relates to the recipient's business role). The existing engine encodes this as a *reviewed* basis with evidence (URL, capture time, role relevance, no-restriction confirmation) and a second approver. *Pending legal review* of those rules and of the standard identification/unsubscribe content.

## 2. What is missing, in build order

| Step | What | Owner decision / dependency | Cost (estimate, not measured) |
|---|---|---|---|
| A | **Measure real coverage**: % of staged/imported candidates with a published email (`CrmDiscoveredContact` after the next automation cycle). Québec figure is **Not verified** — do not plan volume before this number exists. | none | CAD 0 |
| B | **Review UI** for PENDING discovered contacts (the server action `decideDiscoveredContact` exists; there is no list page yet) | none | engineering only |
| C | **MX check** (DNS, free) filling `mxStatus`; `NO_MX` addresses drop out of rung 4 | none | CAD 0 (runs in the worker) |
| D | **Website contact-page enrichment** worker: fetch the business website (respect robots.txt and terms, identify the bot, rate-limit), extract addresses with `sourceUrl` + `capturedAt`, write `CrmDiscoveredContact(source=WEBSITE_PAGE)`. Also gives a language signal (`<html lang>`, page text) that is stored as *evidence for a human*, not as a decision. | owner approval of crawling policy; legal review of the conspicuous-publication evidence it produces | GitHub Actions minutes: ≈ 1–3 s/site ⇒ ≈ 3–8 h per 10,000 sites (free on a public repo; otherwise within the 2,000 min/month plan only for small batches) |
| E | **Language evidence → decision**: reviewer confirms EN/FR per contact; Québec businesses are contacted in French by default *after a person confirms*, never automatically | owner + legal (Québec language rules) | engineering |
| F | **Paid enrichment/verification provider** (optional, e.g. contact-data or email-verification APIs) | **owner-only**: new paid provider, budget, privacy/ToS review; provider-sourced addresses still need their own recorded basis | per-credit pricing (typically fractions of a cent for verification, cents for contact data; **check current vendor prices**) — not activated |
| G | **Sender readiness per seller**: corporate sender identity, approved domain with SPF/DKIM/DMARC, **real inbound reply round trip**, booking page, bilingual templates with sender identification, postal address and a working unsubscribe honoured promptly | **owner-only** (Sales comms settings); founder's Sales Rep sender is *Pending owner action* | Resend/mail plan cost (not changed here); domain warm-up time (weeks) |
| H | **Legal sign-off** on basis rules, templates and retention | **Pending legal review** | legal fees |
| I | **Pilot** (existing, caps, REMOTE only, first touch only), then widen by evidence (reply/complaint/bounce rates) | **owner-only**; `sendingEnabled` and the pilot switch stay OFF until A–H | — |

## 3. Realistic limits
* Overture's `emails` field is sparse for small garages; many Canadian shops publish only a phone number and a Facebook page. Expect the email-capable share to be a minority until website enrichment exists — **measure it (step A) before committing a volume plan**.
* Role mailboxes (`info@`) are common and are not named recipients; they are flagged for the reviewer, not excluded automatically.
* Remote cold email works best on the cleanest slice (verified repair, decided language, valid MX, reviewed basis). Everything else stays phone/field.
* FIELD territories (Greater Montréal, Laval, Rive-Sud) are never a cold automated first contact (existing territory rule).
* Deliverability is earned (domain warm-up, low complaint rate); volume caps in the pilot are deliberately small.

## 4. Operating cost summary (all estimates)
Today's added infrastructure: **CAD 0** (open data, GitHub Actions within plan, no new provider). Optional later costs: verification/enrichment credits (step F), larger Actions budget if the repo is private and crawling is large, email-sending plan growth. None is activated.
