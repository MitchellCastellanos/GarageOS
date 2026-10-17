# C3 — Alberta CRM import: preflight and controlled run

**Status: nothing imported, approved or assigned.** C3 starts only after the owner has read the preflight totals below and approved them explicitly.

## 1. Preflight (read-only) — Lead Radar → National → "C3 import preflight" → *Run preflight for AB*
`c3Preflight` (src/lib/lead-radar/national.ts) walks the province's VERIFIED_REPAIR candidates that are not yet imported (500 per query), re-assesses each with the live classifier (so a stored verdict that no longer holds is caught), and gives every candidate exactly one verdict (`c3Verdict`, tested): either one **blocker** (first match wins) or *importable* with the **approval still needed**.

| Gate | Blocker code | Source of truth |
|---|---|---|
| ICP / repair fit | `FIT_CHANGED` (live fit ≠ VERIFIED_REPAIR, incl. any ICP exclusion or tombstone) | `assessRepairFit` (shared classifier) |
| Licence / category tier | `LICENSE_BLOCKED`, `TIER_EXCLUDED` | importer SQL gate |
| A person said no | `REJECTED_BY_PERSON` | review state is never overridden |
| Duplicates | duplicates are counted apart (evidence only, never in the pool) | `duplicateOfCandidateId` |
| Contact | `INSUFFICIENT_CONTACT` (no phone, address or postal code) | `importEligibility` |
| Coordinates | `NO_COORDINATES` (stricter than the importer: no staged point) | `sourceLatitude` |
| CRM matching | `MATCH_AMBIGUOUS`, `MATCH_BRANCH` (a person decides); `EXISTING_STRONG` is importable as a **link** (enriches, never overwrites) | candidate match state |
| Territory | `TERRITORY_UNRESOLVED`; the report also gives rule key and required mode (Alberta → national / REMOTE) | `classifyTerritory`, `requiredMode` |

For importable candidates the report splits **new prospects vs links** and the **approval still needed**: `APPROVED` (ready), `POLICY_AUTO` (qualified AUTO_ELIGIBLE: the policy approves on its next pass), `NEEDS_PERSON`, `NOT_QUALIFIED`. It also lists every active Sales Rep with mode, auto-assign switch, caps, whether the automation names them and whether the existing engine **would give them a national (remote) Alberta prospect** (a Super Admin login never can), plus the automation switches and import provinces.

**Tenant isolation:** the importer writes platform CRM tables only (`CrmProspect`, `CrmContact`, `CrmImportBatch`, `CrmDiscoveryCandidate`); no shop/tenant table is read or written and `CrmProspect` has no shop column. **Idempotency:** the importer claims candidates with `FOR UPDATE SKIP LOCKED`, only from `NOT_IMPORTED`/`FAILED`, so a re-run claims nothing (tested: second import → 0 claimed); the preflight is repeatable and writes nothing.

## 2. Controlled run — only after the owner approves the preflight totals
All through existing screens; each cycle is bounded and resumable (durable queues are the tables themselves).
1. **Automation page** (Lead Radar → Automation): policy ACTIVE; stages *Qualify* + *Import* + *Assign* ON; *eligibility*, *release*, **pilot (outreach) OFF**; **Sellers who receive automatic assignments = the Sales Rep account only** (never the Super Admin login); *Import chunk size* small (e.g. 50).
2. **National → Import scope:** tick **Alberta only** (other provinces are then ignored by the importer).
3. Turn the automation switch ON, press **Run a cycle now**; repeat until the national card "approved, not imported" reaches 0. Each cycle: qualify → import (≤ chunk per transaction, a failing record is isolated) → assign (existing engine, compare-and-set).
4. Verify (National + preflight again): imported = created + linked + review; `verifiedAlreadyImported` rises by exactly the created/linked count; "eligible, unassigned" → 0 or an explained capacity skip; every Alberta prospect belongs to the Sales Rep, mode REMOTE, none to Super Admin; sellers see them in their normal CRM views.
5. Stop at any time: Automation switch OFF (queues are durable; nothing is lost).
