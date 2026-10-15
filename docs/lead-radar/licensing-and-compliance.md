# Licensing, attribution and compliance

*Not legal advice. Conclusions rest on fields observed in the data; the official Overture licensing page was unreachable from the build sandbox. Confirm with counsel before the first production import.*

## Source policy (enforced in code: `domain/lead-radar/license.ts`)
A candidate is importable **only if every upstream source behind the record** has a licence on the allow-list:
`CDLA-Permissive-2.0`, `Apache-2.0`, `CC0-1.0`, `MIT`, `BSD-3-Clause`, `CC-BY-4.0`. Missing, unknown, share-alike or non-commercial licences, and any
OpenStreetMap-derived dataset (whatever licence string it carries), set `licenseOk=false`. A licence-blocked candidate can be viewed but **cannot be approved**
(API refuses it, and a database CHECK constraint forbids `APPROVED` with `licenseOk=false` or tier `EXCLUDED`).

| Provider | Status | Persisted fields |
|---|---|---|
| Overture Maps Places | **Enabled** (staging only; import needs human approval) | name, address, phone, website, email, category, confidence, licence + dataset names, release |
| Directly supplied CSV | Existing CSV wizard (unchanged; requires a lawful-source note) | owner-governed |
| OpenStreetMap | **Disabled.** ODbL share-alike/attribution obligations need an owner/legal decision; OSM-derived records are blocked even if they appear inside Overture. | — |
| Google Places | **Not implemented.** Google's terms restrict storing content other than place IDs; no verified price list; no credentials. The policy registry lists it as `id`-only. | place id only (if ever added) |

## What is stored — and what never is
Stored per candidate: the fields above, normalised, plus the Overture `id` (GERS), the release, licences and dataset names. **Never stored:** the raw record,
unknown/extra fields (stripped by the zod schema), upstream `record_id`s, social URLs as websites, source `update_time`, geometry. Audit events and run
diagnostics contain ids, counts and codes only. Tests assert that an injected unknown field never reaches the database.

## Attribution
Keep, and show where Overture-derived data is displayed or shared: *"Business data © Overture Maps Foundation and its source contributors"*; per-candidate
licences/datasets are visible in the review UI (Provenance). If data is ever redistributed outside GarageOS, retain the licence texts for CDLA-Permissive-2.0 and Apache-2.0
(and CC-BY-4.0 attribution if such records appear). Internal CRM use does not redistribute.

## CASL / outreach
* A published email address is **not consent** (CASL). Candidates show it as "published by source — not consent" (`EMAIL_UNVERIFIED`).
* Import never creates a `CrmSendingBasis`, contact person, sequence enrollment, thread, message, SMS, call task or field route (tested; static guard forbids those models in Lead Radar code).
* An email already on the suppression list (`CrmEmailSuppression`, not lifted) is **removed from the candidate** at staging.
* Existing DNC is untouched: matching prospects are enriched only in empty fields and their DNC/ownership/notes/activities/opportunities never change; a source opt-out can only be propagated, never cleared.
* The existing send-time guards (valid basis, suppression, unsubscribe) are unchanged and still decide whether anything can ever be sent.

## Security
Server-side auth on every action (static test asserts each guard); extractor contacts only the Overture bucket/STAC host and validates the release id (`^\d{4}-\d{2}-\d{2}(\.\d{1,3})?$`), so a plan cannot smuggle a URL or path; uploads are size/line bounded and schema-validated; no `fetch` exists in Lead Radar server code (asserted); no credentials are read by the extractor.
