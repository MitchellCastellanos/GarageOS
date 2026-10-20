# Sales Calling Workspace

`/platform/sales/calling` is one full-screen workstation: profile (left), softphone + notes + discovery (centre), sales actions (right), and an embedded e-mail drawer. It reuses the Voice backend (`docs/voice-calling.md`), the Sales CRM, and the Sales Comms composer — nothing is duplicated and nothing dials or sends by itself.

## Flow
1. **Next prospect** (`getNextProspect`) loads ONE prospect; it never calls. Due scheduled callbacks come first; otherwise a province-balanced random draw (below).
2. The seller reviews the profile, presses **Call**. The server re-runs every gate (`checkProspect`, hours, holds, DNC, cooldown, caps, one live call) and refuses a new call while an earlier call has no saved outcome (`DISPOSITION_PENDING`).
3. During the call: notes (draft kept in the browser per prospect), discovery (current software, pain points → real `CrmProspectNeed` rows, objections), decision-maker contact edit, e-mail capture, meeting, task, e-mail drawer. The call stays up while any panel/drawer changes.
4. Hang-up → mandatory disposition (`saveCallDisposition`, idempotent per session). A reload recovers it (`getCallingPage.pendingDisposition` + `resumeProfile`).
5. **Next prospect** again — an explicit click.

## Randomised national queue (`pickNextProspect`)
* Pool: the seller's own prospects only, REMOTE (`territoryState = NATIONAL`), `phoneEligibility = CALLABLE`, inside the seller's coverage, not DNC, not in a held province (`CrmVoiceSettings.heldProvinces`), no open task, no live call, no attempt inside the cool-down.
* Province choice: provinces whose **recipient-local calling window is open now**, weighted by √(eligible shops) (a province with 100× the shops is ~10× likelier, not 100×), ×0.25 for the province just worked. Prospect choice: a random offset inside that province. No global `ORDER BY random()`; the work is one grouped count (index `CrmProspect(assignedStaffId, phoneEligibility, province)`) plus one indexed `OFFSET` read.
* Due CALL tasks (callbacks) are offered first; future callbacks and any other open task keep a shop out of the random pool.
* Every candidate is re-validated live by the same gate as the dial. When nothing is callable, the answer carries the earliest opening computed from the calling-hours rule (`nextWindowOpening`), never an assumed time.
* Prospects that are callable but **unassigned** are not in anyone's queue; they need the normal acquisition/assignment first (ownership is never changed by the workspace).

## E-mail inside the call
* The drawer embeds the existing `Composer` (templates, EN/FR, signature, preview, draft, send, suppression, CASL decision). Insertions put real URLs into the editable body: seller booking link (`insertBookingLink`), short/full video (`insertVideoLink`, only a PUBLISHED outreach video), the public demo `/demo` and `/demo/booking`. The marketing site defines **no `#` anchors**, so none are used.
* **E-mail captured on the call** (`captureCallEmail`): saved on the contact; the reason is required (requested demo / booking details / information / no request). An address alone is never consent. A specific request records a scope-limited, 30-day `EXEMPT` basis ("answering the contact's request"; never usable by automation) through the same evidence rules as the contact page; like every documented basis it authorises nothing until the owner activates the automated CASL policy. The verdict returns a compliant next step (send / activate policy / record the request / call back instead / address suppressed). An address that differs from one with recorded evidence becomes its own contact; editing a contact's address revokes the old address's basis.
* After a send, `recordDemoSent` adds the DEMO activity only if the message exists, is the seller's, belongs to the prospect and really contains a demo/video link.

## Dispositions → CRM records
`CALL` activity (metadata: reason, next action, demo requested/sent, meeting scheduled) · follow-up `CrmTask` (type CALL, or EMAIL / FOLLOW_UP for a requested next action) · INTERESTED moves NEW/CONTACTED → ENGAGED through the pipeline's own stage change · DEMO activity when a demo was requested · DO NOT CALL = business + number suppression · WRONG NUMBER = number suppression · NOT INTERESTED needs a reason and does not close the opportunity (human decision).

## Tests
`tests/calling-selection-domain.test.ts`, `tests/sales-workspace-db.test.ts`, `tests/sales-workspace-email-db.test.ts` (fresh DB per file).

## Browsing and calling outside calling hours
* The workspace no longer hides prospects whose recipient-local window is closed. **Next prospect** prefers provinces that are open now, and falls back to any other eligible province (flagged "Outside calling hours"); **Previous / Next viewed** browse the prospects already opened. The full profile and history are always visible; loading never dials.
* Clicking **Call** outside the window opens a confirmation: "Are you sure you want to call outside calling hours? It is HH:MM at the call's destination (city, province)."
* The call is only placed if a Super Admin turned on **Calls outside calling hours** in Voice settings (audited gate, **off by default**) and the seller confirmed. The server re-checks the switch and the confirmation when Twilio connects, and records `outOfHours` in the session snapshot and audit. DNC, number suppression, held provinces, ownership, cooldown, caps and the one-live-call lock are unchanged.
* Reminder: CRTC Telemarketing Rules hours also apply to exempt B2B calls; enabling the switch is the owner's decision.
