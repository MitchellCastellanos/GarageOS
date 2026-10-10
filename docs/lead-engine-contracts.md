# GarageOS Lead Engine — implementation notes and shared contracts (Agent 1)

Implements roadmap §P1/§P2/§D of [the Lead Engine roadmap](garageos-lead-engine-field-planner-roadmap.md). Agent 2 (Field Route Planner) builds on the contracts in §3. **Nothing here imports real data, sends email, enrols sequences or changes live territory rules.**

## 1. What exists

| Area | Where |
|---|---|
| Canonical address, quality, fingerprint | `src/domain/sales-crm/address.ts` |
| Branch-aware matching (pure) | `src/domain/sales-crm/dedupe.ts` |
| Import parsing, flexible column mapping, planner, fingerprints | `src/domain/sales-crm/import.ts`, `import-fields.ts` |
| Source observations + enrichment | `CrmSourceObservation`, `src/lib/sales-crm/lead-engine.ts` |
| Import actions (inspect → preview → confirm, report) | `src/actions/sales-import.ts` |
| Duplicate review | `CrmDuplicateReview`, `src/actions/sales-duplicates.ts`, `/platform/sales/prospects/duplicates` |
| Territory classification | `classifyTerritory` in `src/domain/sales-crm/territory.ts` |
| Auto-assignment (pure + server) | `domain/sales-crm/assignment.ts`, `lib/sales-crm/assignment.ts`, `actions/sales-assignment.ts`, `/platform/sales/prospects/assignment` |
| Commercial queues | `src/lib/sales-crm/queues.ts` (drives `listProspects` and counts) |
| CASL structured evidence + approval | `domain/sales-crm/casl-evidence.ts`, `domain/sales-comms/casl.ts`, `actions/sales-casl.ts`, `/platform/sales/prospects/evidence` |
| Migration | `prisma/migrations/20261012100000_lead_engine_foundation` (additive) |

### Import pipeline
`inspectProspectImport` (headers + EN/FR suggested mapping, writes nothing) → `previewProspectImport` (mapping, source key/URL, **required** lawful-source note, observed date; plans every row, returns per-row outcome, territory + assignment preview, stores a 24 h batch) → `confirmProspectImport` (compare-and-set claim, re-plans against live data inside one transaction, writes prospects/opportunities/contacts/observations/reviews, clears stored rows).

Row outcomes: `CREATE`, `LINK_EXISTING` (strong match or same source id), `LINK_IN_FILE`, `REVIEW` (ambiguous: held, nothing created), `ALREADY_IMPORTED`, `DUPLICATE_SOURCE_ID`.

* **Idempotency.** An observation is unique on `(sourceKey, recordKey, contentFingerprint)`. `recordKey` is `id:<source id>` when the file has an id column, otherwise `row:<sha256 of file>:<row>`. Same content again → `ALREADY_IMPORTED`; same id with changed content → one new observation linked to the same prospect.
* **No overwrite.** A matched prospect is only *enriched* in empty fields (address block as a unit); disagreements are recorded by field **name** in `conflicts`. Opt-outs from the source are propagated, never cleared. Owner, activities, opportunities untouched; enrichment is skipped if the importer cannot access the prospect.
* **Privacy.** Observation `snapshot` = business-level facts only (no contact persons, no email addresses, no raw row). Review items hold the pending candidate (incl. contact) only until decided.
* **Never consent.** The importer creates no `CrmSendingBasis`, no enrollment, no message.
* **Provider neutral.** Nothing refers to Airtable/GABAN/Lead Radar. Future adapters produce the same `ImportCandidate` shape and a `sourceKey`.
* XLSX is not supported (CSV only; the existing 2 MB / 2,000-row / 24 h limits are unchanged).

### Branch-aware matching rules (`classifyAgainstPool`)
Strong: same name + same civic address (or same compact postal). Name + city + a phone/domain that is unique in the pool, when addresses are unavailable. Ambiguous (review): same name+city with no addresses, same address with a different name plus a shared phone/domain, a shared phone/domain with no address data, two strong candidates. Different civic address / postal / city ⇒ **separate location** (reported as `BRANCH_OF_EXISTING`, never merged, never skipped). A shared domain or phone alone never merges. Two existing prospects are never merged by any code path; "distinct" decisions create a new prospect, "same" decisions attach provenance.

### Territories and assignment
* `classifyTerritory` → `LOCAL` | `NATIONAL` | `UNRESOLVED`. Québec without city/postal is `UNRESOLVED` (could be Greater Montréal) and is **never auto-assigned**.
* Auto-assignment only considers **unassigned, active, non-DNC** prospects with a resolved territory. Candidate sellers: active **reps** of the actor's team (Super Admin: all reps), `acceptsAutoAssignment`, optional `maxActiveLeads`, coverage, and `evaluateAcquisition` (so FIELD territories go to FIELD sellers while FIELD holds acquisition; elsewhere FIELD and REMOTE share, least-loaded first, deterministic). Managers are not auto-assigned (assign manually).
* Preview creates a `CrmAssignmentRun`; confirm re-validates each proposal (still unassigned, seller still allowed), is compare-and-set, audited per prospect, and skips anything that changed.
* **FIELD_PRIORITY** already existed (`priorityDays`, `priorityStartedAt`). It is configurable per territory; with no duration set FIELD never releases. **The seeded Greater Montréal rule is still `FIELD_EXCLUSIVE`; no duration was chosen.** Release to REMOTE only applies to *untouched* prospects (a FIELD agent's earlier touch keeps it with FIELD).

### CASL evidence
`CrmSendingBasis` gains `reviewStatus` (`NOT_REQUIRED`, `LEGACY_UNREVIEWED`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`), evidence type, source URL, capture date, supporting facts, role relevance, published-address confirmation, reviewer/time/note. `evaluateSendingBasis` (single policy function used by composer, sequences and dispatcher — unchanged transport) now requires `APPROVED` for `IMPLIED_PUBLISHED_ADDRESS` / `IMPLIED_DISCLOSED_ADDRESS`; pending/rejected evidence authorises nothing for any kind.

* **Migration policy.** Every existing row is stamped `LEGACY_UNREVIEWED` — never "verified". The change can only *reduce* what can be sent: legacy address-based bases stop authorising sends until a manager/Super Admin reviews fresh structured evidence. Express consent / existing relationship / exempt rows behave exactly as before (flagged "legacy" and listed in the *Eligibility review* queue).
* **Authority.** `approve_casl_evidence`: Sales Manager → only prospects **owned inside their team** (unassigned pool = Super Admin only); Super Admin → global; reps never. No one but a Super Admin approves evidence they recorded (audited as `selfApproved`). Compare-and-set, audited (`SENDING_BASIS_RECORDED/APPROVED/REJECTED`, entity `CrmSendingBasis`).
* **Concurrency.** Approve and reject run in one transaction that first takes a row lock on the prospect, re-reads the basis and the prospect's *current* owner, re-evaluates team authority, and writes with a compare-and-set that also matches that owner. A reassignment racing a decision either commits first (decision is refused as out-of-team) or waits for the decision to commit. Tested with a held reassignment transaction and a mutation check.
* **Reject ≠ approve.** `reviewAuthority` (capability, pending, team, self-review) is shared; `canApproveEvidence` adds the completeness check; `canRejectEvidence` does not look at evidence content, so incomplete evidence can always be rejected by an entitled reviewer.
* Impact of the legacy stamp on every basis kind through composer, enrollment, worker and dispatcher: see [lead-engine-legacy-basis-impact.md](lead-engine-legacy-basis-impact.md).
* A FIELD visit or an imported email never creates a basis. (Separate P0: FIELD_VISIT engagement semantics are **not** changed here — see "Not in scope".)

## 2. Schema summary (all additive)
New enums: `CrmAddressQuality`, `CrmTerritoryState`, `CrmObservationOutcome`, `CrmDuplicateReviewStatus`, `CrmAssignmentRunStatus`, `CrmBasisReviewStatus`, `CrmEvidenceType`. New tables: `CrmSourceObservation`, `CrmDuplicateReview`, `CrmAssignmentRun`. New columns: `CrmProspect` (address/territory derived columns), `CrmImportBatch` (source key/url, lawful note, observed date, mapping), `CrmSendingBasis` (evidence + review), `PlatformSalesStaff` (`acceptsAutoAssignment`, `maxActiveLeads`). One data statement: `UPDATE CrmSendingBasis SET reviewStatus='LEGACY_UNREVIEWED'`.

Rollback: all new columns are nullable/defaulted; dropping the new tables/columns restores the previous schema. Application rollback is safe on the new schema (old code ignores the columns), **except** that old code would again treat legacy address bases as valid — roll the code back only together with a decision on that.

## 3. Contracts for Agent 2 (Field Route Planner)

1. **Prospect identity.** `CrmProspect.id` is stable. Archive = `status: "ARCHIVED"` (+`archivedAt`); `mergedIntoId` is reserved and **no code merges prospects** — treat a non-null `mergedIntoId` as "follow the pointer". Route stops must reference prospect ids, never copy identity.
2. **Canonical address.** Use `canonicalAddress({address, city, province, postalCode})` or the stored columns `addressKey`, `postalKey`, `addressQuality`, `addressFingerprint`. Never parse address text yourself.
3. **Location quality.** `isRoutableAddress(addressQuality)` (`COMPLETE`/`PARTIAL`) = precise enough to geocode. `INCOMPLETE`/`UNKNOWN` ⇒ no stop. Coordinates, provider, accuracy and geocoded-at belong to **Agent 2's** `CrmProspectLocation`; store `addressFingerprint` there and invalidate coordinates when it differs from the prospect's current value. This branch creates **no** route/location/geocoding tables.
4. **Territory.** `territoryState` (`LOCAL`/`NATIONAL`/`UNRESOLVED`, null = not computed) and `territoryKey`, refreshed by every prospect create/update and import, and in bulk by `recomputeProspectDerived` (Super Admin, assignment screen) after rule changes. `classifyTerritory` / `requiredMode` / `evaluateAcquisition` are the rule functions.
5. **Authorization.** Always scope by `assignedScopeWhere(actor)`/`requireScopedProspect`. Capabilities: `plan_field_routes`, `log_field_visits` (FIELD mode only). FIELD sellers may sell remotely; REMOTE sellers have no field capabilities. Eligible stop prospects: `status ACTIVE`, `doNotContact false`, `assignedStaffId` = the route owner, `isRoutableAddress`. The *FIELD visit candidates* queue (`queueWhere("field", …)`) is a ready-made starting list.
6. **CASL separation.** A visit is not consent; do not create `CrmSendingBasis` rows from visits.
7. **Migration ordering.** Agent 2's `20261012090000_field_route_planner` is already on `main`; this migration (`20261012100000_…`) sorts after it and is independent of its tables (verified by replaying both on an empty database).

## 4. Not in scope / known limitations
* **P0 visit-engagement semantics** are now on `main` (`qualifiedVisit`). Assignment uses the same `Engagement` shape (`loadEngagements` mirrors `loadEngagement`): any touch still keeps an untouched-only release from happening (conservative); qualified visits are computed with `hasQualifiedVisit`.
* No XLSX, no direct Airtable/GABAN connector, no historical merge engine, no geocoding.
* "Ready for outreach" is a pre-check; any revoked basis anywhere in a contact's history disqualifies it there (conservative), and email suppressions are only enforced at send time.
* Managers are not auto-assigned; availability is a pause switch and a cap (no calendar-based availability).
* Existing prospects have no derived columns until `recomputeProspectDerived` runs (queues treat them as territory "not computed").
