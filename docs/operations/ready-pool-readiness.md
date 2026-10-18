# READY-pool readiness check (read-only)

`ready-pool-readiness.sql` answers, from the real database, how many Lead Radar prospects and discovered contacts exist, how many have usable emails, and where each one stands on the way to **READY** (a verified independent repair shop in the REMOTE territory with a usable, deduplicated address, an independently approved CASL basis and no suppression).

**No production counts are claimed anywhere in the repository.** The numbers only exist once someone runs this file against the production Neon database and shares the output.

## Guarantees
- One `SELECT` inside `BEGIN READ ONLY … ROLLBACK`: PostgreSQL rejects any write. `tests/outreach-readiness-db.test.ts` runs the file inside a read-only transaction on a scratch database, and `tests/outreach-readiness-domain.test.ts` scans it for write keywords and for anything that could return an address.
- Output is `metric, k, n` — aggregate counts and categories only. No emails, names, phones, URLs or ids.
- It changes no switch, sends nothing, approves nothing.

## How to run
Paste the whole file into the Neon SQL editor for the production branch and run it once. Share the result table.

## Reading the result
| metric | meaning |
| --- | --- |
| `prospects_active_lead_radar` | active, unmerged prospects imported by Lead Radar |
| `by_territory`, `by_repair_fit` | territory state (NATIONAL = REMOTE candidate) and repair-shop verdict |
| `readiness_state` | live derivation, independent of the stored table: `READY_CANDIDATE` (approved allow-listed basis), `PENDING_REVIEW`, `PENDING_EVIDENCE_*`, `BASIS_NOT_USABLE_FOR_AUTOMATION`, `SUPPRESSED`, `INELIGIBLE_LANE_OR_FIT`, `NO_USABLE_EMAIL_YET` |
| `discovered_contacts_by_status` | staged addresses: PENDING / ACCEPTED / REJECTED |
| `discovered_pending_*` | usable-looking pending addresses, role/free mailboxes, MX status, websites available for evidence collection, addresses shared by several prospects |
| `basis_by_kind_status` | recorded CASL bases by kind and review status |
| `eligibility_rows`, `eligibility_readiness_language` | the stored assessments (`readiness`/`campaignLanguage` are filled once PR-A is deployed and the eligibility stage has run) |
| `contact_addresses_on_many_active_prospects` | addresses that would be deduplicated (the lowest prospect id keeps the address) |
| `switches` | current send switches and caps (expected: nothing live) |
| `live_enrollments_or_queued_mail` | must be 0 before any launch decision |

`READY_CANDIDATE` in `readiness_state` is a row-level approximation: it does not apply address deduplication or the live territory re-classification. The authoritative READY count is `readiness = READY` in `eligibility_readiness_language` once the eligibility stage has assessed the pool.
