# National rollout runbook (post-Alberta) — volume with the existing engine

**Nothing here has been started.** No extraction is queued, no switch changed. Every step marked **[Owner]** needs the Super Admin; **[Auth]** is an explicit-authorization checkpoint.

## 0. What is already proven (Alberta) and what changes
Proven end to end: worker extraction → run quality gate → staging with ICP/tombstones → qualification (policy approval) → import (`importScope`, chunk 100) → assignment to the named Sales Rep (REMOTE) → verification. For a **new** province the candidates are classified by the current rules *at first staging*, so no "re-check/Apply" is needed; the **Preview all** panel must simply read **0 changes** after staging (a proof, not a step). **Exception: Québec** was staged before the ICP/tombstones existed: its staged candidates **must go through Preview all → Apply (re-check) before Québec is ever put in the import scope**, or chains staged under the old rules could be imported.

## 1. Province sequence (one at a time; the next is queued only when the previous is READY and verified)
| Wave | Provinces | Notes |
|---|---|---|
| 1 | **Ontario** | ≈ 15–19 k candidates, 11× Alberta's workload: expect a long Actions run; first real throughput measurement. |
| 2 | **British Columbia** | |
| 3 | Manitoba → Saskatchewan | small; one at a time |
| 4 | Nova Scotia → New Brunswick → Newfoundland and Labrador → Prince Edward Island | NB/QC are bilingual: language only matters for email (OFF); a seller with `leadLanguages` set to EN only would skip FR prospects (`LANGUAGE_MISMATCH`) — leave the rep's languages empty or EN+FR. |
| 5 | Yukon → Northwest Territories → Nunavut | tiny; Nunavut's bounding box is large (79 row groups) for little data |
| — | **Alberta, Québec** | not re-extracted. Québec outside Greater Montréal is a separate decision at the very end (needs the re-check above; mostly FR). |

## 2. Settings (set once, before wave 1) **[Owner][Auth]**
* **Automation page:** policy ACTIVE (unchanged). Stages: **Qualify ON, Import ON, Assign ON**; **Outreach eligibility OFF, Release OFF, Pilot OFF**. Import chunk size **100** (raise to 200 only after a clean first province). **Sellers who receive automatic assignments: mcastellanos@garage-os.ca only** (never a Super Admin login — the engine refuses it anyway). Master switch ON only while a province is being worked; pause between provinces.
* **Rep (Team → seller settings):** mode **REMOTE**, "takes new leads" ON, **leave `maxActiveRemoteLeads` empty** (a cap silently stops assignment at the cap: `CAPACITY_EXHAUSTED`), `maxActiveFieldLeads` irrelevant. Languages empty or EN+FR.
* **National → Import scope:** start at **`ON`** and add one province at a time (the importer ignores everything outside the scope; the **assign stage has no province filter** — it assigns any eligible unassigned Lead Radar prospect to the named rep, which is the goal, but check "eligible, unassigned" per province before turning Assign on).
* **Never touched:** sequences, email/SMS sending, outreach pilot, paid geocoder budget (prospects carry the source position; no paid provider is involved).
* Montréal/Laval/Rive-Sud **FIELD** is preserved by the territory rules: a REMOTE seller cannot take a FIELD_PRIORITY/EXCLUSIVE prospect until FIELD releases it. Verify "Assigned · FIELD" stays 0 for this rep.

## 3. Per-province loop (repeat for each province) 
1. **[Owner][Auth] Queue extraction** — National → province card → *Queue extraction*. The worker (GitHub Actions, checks at :17 of every second hour; or run it manually) extracts, uploads and stages. Never queue a second province while one is QUEUED/EXTRACTING.
2. **Gate:** the run page must read **"Quality checks passed"** (verdict OK, coordinates ≥ 95 % of staged, unexpected rejections ≤ 2 %, duplicates ≤ 3 %). Anything else: stop, read the failure code (runbook §5 of the Alberta canary), do not widen.
3. **Proof of classification:** *Re-check → Preview all* for that province shows **0 changes**; the *C3 import preflight* shows blockers only from the known list and a plausible importable share (Alberta: 2,963 of 3,000 verified).
4. **Sample (5 minutes, not an audit project):** Candidates → province → *verified repair*: skim 25 names for chains/dealerships (expect 0), and the *human review* lane for obvious independents (expect few). Any chain in the verified sample = **stop** and send me the names (registry entry, not a code change).
5. **[Owner][Auth] Scope + go:** add the province to **Import scope**, Master **ON**, press *Run one cycle now* once and check: prospects created with coordinates, assigned to the rep, mode REMOTE, FIELD = 0, Super Admin = 0. Then let the 15-minute cron (weekdays 11:00–23:59 UTC) drain the queue, or keep pressing *Run one cycle now* (each cycle is bounded: qualify → import ≤ chunk per transaction → assign, idempotent, resumable; a poison record is isolated, not blocking).
6. **Verify and pause:** National card for the province reads READY (nothing deferred), `FAILED` imports 0, "eligible, unassigned" 0 or an explained skip; outreach counters (enrollments, messages) unchanged; then pause the master switch (or leave it ON if the next province is already in scope).

## 4. Safety checks that must hold at every step
* ICP: no chain/franchise/dealership/parts network in the verified sample; exclusions carry tombstones (`active tombstones` rises with staging); manual decisions (APPROVED/REJECTED) are never changed by qualification, re-check or import.
* Identity: duplicates stay evidence-only; a strong CRM match only *links* (enriches, never overwrites); ambiguous/branch matches wait for a person.
* Idempotency: re-pressing any button re-claims nothing (rows are claimed with `FOR UPDATE SKIP LOCKED`; assignment is compare-and-set).
* Outreach: pilot OFF, eligibility OFF, no sequence active — nothing can be sent, by construction.
* Stop controls: master switch, per-province *Pause*, cancel run, import-scope shrink, live-discovery OFF. All non-destructive.

## 5. Volume expectations (estimates — measure on Ontario)
Candidates ≈ 15–19 k (ON), 6–7 k (BC), 1.5–2.5 k each (MB, SK), 1–2 k each (NS, NB), < 1 k each (NL, PE, territories). Alberta's ratio (≈ 45 % verified, ≈ 99 % of verified importable) gives roughly **8 k ON + 3 k BC + 3–4 k others ≈ 15 k prospects** assigned to one rep. Throughput is bounded by the cron (every 15 min, weekdays) and the per-cycle budget; the first Ontario cycle tells the real rate — if import drains slower than ~1,000/day, raise the chunk to 200 and press *Run one cycle now* more often. One rep owning ≈ 15 k leads is an operating decision for the owner, not an engine limit (no cap is set).
