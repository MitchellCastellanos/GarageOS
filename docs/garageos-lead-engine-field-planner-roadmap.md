# GarageOS Lead Engine + Field Route Planner — Approved Architecture & Execution Roadmap

**Decision date:** 2026-10-10  
**Status:** Architecture/operating direction approved; implementation not yet authorized.  
**Repository:** `MitchellCastellanos/GarageOS`  
**Related:** [Sales CRM master plan](sales-crm-master-implementation-plan.md) §D; [Sales email launch readiness](sales-email-launch-readiness.md); [CASL matrix](compliance/casl-matrix.md).

## 1. Objective and non-goals

Build a **GarageOS-owned, provider-neutral Lead Engine** for discovering, validating, deduplicating, enriching and assigning Canadian independent mechanic-shop leads. The engine feeds the **existing** Sales CRM and Field Route Planner; it must not duplicate CRM entities or depend on GABAN/Airtable's schema or API.

**Now:** leverage the owner's existing Lead Radar dataset via authorized **static CSV export** while Airtable API quota is exhausted (429). Use these real mechanic shops to validate prospect workflows and FIELD routes.  
**Later:** pluggable, legally permitted discovery/enrichment APIs, controlled refresh and national coverage. A GABAN/Airtable live connector is optional and **not** a launch dependency.

Out of scope for the initial implementation: new shop-tenant messaging, replacing Resend/Twilio/Cloudflare, automatic bulk campaigns, scraping without provider permission, production data imports without explicit approval, and unapproved paid map APIs.

## 2. Verified starting point (agent audits of main at ac3d1a1)

- Existing CRM: `CrmProspect`, contacts, opportunities, tasks, activities, staff ownership, audit events; CSV preview/confirm with atomic idempotent confirm, formula injection defense and per-file/DB dedupe; territory resolver and FIELD/REMOTE capabilities; CASL send-time gates, suppressions, sequences.
- Existing gaps: no GarageOS-owned discovery engine, no persistent per-source observations/external record ID, no branch-aware dedupe/review queue, no prospect territory snapshot/filter, no FIELD route/stop/location model, no geocoding/maps.
- CSV prospect import currently accepts CSV only; reusable XLSX parsing exists elsewhere. Existing matching by domain, phone or name+city can wrongly collapse branches.
- `FIELD_VISIT` logging currently lacks outcome/idempotency/ownership check, and a generic visit can influence territory-based automated first-contact policy. **This is P0 safety-critical.**
- Airtable base **Lead Radar** was visible to Agent 1 but its schema read failed with 429; do not claim knowledge of its table fields. CSV export must be inspected before mapping.
- Audit evidence paths: `src/domain/sales-crm/{access,territory,import}.ts`, `src/actions/{sales-import,sales-platform-settings}.ts`, `src/lib/sales-crm/{queries,prospects}.ts`, `src/domain/sales-comms/casl.ts`, `src/lib/sales-comms/{policy,dispatcher}.ts`, `prisma/schema.prisma`. Re-audit current main before implementation.

## 3. Approved business decisions

| Decision | Rule |
|---|---|
| Montréal island, Laval, Rive-Sud | `FIELD_PRIORITY`; FIELD gets first opportunity, REMOTE may participate after configured release conditions |
| FIELD priority duration | **Not yet approved**. Keep configurable; do not silently pick 7 days or alter live seed |
| National assignment | Automatically distribute eligible remote-market leads among **FIELD and REMOTE** reps according to coverage, workload, availability and server-side authorization |
| FIELD capability | FIELD can sell remotely; REMOTE cannot plan/execute FIELD visits |
| CASL and duplicate approvals | Sales Manager within team; Super Admin globally; seller cannot approve own evidence |
| Pilot | 100 existing mechanic shops, with preview/quality checks, explicit import approval and separate campaign approval |
| Maps | Prefer separate `CrmProspectLocation` table; test accuracy on 50 authorized Montréal/Laval/Rive-Sud addresses before choosing provider or approving spend |
| Managers | Authorized REMOTE-mode managers can see team FIELD routes read-only; not execute FIELD actions |
| Stage/task workflow | Extract reusable transactional service logic rather than duplicating server actions |

## 4. Architecture and ownership

```text
Lead Radar static CSV (now)       Approved provider adapters (later)
            \                           /
             -> GarageOS Lead Engine <-
                  source observations
                  normalize / validate
                  branch-aware match
                  review / enrich
                  territory / assignment
                          |
                 Existing Sales CRM
                  /               \
           sales outreach       FIELD Route Planner
         (CASL-gated)         (locations, stops, visits)
```

**Agent 1 owns:** source adapter contract, import staging, observations/provenance, matching/duplicate review, address normalization and quality, territory resolution and assignment, queue eligibility, CASL evidence/approval integration.  
**Agent 2 owns:** location geocoding and coordinate verification, route and stop lifecycle, map UI, visit outcomes and CRM activity/task integration, field permissions.  
**Shared contracts:** stable prospect ID; canonical address and location quality; merge/archive handling for route stops; team scope; territory release; CASL/engagement semantics. Coordinate Prisma migrations, `routes.ts`, sidebar, auth and shared CRM actions before coding. No parallel incompatible migrations.

## 5. P0 — Fix visit-engagement semantics before field operations

- Identify all code paths treating `FIELD_VISIT` as sufficient engagement, including `loadEngagement` and `evaluateColdEmail`.
- Represent visit outcomes explicitly. **Only a genuinely qualifying interaction** may satisfy the territory follow-up engagement gate; no-contact, unavailable, closed, invalid, rejection and DNC outcomes never qualify.
- **CASL is separate**: even a qualifying conversation is not consent. Require independent valid sending basis, suppressions, DNC, language and other policy checks.
- Harden visit logging with actor/prospect ownership, field capability, idempotency key and transaction-safe writes; preserve existing audit.
- Add regression tests for all non-qualifying outcomes, valid qualifying engagement, cross-seller attempts and send/enrollment policy.
- Do not rewrite provider transport, shop transactional messaging or unrelated dispatcher behavior.

## 6. P1 — Shared lead and location foundations

**Lead Engine:** introduce provider-neutral source observations (source key, external ID where available, import batch, observed timestamp, normalized snapshot, lawful-source note, content hash). Support static CSV with missing external IDs by stable file/batch/row fingerprint. Never invent fields. No silent overwrite of verified data.

**Matching:** exact source record ID; cautious unique domain/phone; name+address/postal; manual review of ambiguous matches. Same chain name/domain/phone at different addresses must not be silently skipped or merged. No automatic merge of two existing CRM prospects. Defer complex manual merge engine unless demonstrably necessary for pilot.

**Addresses:** normalize province/city/postal/street, store quality state, retain unknowns, re-resolve when changed, avoid auto-assigning unresolved local addresses as REMOTE. Agent 1 owns canonical address semantics.

**Locations:** Agent 2 owns optional `CrmProspectLocation` with coordinates, provider, accuracy/confidence, geocoded-at, address fingerprint and invalidation on address change. Coordinates are not fabricated. Verify provider terms for storage/caching and tiles. Minimize redundant address snapshots and retain no continuous GPS tracking.

## 7. P2 — Static import, territories and queues

- Inspect owner-provided CSV export (no API access needed), map only real columns, preview counts, duplicate/branch candidates, invalid/unresolved addresses, provenance and territory assignment; do not import without separate owner authorization.
- Reuse current 2 MB / 2000-row / 24h preview and transaction/idempotency protections unless audited requirements demand changes.
- Support CSV first; XLSX via existing parser only if worthwhile. Do not build a GABAN-specific integration or Airtable token dependency.
- Configure `FIELD_PRIORITY` **only after approval of duration and release semantics**; never silently change production territory rules. Existing engaged/owned prospects retain authorized ownership.
- National auto-assignment includes eligible FIELD and REMOTE reps, with workload and availability controls; no cross-team leak.
- Build queue presets: unassigned, ready for outreach, eligibility review, FIELD candidates, follow-up due, duplicates, missing data and DNC. Always scope by actor first.
- CASL approval evidence: source URL, observation date, relevance and notices where applicable; Sales Manager/team and Super Admin/global approval. Do not grandfather self-attested bases as verified without review. An imported email alone never enables sending.

## 8. P3 — FIELD Route Planner MVP

- Only FIELD sellers can create/edit/execute their authorized routes; route stops must reference assigned, non-archived, non-DNC prospects with usable addresses. Managers may view their team's routes without gaining field-execution privileges.
- Proposed new models: `CrmFieldRoute` and `CrmFieldRouteStop`, plus separate `CrmProspectLocation`; coordinate schema with Agent 1. Snapshot only data required for route reproducibility.
- Up to 25 stops; simple nearest-neighbor + 2-opt on straight-line distance; label distance and duration as estimates, never actual traffic ETAs. Manual reorder and saved draft routes.
- MapLibre or equivalent only after checking tile licensing, commercial usage, attribution and provider terms. Load map lazily; no paid service or key activation without approval.
- Open **one next destination at a time** in Google Maps / Apple Maps / Waze via supported links; do not assume unlimited multi-stop navigation.
- Visit outcomes: contacted/interested, demo discussed, decision maker unavailable, follow-up needed, not interested, closed/invalid, DNC. Never infer consent from a visit.
- Use existing CRM activities/tasks/opportunities and `applyDoNotContact`; if demo meeting requires attendee email and none exists, create prep task rather than invalid meeting.
- Idempotent client submission ID, unique stop/result constraint, compare-and-set state transition, single transaction and audit. No duplicate task/activity on retries.
- Mobile-first at 390px, tablet split map/list, desktop planner; accessible controls, no horizontal overflow, empty/error/loading states.

## 9. P4 — Sales readiness

- Verify CASL basis approval, suppressions, language, DNC, territory gate and actor scope at both enrollment and dispatch; avoid changing proven transport code unless a demonstrated defect requires it.
- Review existing EN/FR templates, sequence scheduling, sender identities, reply stop rules, rate limits and sending cadence; do not activate campaigns by default.
- Report operational metrics: lead import yield, duplicate rate, territory assignment, visit completion, decision makers reached, demos, follow-ups and conversion; avoid unnecessary location/PII retention.

## 10. P5 — Pilot: 100 existing mechanic shops

Pilot is a **target, not authorization**. Required gates:

1. Owner supplies and authorizes use of a Lead Radar static export.
2. Stage, validate and preview source fields, lawful provenance, dedupe, branch distinction, missing locations and DNC.
3. Owner explicitly authorizes the real import and destination environment.
4. Import controlled batches with rollback/reconciliation plan; preserve original CRM state.
5. Validate 50 address samples for map/geocoding accuracy before selecting or funding provider.
6. Route test with eligible FIELD prospects; log outcomes without unlocking email for failed visits.
7. Separately approve any live outreach or sequence activation.
8. Review pilot metrics and operational defects before scaling.

## 11. Acceptance and testing

- Reimport is idempotent; no duplicate prospects or observations; branch addresses survive; ambiguous matches require review.
- No accidental changes to existing owner, contact preference, DNC, suppression, audit or open opportunity.
- Territory behavior: FIELD priority then authorized release; FIELD participates nationally; REMOTE cannot execute FIELD.
- Send eligibility never follows from imported email or non-qualifying visit; approval authority is scoped to manager team.
- No cross-seller or cross-tenant access, including route IDs, observations and duplicate-review pairs.
- Route save/reorder/retry is idempotent; stop outcome writes exactly once; archived/merged prospects handled safely.
- EN/FR parity, responsive 390/768/1280px, accessibility and production build.
- Execute lint, TypeScript, domain/DB/authz/integration suites using isolated test DB; no prod migrations/tests. Document any environment limitation honestly.

## 12. Execution model for future coding agents

**Important: this roadmap is not a coding authorization.** Once the owner issues implementation prompts, agents are expected to work **autonomously through their authorized scope**:

1. Fetch latest `main`, deeply inspect actual code and migrations, reconcile the audit against current implementation.
2. Establish a short internal implementation sequence, coordinate shared contract/merge order, and **proceed**. Do not stop after each minor step for permission or return only another plan.
3. Use separate feature branches/PRs, additive safe migrations, minimal diffs, tests and clear rollback guidance.
4. Stop and report only for a real blocker: missing credential/source data, unapproved paid provider, uncertain legal eligibility, unsafe data migration, security/privacy concern, destructive/irreversible action, production write, or material departure from approved scope.
5. Never silently assume approval of production imports, campaigns, payments, paid geocoding, territory seed changes or irreversible merges.
6. Before PR, run tests, typecheck, lint, build, and verify authz and responsive behavior; if any fail, fix or document a true external blocker.
7. Deliver a concise final report: PR link, changed files, migrations, test results, limitations, operational actions, and GO/NO-GO. Do not self-merge unless separately authorized.

**Dependencies:** Agent 1 first publishes stable lead/address/territory contract; Agent 2 may independently develop UI/domain logic against the agreed interface but must integrate only after shared schema is stable. P0 engagement safety is a prerequisite for real visit operations.

## 13. Unresolved choices and hard stops

- FIELD_PRIORITY release duration and any production territory rule changes.
- Geocoding provider, pricing/terms, storage rights and owner-approved budget.
- Real CSV export and source lawful-use verification.
- Live import destination, batch authorization and rollout timing.
- Legal review of CASL published-address evidence and retention/privacy practices under applicable Canadian law.
- Any production migrations, outreach activation, or third-party spending.

These are **specific gates**, not excuses to halt unrelated approved implementation work.
