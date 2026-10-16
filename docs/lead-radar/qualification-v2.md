# Qualification policy V2 — business-type aware (proposal, NOT activated)

Status: implemented, tested, merged and deployed (PR #128) as **code only**. **No production policy was changed, activated or created**; the real V1-vs-V2 comparison on production data has **not yet been run** (the engineering session had no production database access). V1 remains exactly as deployed (its rules fingerprint is unchanged and asserted by a test).

## 1. What is verified, and what is not

| | |
|---|---|
| VERIFIED IN CODE | How V1 decides (`qualification.ts`), how `tier`/`chainSignal`/quality flags are computed at staging (`taxonomy.ts`, `record.ts`), what is stored per candidate. |
| VERIFIED IN TESTS | V1 outcomes unchanged; V2 behaviour on synthetic borderline cases; V2 never bypasses a mandatory-human or integrity rule (fuzzed: 4,000 records × 6 rule sets); preview ≡ executor; the comparison writes nothing. |
| DOCUMENTED PRIOR MEASUREMENT | `verification-audit.md` (Overture 2026-09-23.1, two metro boxes, 5 category groups): low source confidence 14 % (QC box), chain/brand signal 7.3 % of primaries; ~3–6 % near-duplicates inside the source. It is not the production run. |
| **NOT VERIFIED** | The actual composition of the 2,034 production candidates. This session has **no production database access**, so nothing below claims to have inspected production rows. |

## 2. Why so many HUMAN_REVIEW — what the code says (and what only your data can confirm)

* **Secondary (580).** V1's `tier=SECONDARY` is *every* non-primary automotive code: body/collision, glass, restoration, trailer repair, customization **and** dealers, parts stores, car wash, detailing, towing, tint/wrap/upholstery, security, registration, consultants. V1 treats all of them alike ("a human decides"). Collision/body, glass, restoration and trailer shops *do repair vehicles* and are GarageOS targets; parts-only, wash/detailing-only, towing etc. are not. The mix inside the 580 depends on the groups you extracted — **the report below tells you exactly**.
* **Questionable (189).** `tier=AMBIGUOUS` has three causes: Overture's generic `automotive_service` (very common for ordinary garages), an unmapped subcategory under `vehicle_service`, and a repair listing under a vehicle-maker name (possible dealer service department). Only the last is a genuine risk; the first two can often be resolved from independent evidence (the business name / code words).
* **Low confidence (333).** The extractor flags `confidence < 0.5`. V1 sends all to a human. A single low number does not say whether the place is real; **independent corroboration** (≥ 2 distinct upstream datasets, a phone, a street address, a platform-recognised repair category) is a better signal. Completeness alone never counts.
* **Chains (156), branches (57), ambiguous matches (19), link-to-existing (28), thin data, region missing:** correct to keep with a human; unchanged in V2.

## 3. V2 (all options default to V1; nothing changes unless a policy selects them)

| Option | V2 value | Meaning |
|---|---|---|
| `businessTypes` | `REPAIR_CAPABLE` | Judge what the business **does** (`business-type.ts`) from stored facts — no re-extraction. Real repair: general, brake/transmission/electrical/tire/truck specialists, **body/collision, glass, restoration/trailer**. |
| `nonTargetBusiness` | `BLOCK` | Parts-only, wash/detailing-only, towing/roadside, tint/wrap/upholstery/security, registration, consultants ⇒ `BLOCKED: NOT_TARGET_BUSINESS` (a human can still approve one manually). |
| (always) | human | Dealers, customization, inspection, unrecognised codes without evidence; any OEM-branded listing (incl. a brand-named body shop). |
| `genericService` | `NAME_EVIDENCE` | Generic/unmapped category qualifies only if the code's words or the **name** show repair work (garage, mécanique, pneus, freins, carrosserie…) and nothing contrary (remorquage, lave-auto, pièces, concession, location…); an OEM brand name disqualifies. |
| `lowConfidence` | `CORROBORATED` | Low confidence tolerated only with ≥ 2 independent datasets (Overture's own label excluded), phone **and** street address, and a **platform-recognised** repair category. |

Unchanged and **mandatory-human / blocked for every policy**: ambiguous CRM matches, unresolved branches, chain/franchise signals (default), source change after approval, possible dealer service, region/postal conflicts, unresolved territory, thin data; disallowed licences, excluded records, no usable contact, missing provenance. A human rejection is never reopened.

Every automatic qualification carries its explanation (`REPAIR_CAPABLE_SPECIALTY`, `CATEGORY_NAME_EVIDENCE`, `CORROBORATED_LOW_CONFIDENCE`, …), visible on the candidate and in the dashboard. Policy versioning, preview-before-activation, audit logs and manual decisions are untouched. The V1 fingerprint (`a3598feb…`) is preserved because V2 options only enter the hash when they differ from V1 defaults.

## 4. Run the comparison against the real 2,034 candidates (read-only)

**In the app:** Lead Radar → Automation → *Compare policies (read-only)* → A = *V1 defaults* (or your stored policy), B = *Recommended V2* → Compare. Writes nothing (not even an audit row). Tick *Show business names* for real examples. Download the `.md` report.

**From your machine (independent of the app):**
```
DATABASE_URL=<production connection string> npx tsx scripts/lead-radar/policy-report.ts --out ./policy-report
# optional: --a policy:1 --b v2   --examples 5 --include-names   --selftest-readonly
```
It runs inside one `BEGIN READ ONLY` transaction (the database rejects any write — `--selftest-readonly` proves it), issues SELECTs only, never prints the connection string, and writes `report.md` + `report.json`. Output has counts, plus business names/cities/categories only if you pass `--include-names`; never phones, emails or addresses.

The report shows: V1 vs V2 lanes; candidates moving up (review → auto) and down, **each with the exact reasons cleared/added**; breakdown by business type and taxonomy code; territory split (Greater Montréal FIELD vs rest of Canada REMOTE); low-confidence diagnostics (confidence buckets, independent-source counts); a safety-invariant check; and the Québec pilot estimate.

## 5. Recommendation

1. Run the report on production; read *Movements and why* and the *By taxonomy category* table — that is where you verify the assumptions in section 2 with real numbers.
2. If the movements look right, create V2 as a **new draft** (Policy panel → *Fill the recommended V2* → Save as new draft → Preview → Activate). V1 stays in history as superseded; no candidate is touched until automation is switched on, and the executor only advances candidates, never contacts anyone.
3. Treat the achieved automatic rate as an output, not a target. Anything you disagree with can be tightened per option (e.g. `nonTargetBusiness: REVIEW`, `genericService: REVIEW`, `lowConfidence: REVIEW`).

## 6. Known limits

Name evidence is a keyword list (EN/FR) — conservative but not exhaustive; unknown names fall to review, never to auto. "Independent datasets" assumes Overture's `sources[].dataset` names distinguish upstream contributors (the report's low-confidence table shows whether that holds in your data). A repair shop that mislabels itself with a non-target code is blocked (still manually approvable). No source-confidence number is used as a decision input beyond the extractor's existing `LOW_CONFIDENCE` flag.

## 7. Repair-fit contradiction gate (added after the CRM quality audit)
Independent of the policy options, qualification now runs the shared assessor `repair-fit.ts`: a decisive non-repair name signal (EV charging, wash, detailing, towing, recycling, bicycle, parts retail, taxi equipment, manufacturer/corporate) with no repair wording blocks (`NOT_TARGET_BUSINESS`); a category/name conflict or an unruled segment (motorcycle, trailer, dealer, marine/RV, tire retail, vehicle-brand names) goes to human review (`CATEGORY_NAME_CONFLICT`). It applies to V1 and V2 and cannot be opened by any option. The V1 fingerprint is unchanged. Full rationale, CRM cleanup and owner procedure: [crm-cleanup.md](crm-cleanup.md).
