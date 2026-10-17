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

It shows: complete impact totals; **every franchisor-website-only match** (business, city, domain, brand matched, reason — since registry v3 these are routed to human review, not excluded); CRM match changes (was → becomes, CRM record before) with strong/ambiguous match counts of the excluded; protected-decision impact (human-decided candidates are counted, never changed); and three CSV downloads — **C2 review** (questionable exclusions + ambiguous verified, with a `risk` column), domain-only exclusions, CRM match changes. CSV cells are RFC 4180-quoted, UTF-8 (BOM) and neutralise spreadsheet formulas; no phone, email or street address is exported.

**Recommendation to Apply** (`recommendApply`, thresholds in `APPLY_THRESHOLDS`): INCOMPLETE until every candidate was examined; then NO-GO if HIGH-risk exclusions (weak alias, dealer wording, exclusion of a repair category) exceed 10 % of the newly excluded, domain-only reviews exceed 5 % of the examined, or ambiguous verified businesses (chain hint, make in the domain, or two thin-evidence flags) exceed 15 % of verified; otherwise GO. LOW-risk flags (dealer-name pattern, brand + own name — e.g. NAPA AUTOPRO franchisees) are policy-consistent heuristics: they are listed for sampling but do not move the verdict. GO means only that Apply (derived candidate columns, audited) is safe; it is not a C3/import decision.

Registry **v2** (superseded by v3 below) (found by the first Preview-all review on rehearsal data): Quick Lane (Ford), Speedy Apollo, fuel retailers (Petro-Canada, Ultramar, Esso, Shell), luxury makes in the dealer pattern, a trailing city is ignored by the dealer pattern, and a weak alias that is itself the city ("Shell Lake") never matches.


## Final retention policy (registry v3)
Founder decision: businesses definitively outside the independent-repair ICP are **permanently excluded from active discovery, but their source evidence and exclusion history are retained.**

* **Excluded everywhere.** A confirmed chain, franchise, corporate retailer, dealership or parts network is EXCLUDED at staging, qualification (BLOCKED), approval, import, assignment, route planning (Field Map/Planner already filter EXCLUDED), contact readiness and sequence enrollment (`PROSPECT_EXCLUDED`; only a HUMAN fit decision outranks the live registry check).
* **Nothing is deleted.** The staged candidate row (source evidence, review decision, match, dates) is kept. In addition a minimal **tombstone** (`CrmDiscoveryExclusion`: source id, province, name, city, reason, category, brand, evidence, registry version, first/last seen, seen count, status) is written when the exclusion is staged, applied (re-check) or met at the import door. No phone, email or street address is stored.
* **Durable.** On every later extraction the exact source id finds its tombstone; the stored verdict carries `ICP_TOMBSTONE`, so every gate keeps excluding the business **even if the registry stops listing the brand**. A business re-keyed by the source (new id) is recognised only by the **exact place + name** (hash of the canonical street address, civic number, city, province, postal code and normalised name) and gets its own tombstone (`ICP_TOMBSTONE_REKEYED`). A different business is never suppressed because it shares a name, a brand reference, a website domain, an address with another name, or a name in another province (regression-tested).
* **Domain-only is never an exclusion.** A franchisor website with no brand in the name goes to **HUMAN_REVIEW** (`ICP_DOMAIN_ONLY_REVIEW`) unless independently confirmed: the franchisor's own page for that location (store-locator style URL: `/store/…`, `/location/…`, `/auto-repair/<province>/<city>/…`, `?shopnum=…`; a dealer's own sub-domain such as `kingsway.toyota.ca`) or the source's own brand link (`BRAND_LINKED`). A brand in the name is confirmation on its own.
* **Brand/domain integrity.** Every registry domain belongs to exactly one brand and resolves to it (tested). `esso.ca` is Esso (it was filed under Petro-Canada); Shell, Ultramar and Husky are separate brands; Speedy Glass is separate from Speedy Auto Service.
* **Human override.** A Super Admin can **release** a candidate (Candidates → select → note ≥ 10 characters → "Release ICP exclusion"). It sets `icpOverride`, marks the tombstone(s) RELEASED (history kept), re-derives the verdict without the commercial gate (every other rule still applies), clears the stale qualification verdict, and is audited (`LEAD_RADAR_EXCLUSION_RELEASED`). A release survives refreshes and is inherited by a re-keyed record; it does not approve, import or assign anything. Manual review decisions are never changed by any of this.
* **Invisible to sellers, visible to Super Admin.** `assignedScopeWhere` hides EXCLUDED prospects from the shared **unassigned** pool for every non-Super-Admin; a record someone already owns stays visible to its owner (ownership, DNC and activities are never touched, and protected records are never auto-excluded). The Lead Radar candidate list hides ICP-excluded candidates by default and shows them only to a Super Admin who asks (`icp=all` checkbox or the EXCLUDED fit filter).
* **CRM records.** No CRM prospect, contact, activity, ownership or DNC row is deleted or rewritten by the ICP, the tombstones or the re-check.

Incidental fix: the Lead Radar candidate search used a NUL character as its "no phone digits" sentinel, which PostgreSQL rejects; a name-only search now simply skips the phone clause.


## Applying the reclassification (bounded, resumable, idempotent)
**Root cause of the "2000 examined / would change 0 / more candidates remain / Apply disabled" report** — a UI state defect, not a backend one. The old "Re-check" panel called the service with no cursor every time, so each Preview re-read the first 2,000 candidates; the service returned `nextCursor` but the panel ignored it, and Apply was enabled only when *that first slice* had changes. Once the first 2,000 were current (nothing left to change there) the panel could never reach the changes behind the cursor. The service's cursor, ordering (`id > cursor`) and compare-and-set were correct and are unchanged. The panel is removed.

Now (National → Re-check CRM matches and repair fit):
1. **Preview all (read-only)** walks the whole province (500 per request, cursor driven). Apply stays **locked, with the reason stated**, until a *complete* preview exists; "nothing to apply" is only ever said after a complete preview found nothing.
2. **Apply reclassification (N changes)** becomes available when the complete preview found changes (a NO-GO recommendation additionally needs an explicit acknowledgement). It walks the same cursor, one 500-candidate batch per request, with a progress bar and exact counters (walked / rewritten / skipped because the row changed meanwhile / tombstones recorded). **Stop** keeps the cursor; **Resume apply** continues from it (also after a reload, within the tab). A replayed batch is ignored whole.
3. It is **idempotent**: a batch that finds nothing to change writes nothing and is not audited; each row is a compare-and-set on the state that was evaluated; an existing tombstone is neither rewritten nor inflated. Tombstones are recorded only for rows the batch really rewrote.
4. When the walk finishes, a **fresh read-only province-wide preview** runs automatically and states either "nothing left to change" or how many candidates still change (apply again to finish them).
5. It never imports, assigns, deletes, or touches review decisions, prospects, ownership, DNC, activities or opportunities, and never re-extracts.
