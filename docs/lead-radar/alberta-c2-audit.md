# Alberta C2 audit — matching investigation, repair-fit precision, results and C3 decision

**Decision: NO-GO for C3 (CRM import) until the owner steps in §6 are done.** Nothing was imported, assigned, reclassified or sent; no production data was read or changed (engineering has no production database access — the Supabase project visible to the connector, "Garage OS", has no `garageos`/`public` tables, so it is not the application database). The Alberta production extraction is not re-queued.
The Alberta Candidate Review PDF was not available to engineering; the four matches and five businesses named in the request were investigated from the actual Overture records (same release, same extractor) and the code.

## 1. Priority 1 — CRM matching

### What the "branch of existing business" label really does (Verified in code)
| Candidate match state | Meaning | What approval / import does |
|---|---|---|
| `BRANCH_OF_EXISTING` | advisory: *some* CRM record shares the name, phone or website domain but is at a **different** address | **Nothing is linked.** The import plans `CREATE`: a separate new prospect. It only sends the candidate to human review in qualification (`BRANCH_RELATIONSHIP`). Existing CRM record untouched. |
| `AMBIGUOUS` | could be the same place (address data missing on a side) | Import creates **no prospect** and merges nothing: a `CrmDuplicateReview` row for a person. Existing record untouched until a human decides. |
| `EXISTING_STRONG` | same name **and** same physical place (or name+city with a "unique" phone/domain when the address is missing) | The candidate is **linked** (`LINK_STRONG`): a source observation is attached and **only empty fields** of the existing prospect are filled (`enrichFromCandidate`: never overwrites, never changes ownership, DNC, activities or opportunities; DNC only ever propagates *to* the prospect). |

So the four Alberta cases were advisory (`BRANCH_OF_EXISTING`): approving/importing them could **not** have linked or merged the Québec records. But the label was wrong and the matcher had one genuinely unsafe path (below).

### Root causes (the shared-identifier bug)
`classifyAgainstPool` treated a shared **website domain**, **phone** or **name** as a "chain signal", with no notion of identifiers that cannot identify one business:
* **Dad's Auto Repair Shop, Edmonton → Carrosserie Genile Inc.** — Dad's Overture record has website `http://yp.ca/bus/100892988`: a **Yellow Pages directory page**, domain `yp.ca`. A Québec body shop that also lists a `yp.ca` page matches on "same website domain". *(Inference: I cannot read the Genile record, but `yp.ca` is the only identifier Dad's has in common with anything Québec-side — the name, address and phone are unrelated.)*
* **NAPA AUTOPRO, Edmonton (15923 Stony Plain Rd) → R.R. Station Service Inc.** — the Overture record carries `napaautopro.com`, the **franchisor's** domain shared by hundreds of independent members.
* **OK Tire, St. Albert / Castor → OK Pneus** — both stores carry `oktire.com/stores/…`, the **banner** domain (OK Pneus is the Québec-French brand of the same franchisor).
A same-banner relationship is a *brand* relationship, not business identity.

### The unsafe path that was fixed
Banner name + same city + a CRM record with **no address** + the banner domain (or a call-centre toll-free number) counted as "unique" in a pool of one → `STRONG` → **automatic link and enrichment of an unrelated prospect**. Same for directory domains. It needed a CRM record without an address, so it was latent, not observed.

### Fix (PR in this change)
* `domain/sales-crm/shared-identity.ts`: directory/aggregator/site-builder/social domains, franchise & banner domains, toll-free numbers and banner names. The classifier **ignores** shared domains and toll-free phones; a banner name can never reach `STRONG` through "unknown address + unique phone/domain" (it goes to a person); the CRM candidate lookup (`loadMatchPool`) no longer widens on them. One shared classifier ⇒ CSV import, Lead Radar staging and import are all covered.
* Same business, same address stays a `STRONG` match; same banner name at a different address is still an informational `BRANCH_OF_EXISTING` (UI now says "same brand/name elsewhere — advisory, nothing is linked").
* Candidate list: the manual **Import approved** button now takes only the **filtered province's** approvals (it previously imported every province's approvals); candidates now show the repair-fit verdict, its reasons and a heavy-duty tag (the founder's review screen showed only tier/category, which is why JR's Auto Detailing looked "PRIMARY").
* **Re-check tool** (national page → "Re-check CRM matches and repair fit", Super Admin, preview first): re-evaluates **staged, not-imported** candidates of one province with the current rules **without re-extraction**. Apply writes only derived match/fit columns and clears the stale qualification verdict; it never touches review decisions, prospects, owners or DNC. **Not run in production by me.**
* Tests (fail on the old code, pass now): `lead-engine-domain` (Alberta cases, the unsafe path, same-address still strong, toll-free), `lead-radar-national-db` "Alberta C2 matching regression" (existing CRM records — owner, DNC, manual notes — byte-identical after approve+import; four separate new prospects; banner/no-address case held for a person), re-check and province-scoped import tests.

### Affected production population — read-only queries (to run; I could not)
`DATABASE_URL=<prod> npx tsx scripts/lead-radar/c2-audit.ts impact --province AB --out ./c2` (one `BEGIN READ ONLY` transaction) writes `matching-impact.json`: candidates by match state/import state, the most frequent website domains among matched candidates (expect `yp.ca`, `napaautopro.com`, `oktire.com`…), every candidate whose CRM match involves a shared domain or banner name, and **already-LINKED candidates linked via `NAME_CITY_PHONE` / `NAME_CITY_DOMAIN`** (the only auto-link routes that depended on a "unique" phone/domain — look at those for wrong links). Equivalent SQL for the Supabase/psql editor:
```sql
-- candidates with a CRM match, and why
select c."province", c."matchState", count(*) from "garageos"."CrmDiscoveryCandidate" c where c."matchState" <> 'NEW' and c."duplicateOfCandidateId" is null group by 1,2 order by 1,2;
-- top domains behind BRANCH/AMBIGUOUS/STRONG matches (shared directory/banner domains show up here)
select lower(regexp_replace(regexp_replace(c."website",'^https?://(www\.)?',''),'[/?#].*$','')) d, count(*) from "garageos"."CrmDiscoveryCandidate" c where c."matchState" in ('BRANCH_OF_EXISTING','AMBIGUOUS','EXISTING_STRONG') and c."website" is not null group by 1 order by 2 desc limit 30;
-- already linked through the unknown-address routes (the risky ones)
select c."province", c."name", p."name" as crm_name, p."city" from "garageos"."CrmDiscoveryCandidate" c join "garageos"."CrmProspect" p on p."id" = c."importedProspectId" where c."importState" = 'LINKED' and c."matchReasons" && array['NAME_CITY_PHONE','NAME_CITY_DOMAIN'] order by 1,2;
```
The national page's re-check **preview** gives the same population as exact `match:` transitions without writing anything.

## 2. Priority 2 — repair-fit precision (shared classifier, human decisions untouched)
| Example | Before | Now | Why |
|---|---|---|---|
| JR's Auto Detailing | EXCLUDED | EXCLUDED | already excluded (`NAME_SIGNAL_DETAILING`); the review screen did not show the verdict — fixed (badge + reasons) |
| Tonno Cover Depot | VERIFIED | HUMAN_REVIEW | accessories wording (tonneau, bedliner, lift kit, accessories…) |
| Meggie at Mighty Peace | VERIFIED | HUMAN_REVIEW | "person at business" listing (`EMPLOYEE_LISTING`) — a dealership employee card |
| The Steering Wheel Guy | VERIFIED | HUMAN_REVIEW | single-component specialty service |
| Heavy-duty / diesel / truck shops | VERIFIED | **VERIFIED**, tagged `HEAVY_DUTY` | real repair businesses; commercial fit is a **separate, derived, never-stored** segment (`commercialSegment`) shown as a badge. Alberta: 311 of 3,868 verified (8 %). Whether GarageOS targets them is an **owner policy decision** (a future qualification option), not a repair-fit question. |
Other changes from the real Alberta sample: industrial / oil-field / truck-body / powder-coating / truck-stop / registry names and unmapped motorcycle codes → review; pick-a-part yards → excluded; "Full Throttle Cycle" in a motorcycle category → review (was wrongly "bicycle" excluded); and the structural one: **a specific repair category alone no longer verifies a business whose name says nothing about vehicles** (two independent signals, as for generic codes) → `NO_AUTOMOTIVE_WORDING` review. Mixed-service garages are untouched ("Garage Remorquage Roy" stays verified; the rule needs *no* automotive or repair wording at all).
Cost of the rules: Alberta verified 4,252 → **3,868**, review 908 → **1,292** (+384, 5.8 % of staged; some are real shops sent to a person, e.g. "Oil Tech Express"). Excluded 1,435. Qualification and the import/approve gates evaluate the live classifier, but the **stored** candidate verdicts staged earlier are stale until the re-check tool is applied (policy-approved candidates are re-evaluated and revoked once their verdict is cleared).
The CRM cleanup preview (#131) will also flag more existing prospects as HUMAN_REVIEW under the new rule; nothing is applied automatically.

## 3. Priority 3 — the randomized read-only C2 audit
Tool: `scripts/lead-radar/c2-audit.ts` (`sample` → `score`, plus `impact`). Seed `c2-AB-20261016`, sampling `md5(Overture id || seed)` per stratum ⇒ same seed, same sample, in any environment holding the release (verified: two draws identical). Full tables with names, categories, addresses, websites, evidence, match reasons and conclusions: [`c2-alberta/audit-sample-and-conclusions.md`](c2-alberta/audit-sample-and-conclusions.md) (+ `audit-sample.json`, `audit-labels.json`, `audit-score.json`).
**Evidence limits:** drawn from the **rehearsal database** (real Alberta extraction, no CRM, so no CRM matches exist to sample); conclusions from **name, category, address and website URL text only**; **no website was opened**. The 10 match rows are duplicate candidates (same name + same street address as another candidate).
| Stratum | n | Result |
|---|---|---|
| VERIFIED_REPAIR | 50 | REAL_REPAIR 30 · RELEVANT_SPECIALIZED 14 (tires, glass, lube, driveline, diesel) · COMMERCIALLY_UNSUITABLE 2 (Wal-Mart Tire & Lube, Canadian Tire: corporate retail) · AMBIGUOUS 4 · NOT_REPAIR 0 |
| EXCLUDED | 50 | CORRECT 47 · AMBIGUOUS 3 (generic names under towing/upholstery categories) · WRONG 0 |
| HUMAN_REVIEW | 25 | AMBIGUOUS 8 · COMMERCIALLY_UNSUITABLE 8 (OEM dealers, styling, RV) · RELEVANT_SPECIALIZED 6 (mostly heavy-duty) · NOT_REPAIR 2 · REAL_REPAIR 1 (a collision centre held for review) |
| Duplicates / matches | 10 | CORRECT_DUPLICATE 10 · incorrect 0 |
**Documented thresholds** (rollout plan): verified precision ≥ 90 % → **88 % (lenient: real + relevant-specialized), 60 % strict (real only) → BORDERLINE (85–90 % band), not GO.** The 4 ambiguous (King Auto Parts and Repair (cash for cars), Clear Choice Auto, Akrestorations ltd, Compression Small Engines) and the 2 corporate retailers decide it: if the 4 ambiguous are real shops the figure is 96 %. Excluded error: **0 % wrong (6 % if every ambiguous were wrong) → GO** (≤ 10 %). Incorrect matches: **0 of 10 duplicates; 0 reproducible CRM mismatches after the fix; the 4 reported CRM matches were incorrect (advisory) before the fix.**
Precision trajectory on the same real data: first pass ≈ 82–84 % → after the classifier changes 88 % (this run's sample). Both the classifier and the sample are mine/engineering's judgment from names, so the founder's own production sample (same command, seed and labels template) is the authoritative C2.
Qualification still sits between "verified" and "imported": of Alberta's 3,868 verified, 720 carry a chain signal (CHAIN_SIGNAL → human review) and 311 are heavy-duty; ≈ 2,840 are light-vehicle, non-chain.

## 4. What changed (code)
Matching: `domain/sales-crm/{shared-identity,dedupe}.ts`, `lib/sales-crm/lead-pool.ts`. Classifier: `domain/lead-radar/repair-fit.ts`. Re-check: `lib/lead-radar/rematch.ts`, `RematchPanel`. UI: candidate verdict/segment badges + fit filter, province-scoped import. Audit: `domain/lead-radar/c2-audit.ts`, `scripts/lead-radar/c2-audit.ts`. No migration.

## 5. Remaining blockers for C3 (all must clear)
1. The production deployment of this change is READY (verify) — the fixes are inactive until deployed.
2. **Re-check applied for Alberta in production** (owner: national page → *Re-check CRM matches and repair fit* → province AB → *Preview* → review the `match:`/`fit:` transitions → *Apply*; repeat if "more candidates remain"). Until then production still holds the stale BRANCH/fit verdicts.
3. **Production C2 sample labelled with websites checked** for at least the ambiguous and the commercially-unsuitable items; target: verified precision ≥ 90 %, exclusion error ≤ 10 %, 0 incorrect matches. (If the 4 ambiguous resolve as real shops the rehearsal sample is at 96 %.)
4. **Owner policy decision on heavy-duty/diesel shops** (target or not) and on corporate retail with service bays (Walmart/Canadian Tire — already routed to review by the chain signal).
5. Import scope set to `AB` only (national page) before anything is allowed to import.

## 6. Exact owner actions, in order
1. Confirm the Vercel production deployment of this PR is READY (Deployments page).
2. National page → *Re-check CRM matches and repair fit* → AB → Preview → Apply (Super Admin). Nothing else changes.
3. Run on your machine (read-only): `DATABASE_URL=<prod connection> npx tsx scripts/lead-radar/c2-audit.ts sample --province AB --seed c2-AB-20261016 --out ./c2` and `… impact …`; open `audit-sample.md`, fill `audit-labels.template.json` (set `websiteChecked:true` only for sites you opened), then `npx tsx scripts/lead-radar/c2-audit.ts score --sample ./c2/audit-sample.json --labels ./c2/audit-labels.template.json --out ./c2`.
4. Decide heavy-duty and corporate-retail policy; set the Automatic import scope to Alberta only.
5. Tell engineering the score; if GO, authorize C3 (automation CRM-only or a province-scoped manual import) as a separate decision. Sending, sequences and assignment stay as they are.
