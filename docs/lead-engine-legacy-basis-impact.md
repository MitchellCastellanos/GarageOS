# Legacy sending bases and the Lead Engine deploy — impact, runbook and rollback

## Deploy is behaviour-neutral
Migration `20261012100000_lead_engine_foundation` adds `CrmSendingBasis.reviewStatus` as a **nullable column with no default and no backfill**, and contains **no `UPDATE`/`DELETE`** (asserted by `tests/lead-engine-db.test.ts`). Every basis that exists in Production keeps `reviewStatus = NULL` = *legacy, unclassified* and is evaluated by `evaluateSendingBasis` with **exactly the pre-migration rules** (kind, evidence length, expiry, revocation, newest-row-wins). So merging and deploying this PR:

* gives **no** contact a new permission (nothing changes for any existing row, and a legacy row never becomes more valid);
* removes **no** valid permission — composer, enrollment, the sequence worker and the dispatcher behave as before for all five kinds.

Tested with a real DB and fake provider (`tests/sales-comms-db.test.ts`, "LEGACY (A)"): all five kinds, composer + enrollment + in-flight sequences through worker and dispatcher.

## What changes for NEW bases (immediately on deploy)
| Basis recorded after deploy | Stored status | Effect |
|---|---|---|
| `IMPLIED_PUBLISHED_ADDRESS` / `IMPLIED_DISCLOSED_ADDRESS` | `PENDING_REVIEW` (structured evidence mandatory: type, capture date, supporting facts, role relevance, + source URL and published-conditions confirmation for published address) | authorises nothing until a Sales Manager (own team) or Super Admin approves; a pending/rejected row, being the newest, also shadows an older legacy row |
| `EXPRESS_CONSENT`, `IMPLIED_EXISTING_RELATIONSHIP`, `EXEMPT` | `NOT_REQUIRED` | as before |

Imports and FIELD visits never create a basis. Callers must pass `reviewStatus` to the policy function (the type requires it; an omitted value fails closed).

## The explicit legacy reclassification procedure (run later, when the owner decides)
Evidence page → *Legacy sending bases* (**Super Admin only**), server actions in `src/actions/sales-casl-legacy.ts`:

1. **Preview impact** (`previewLegacyBasisReclassification`, read-only + an audit row). Computed with the *real* send policy before vs after: bases in the batch (oldest 2,000 per run) and remaining; contacts affected; **contacts that would lose sendability**; **active/paused sequence enrollments that would stop**; **queued/scheduled commercial emails that would be blocked**; examples. Defaults to the two address-based kinds; the other kinds can be selected but only change a bookkeeping mark.
2. **Apply** (`reclassifyLegacyBases(kinds, token)`). The token binds the call to exactly the previewed rows and impact; anything that changed since (new basis, revocation, another run, a concurrent writer) → `LEGACY_PREVIEW_STALE`, nothing written, preview again. Only rows still `NULL` are updated (`NULL → LEGACY_UNREVIEWED`), in one transaction, with an audit event `LEGACY_BASES_RECLASSIFIED` carrying the affected ids. Repeating it is a no-op. Two concurrent applies: exactly one succeeds.
3. **Effect**: address-based legacy bases stop authorising sends until *fresh structured evidence is approved* (a new `PENDING_REVIEW` → `APPROVED` row restores sending). Composer and enrollment refuse them; the worker/dispatcher stop live enrollments with `NO_VALID_BASIS` and do not send queued steps. The other three kinds are unaffected. Nothing is sent, enrolled or deleted by the procedure itself, and stopped enrollments are not auto-resumed.
4. **Revert** (`revertLegacyReclassification(auditId)`): rows of that run that are still `LEGACY_UNREVIEWED` (and never reviewed) go back to `NULL` = previous behaviour. Idempotent; audited `LEGACY_BASES_REVERTED`. Enrollments already stopped stay stopped.

Tested (`tests/lead-engine-db.test.ts` procedure test; `tests/sales-comms-db.test.ts` "LEGACY (B)"): authorization (manager/rep refused), preview changes nothing, stale and wrong tokens refused, concurrency, impact counts, audit ids, idempotency, recovery via approved evidence, revert, and the real composer/enrollment/worker/dispatcher outcomes per kind:

| Kind | After the procedure (default kinds) | Composer | Enrollment | In-flight enrollment + queued step |
|---|---|---|---|---|
| `IMPLIED_PUBLISHED_ADDRESS` | `LEGACY_UNREVIEWED` | blocked `NO_VALID_BASIS` | refused | stopped `NO_VALID_BASIS`, email not sent |
| `IMPLIED_DISCLOSED_ADDRESS` | `LEGACY_UNREVIEWED` | blocked | refused | stopped, not sent |
| `EXPRESS_CONSENT` / `IMPLIED_EXISTING_RELATIONSHIP` / `EXEMPT` | unchanged (`NULL`) | allowed | allowed | keeps running, sent |

## Suggested rollout order (nothing here is run by the PR)
1. Merge → deploy (migration applies automatically; neutral). Optionally run the read-only SQL below at leisure.
2. Super Admin: *Assignment* → **Recompute** (address/territory snapshot). Unrelated to CASL.
3. When ready: *CASL evidence* → **Preview impact**. If the numbers are acceptable (Production is expected to have 0 enrollments/queued mail per `docs/sales-email-launch-readiness.md`), **Apply**. If not, approve fresh evidence first, or do nothing — legacy bases keep working.
4. Rollback at any time: **Undo this run** (Super Admin), or code rollback (old code ignores the column; the new tables/columns are inert).

## Read-only SQL (optional, equivalent to the in-app preview)
```sql
-- Legacy bases by kind (reviewStatus NULL = untouched legacy)
SELECT kind, count(*) AS rows, count(*) FILTER (WHERE "revokedAt" IS NULL AND ("expiresAt" IS NULL OR "expiresAt" > now())) AS currently_valid
FROM garageos."CrmSendingBasis" WHERE "reviewStatus" IS NULL GROUP BY kind ORDER BY kind;

-- Contacts whose newest basis is address-based and currently valid (these would lose sendability if reclassified)
SELECT count(*) FROM (
  SELECT DISTINCT ON ("contactId") "contactId", kind, "revokedAt", "expiresAt"
  FROM garageos."CrmSendingBasis" ORDER BY "contactId", "recordedAt" DESC
) n WHERE kind IN ('IMPLIED_PUBLISHED_ADDRESS','IMPLIED_DISCLOSED_ADDRESS') AND "revokedAt" IS NULL AND ("expiresAt" IS NULL OR "expiresAt" > now());

-- Active/paused sequence enrollments on such contacts
SELECT count(*) FROM garageos."CrmSequenceEnrollment" e
JOIN (SELECT DISTINCT ON ("contactId") "contactId", kind FROM garageos."CrmSendingBasis" ORDER BY "contactId", "recordedAt" DESC) b ON b."contactId" = e."contactId"
WHERE e.status IN ('ACTIVE','PAUSED') AND b.kind IN ('IMPLIED_PUBLISHED_ADDRESS','IMPLIED_DISCLOSED_ADDRESS');

-- Queued/scheduled COMMERCIAL emails to such contacts
SELECT count(*) FROM garageos."CrmEmailMessage" m
JOIN (SELECT DISTINCT ON ("contactId") "contactId", kind FROM garageos."CrmSendingBasis" ORDER BY "contactId", "recordedAt" DESC) b ON b."contactId" = m."contactId"
WHERE m.category = 'COMMERCIAL' AND m.status IN ('QUEUED','SCHEDULED') AND b.kind IN ('IMPLIED_PUBLISHED_ADDRESS','IMPLIED_DISCLOSED_ADDRESS');
```

## Note on `sales-comms-db` (historic, calendar-dependent)
Tests 11, 13, 15 and 28 fail on pristine `main` whenever the suite runs on a non-business day or outside the sending window: they call `processDueEnrollments({ now: new Date() })` and expect step 0 to be due *now*, but the scheduler correctly defers it to the next business day. With the clock shifted to a business day the whole file passes (31/31, including the legacy tests). They are not regressions of this work; the new legacy tests use explicit future `now` values and a raised per-run cap, so they are date-independent.
