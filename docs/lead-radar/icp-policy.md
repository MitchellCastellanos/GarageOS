# Discovery ICP — independent automotive repair businesses only

**Founder decision.** Lead Radar discovers *independent* automotive repair businesses. Corporate chains, franchises, automotive retail chains, parts networks/distributors, dealership groups and dealership-owned service departments are **permanently outside the discovery ICP**. They must not consume human review, CRM import, seller assignment or outreach capacity.

## How it works

One shared classifier, two separate questions:

| Question | Where | Outcome |
|---|---|---|
| Is it a repair business at all? | `assessRepairFit` (`src/domain/lead-radar/repair-fit.ts`) | VERIFIED_REPAIR / HUMAN_REVIEW / EXCLUDED |
| Is it inside the commercial ICP (independent)? | `assessIcp` (`src/domain/lead-radar/icp.ts`) — called first by `assessRepairFit` | confirmed chain/franchise/dealership ⇒ **EXCLUDED** with reason `OUTSIDE_ICP_CHAIN_OR_CORPORATE` |

An ICP exclusion is stored like any other fit (`repairFit = EXCLUDED`, `repairFitReasons`):
`OUTSIDE_ICP_CHAIN_OR_CORPORATE`, `ICP_<CATEGORY>`, `ICP_BRAND_<ID>` (when a registry brand matched), `ICP_EVIDENCE_DOMAIN_ONLY` (when only the franchisor website matched) and `ICP_REGISTRY_V<n>`. The candidate row, its source evidence and any review decision are kept (audit + dedupe); the candidate simply never advances.

### The registry (`src/domain/lead-radar/icp-registry.ts`, versioned)
Data only. Each brand has `aliases` (sufficient on their own in the business **name**), optional `weakAliases` (ordinary words such as *Midas*, *Speedy*, *Napa*, *Firestone*, *Goodyear*, *Monro*: they count only when the rest of the name is filler — "auto", "service", a store number or the city) and `domains` (the franchisor website). Seeded with: NAPA / NAPA AUTOPRO, Bumper to Bumper, OK Tire / OK Pneus, Fountain Tire, Kal Tire, Tirecraft, Integra Tire, Active Green+Ross, Canadian Tire, Walmart, Costco, Midas, Speedy, Mr. Lube, Jiffy Lube, Valvoline, Great Canadian Oil Change, Krown, Ziebart, Monro, Meineke, AAMCO, Mister Transmission, CARSTAR, Fix Auto, Boyd, Gerber, Crash Champions, Uniglass, Lebeau, Vitro Plus, Novus, PartSource, Carquest, Lordco, AutoZone, O'Reilly, UAP/Uni-Select, LKQ, FleetPride, AutoCanada, Dilawri, Applewood, Pfaff, Jim Pattison, First Truck Centre, OEM dealer-network sites, … **To add a network: add an entry, bump `ICP_REGISTRY_VERSION`, add a case to `tests/icp-domain.test.ts`.** No classifier change.

Dealerships: dealer taxonomy codes without repair wording; explicit "dealership / concessionnaire" wording; an OEM dealer-network website host (toyota.ca…); or the **make-at-the-end name pattern** ("Lacombe Ford", "New Lethbridge Mitsubishi", "CH Nissan - Body Shop", "Kelvin Singh - Capital GMC"). Any other word after the make ("Honda Specialists", "Toyota Repair") or a specialist/product word before it ("Unlock My BMW") breaks the pattern.

### Conservative by construction
* Only the business **name** and the **website host** are read — never page content. A shop that *mentions* NAPA parts, a certification, a supplier or an affiliation ("Joe's Garage (NAPA parts available)", "… – NAPA Certified", "member of NAPA") is **not** excluded; brands in parentheses or after an affiliation word are ignored.
* Heavy-duty / diesel / fleet shops stay eligible (`truck_repair`, "Truck and Trailer Repair"). A trailer-only listing is still a human question.
* Human review remains only where independence or repair fit genuinely cannot be settled from evidence (OEM-branded names that are not dealer-shaped, a brand link with no registry entry, loose categories, unruled segments).
* Identity matching is untouched and stricter than the ICP: shared directory/franchisor domains, toll-free numbers and banner names are still **never** proof of CRM identity (`shared-identity.ts`); a test asserts every ICP franchisor domain is also ignored for identity.

## Where the gate applies (all through `assessRepairFit`)
| Stage | Behaviour |
|---|---|
| Staging / release refresh (`stageChunk`) | Fit + ICP reasons stored at first staging; every refresh re-applies the **current** rules to not-yet-imported candidates and clears a stale qualification verdict when the fit moved. Imported candidates and human decisions are never rewritten. |
| Qualification | `BLOCKED` with `OUTSIDE_ICP_CHAIN_OR_CORPORATE` under every policy (never `HUMAN_REVIEW`). |
| Manual approval (`reviewCandidates`) | Refused; a **fit override cannot** bypass an ICP exclusion. |
| Import (`importApprovedCandidates`) | Existing approvals are stopped at import (durable `REJECTED / FIT_EXCLUDED_AT_IMPORT`), override ignored. No prospect is created or linked. |
| Prospect stamping / cleanup preview | New and re-assessed prospects get the same fit; **protected CRM records** (owned, DNC, activity) become a protected HUMAN_REVIEW, never auto-excluded; a HUMAN fit decision always wins. |
| Assignment | A non-HUMAN label (or none) on a confirmed chain is treated as EXCLUDED, so it is never proposed or assigned. Existing assignments are not touched. |
| Future provincial extraction | The exclusion lives on the persistent candidate row keyed by the Overture id; later releases re-stage it as excluded and it can never enter the CRM. |

## Owner re-check Preview
Candidates → National → "Re-check CRM matches and repair fit" (Super Admin). Preview writes nothing and reports: newly excluded (by category, by brand, how many on the franchisor website alone for spot-checking, examples), newly eligible independents, still-needing-review (with reasons), verified/excluded after, CRM-match impact of the exclusions, and **protected decisions** (human-decided candidates: their review decision is never changed). Apply writes only the derived columns and is audited.

## Preview all (read-only, whole province)
National → **Preview all (read-only)** evaluates *every* staged, not-yet-imported candidate of a province in bounded batches — it never writes, audits, imports, assigns or sends. The browser drives the loop: each request is one `previewProvinceCandidatesBatch` call (500 candidates, ~0.2 s on 6,600 Alberta rows) with the cursor of the previous one, so no request is large, an interruption loses nothing (the cursor and running totals are kept in the tab's session storage; the button resumes), and a replayed batch is ignored. It reuses `rematchCandidates` (same classifier, same matcher) with `maxPages: 1, detail: true`; `detail` with `apply` is rejected.

It shows: complete impact totals; **every exclusion that rests on the franchisor website alone** (business, city, domain, brand matched, reason); CRM match changes (was → becomes, CRM record before) with strong/ambiguous match counts of the excluded; protected-decision impact (human-decided candidates are counted, never changed); and three CSV downloads — **C2 review** (questionable exclusions + ambiguous verified, with a `risk` column), domain-only exclusions, CRM match changes. CSV cells are RFC 4180-quoted, UTF-8 (BOM) and neutralise spreadsheet formulas; no phone, email or street address is exported.

**Recommendation to Apply** (`recommendApply`, thresholds in `APPLY_THRESHOLDS`): INCOMPLETE until every candidate was examined; then NO-GO if HIGH-risk exclusions (domain only, weak alias, dealer wording, exclusion of a repair category) exceed 10 % of the newly excluded, domain-only exclusions exceed 5 %, or ambiguous verified businesses (chain hint, make in the domain, or two thin-evidence flags) exceed 15 % of verified; otherwise GO. LOW-risk flags (dealer-name pattern, brand + own name — e.g. NAPA AUTOPRO franchisees) are policy-consistent heuristics: they are listed for sampling but do not move the verdict. GO means only that Apply (derived candidate columns, audited) is safe; it is not a C3/import decision.

Registry **v2** (found by the first Preview-all review on rehearsal data): Quick Lane (Ford), Speedy Apollo, fuel retailers (Petro-Canada, Ultramar, Esso, Shell), luxury makes in the dealer pattern, a trailing city is ignored by the dealer pattern, and a weak alias that is itself the city ("Shell Lake") never matches.
