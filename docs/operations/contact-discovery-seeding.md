# REMOTE contact discovery seeding and email-first import

## What changed
- **Root cause.** `seedDiscoveredContactsIfEnabled` returned early unless `eligibilityEnabled` was ON. The national rollout keeps the eligibility stage OFF (the tick also skips it while `rolloutEnabled`), so 0 `CrmDiscoveredContact` rows and 0 `CONTACT_DISCOVERY_SEEDED` events were ever produced.
- **Fix.** Seeding now needs only live discovery (setting + `LEAD_RADAR_ENABLED=1`) and the automation master switch. It stays staging only: `PENDING` `CrmDiscoveredContact` rows with source/dataset/capture time. It never creates a `CrmContact`, accepts a contact, creates or approves a CASL basis, changes eligibility or assignment, enrolls, or sends.
- **Backfill.** The queue is "active prospect, imported (CREATED/LINKED) candidate with a syntactically valid email, not yet recorded". It therefore covers every previously imported prospect, not just new imports, and resumes automatically (stored rows drop out of the queue).
- **Bounds and safety.** Stable `id` order, keyset cursor, 500 rows/page, ≤20 pages and a 15 s deadline per cron run. Each page runs in one transaction under a transaction-scoped advisory lock (an overlapping run skips). `@@unique([prospectId, emailNormalized])` + `skipDuplicates` keep it idempotent. A SQL prefilter with the same address syntax as `checkEmailShape` keeps unusable rows from sitting at the head of the queue.
- **Suppression / DNC.** An address that is actively suppressed, on a do-not-contact prospect, or matching a do-not-contact contact is stored as `REJECTED` (`SUPPRESSED_ADDRESS` / `DO_NOT_CONTACT`), never `PENDING`.
- **Import prioritization.** `nextImportIds` now orders usable-email candidates first (then by id), so the FIELD/unresolved no-email tail cannot take chunk capacity from candidates that can become contactable REMOTE prospects. Province scope (`importProvinces`), the rollout scheduler, state transitions, attempts and counters are unchanged.

## Email validity is not CASL eligibility
A syntactically valid, non-suppressed published address only means the record is *contactable in principle* and may enter the CRM / review queue. Commercial sending still requires a human-accepted contact, a reviewed CASL sending basis, a decided language, a verified sender, no suppression/DNC, and the (still OFF) automated-sending / pilot switches.

## Verification after deploy (read-only)
Run `docs/operations/contact-discovery-readonly.sql` against Production (single `BEGIN READ ONLY … ROLLBACK`, aggregate counts only). Expected within a few cron runs: `seedingAuditEvents` > 0, `remoteProspectEmailsAwaitingDiscovery` falling toward 0, `discoveryQueueByStatus.PENDING` rising, `emailLessRemoteProspects.importedAfterFix` = 0.

## Not done on purpose
No retroactive deletion or reassignment of existing email-less REMOTE prospects (they already leave the seller queues, workload and assignment pool since #152/#153). No change to the import door, sending switches, rollout state, or email infrastructure.
