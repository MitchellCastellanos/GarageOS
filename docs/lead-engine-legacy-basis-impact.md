# Impact of `LEGACY_UNREVIEWED` on existing sending bases (read before the Production migration)

Migration `20261012100000_lead_engine_foundation` stamps **every existing `CrmSendingBasis` row** `LEGACY_UNREVIEWED`. `evaluateSendingBasis` (the single function used by the composer, sequence enrollment, the sequence worker and the dispatcher) then treats rows as follows:

| Basis kind | `LEGACY_UNREVIEWED` after migration | Composer (`sendEmail`) | Enrollment | Worker / dispatcher on in-flight items |
|---|---|---|---|---|
| `EXPRESS_CONSENT` | still valid (unchanged) | allowed | allowed | keeps running |
| `IMPLIED_EXISTING_RELATIONSHIP` | still valid (unchanged) | allowed | allowed | keeps running |
| `EXEMPT` | still valid (unchanged) | allowed | allowed | keeps running |
| `IMPLIED_PUBLISHED_ADDRESS` | **not valid** (`UNREVIEWED`) | blocked `NO_VALID_BASIS` | refused | enrollment **stopped** (`NO_VALID_BASIS`), queued step not sent |
| `IMPLIED_DISCLOSED_ADDRESS` | **not valid** (`UNREVIEWED`) | blocked `NO_VALID_BASIS` | refused | enrollment **stopped** (`NO_VALID_BASIS`), queued step not sent |

Tested (real DB, fake provider): `tests/sales-comms-db.test.ts` — "LEGACY_UNREVIEWED impact: composer + enrollment" (all 5 kinds, plus restoration once approved) and "…IN-FLIGHT enrollment…" (all 5 kinds through worker and dispatcher; asserts nothing is sent after the stamp for address-based kinds and that other kinds are unaffected). Pure rules: `tests/sales-comms-domain.test.ts` ("review gate").

## Properties
* **Stricter only.** No row that was invalid becomes valid. Nothing is sent, enrolled or scheduled by the migration.
* **Stops are one-way.** An enrollment stopped with `NO_VALID_BASIS` is not auto-resumed when evidence is later approved; a human re-enrolls.
* **Newest row decides** (unchanged): a newer `PENDING_REVIEW` row shadows an older approved one until decided.
* **Recovery path.** Record structured evidence on the prospect (new row, `PENDING_REVIEW`) → a manager of the owning team or a Super Admin approves in *CASL evidence* → the basis is valid again. The *Eligibility review* queue lists contacts with legacy or pending bases.
* Rows inserted by old application code *after* the migration but before deploy default to `NOT_REQUIRED`; address-based kinds with `NOT_REQUIRED` are still **not** valid (fail closed).

## Read-only impact queries (run before migrating; no writes)
```sql
-- 1. Live bases by kind (what the stamp will touch)
SELECT kind, count(*) AS rows, count(*) FILTER (WHERE "revokedAt" IS NULL AND ("expiresAt" IS NULL OR "expiresAt" > now())) AS currently_valid
FROM garageos."CrmSendingBasis" GROUP BY kind ORDER BY kind;

-- 2. Contacts whose NEWEST basis is address-based and currently valid (these lose sendability)
SELECT count(*) FROM (
  SELECT DISTINCT ON ("contactId") "contactId", kind, "revokedAt", "expiresAt"
  FROM garageos."CrmSendingBasis" ORDER BY "contactId", "recordedAt" DESC
) n WHERE kind IN ('IMPLIED_PUBLISHED_ADDRESS','IMPLIED_DISCLOSED_ADDRESS')
  AND "revokedAt" IS NULL AND ("expiresAt" IS NULL OR "expiresAt" > now());

-- 3. Active/paused sequence enrollments that would be stopped at the next worker run
SELECT count(*) FROM garageos."CrmSequenceEnrollment" e
JOIN (SELECT DISTINCT ON ("contactId") "contactId", kind FROM garageos."CrmSendingBasis" ORDER BY "contactId", "recordedAt" DESC) b ON b."contactId" = e."contactId"
WHERE e.status IN ('ACTIVE','PAUSED') AND b.kind IN ('IMPLIED_PUBLISHED_ADDRESS','IMPLIED_DISCLOSED_ADDRESS');

-- 4. Queued/scheduled COMMERCIAL emails to contacts whose newest basis is address-based
SELECT count(*) FROM garageos."CrmEmailMessage" m
JOIN (SELECT DISTINCT ON ("contactId") "contactId", kind FROM garageos."CrmSendingBasis" ORDER BY "contactId", "recordedAt" DESC) b ON b."contactId" = m."contactId"
WHERE m.category = 'COMMERCIAL' AND m.status IN ('QUEUED','SCHEDULED') AND b.kind IN ('IMPLIED_PUBLISHED_ADDRESS','IMPLIED_DISCLOSED_ADDRESS');
```
Per `docs/sales-email-launch-readiness.md` no sequence is activated and nothing is enrolled in Production, so queries 3–4 are expected to return 0 — confirm before migrating. If any are non-zero, either approve fresh evidence first or accept that those items stop.

## Test-suite note (historic, not related to this change)
`tests/sales-comms-db.test.ts` tests 11, 13, 15 and 28 (inbound reply-stops-sequence, delivery webhooks, sequences schedule, signature) fail on pristine `main` whenever the suite runs on a non-business day or an hour outside the sending window: they call `processDueEnrollments({ now: new Date() })` and expect the first step to be due *now*, but the scheduler correctly defers step 0 to the next business day (e.g. Saturday 2026-10-10; Monday 2026-10-12 is a Canadian holiday). With the system clock shifted to a Wednesday all four pass. They are historic, calendar-dependent test-design issues, not regressions of this PR. The two new impact tests above use explicit future `now` values and are date-independent.
