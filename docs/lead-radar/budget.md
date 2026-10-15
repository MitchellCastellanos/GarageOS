# Budget controls — CAD 25.00 / month, shared

* One ledger for **every** paid provider and job: `CrmDiscoveryBudgetLedger` (micro-CAD integers). Not per job/user/province.
* **Hard cap in three places:** code (`HARD_CAP_MICRO_CAD`), the settings `CHECK (monthlyBudgetMicroCad <= 25000000)`, and the UI/API (settings can only *lower* the limit, never below what the month already committed). Raising it needs a deliberate migration = owner approval.
* **Atomic reservation:** `reserveBudget` takes `pg_advisory_xact_lock`, sums `RESERVED + SETTLED` for the Toronto-time month, and inserts only if `committed + estimate <= limit`. Tested: 10 concurrent 0.30 CAD reservations against a 1.00 CAD limit → exactly 3 succeed.
* **No estimate, no request:** zero/negative/NaN/non-integer/missing estimates are refused (`INVALID_ESTIMATE`). USD estimates are converted at a **conservative** multiplier (default 1.450, clamped 1.000–3.000) and rounded **up**; the original currency, amount and rate are kept on the row.
* **Idempotent:** the same `idempotencyKey` never reserves twice; a finished call's key can never trigger a second paid request.
* **Settle / release:** `guardedPaidCall` reserves → runs → settles at the reported (or estimated) cost. A failure after a request may have left is settled at the **estimate** (assumed billed); only a `NotBilledError` releases. A crash leaves the reservation counted until a Super Admin releases it (UI button, audited) — conservative on purpose.
* **Disabled ⇒ nothing billable:** while live discovery is off (env or DB), `reserveBudget` returns `DISABLED`. Tests never call paid APIs; there is no paid provider adapter in this delivery.
* **Visibility:** month, limit, reserved, spent, remaining, by provider, by job, open reservations, 12-month history (Super Admin).
* The Mapbox geocoding budget (`CrmGeocodingSettings`) is untouched and guarded by a test.

## What the application can and cannot enforce
| Cost | Enforced by the app? |
|---|---|
| Paid provider requests made by GarageOS (future Google adapter, etc.) | **Yes** — ledger |
| Overture data | No per-record fee. Transfer ≈ 364 MB for all of Canada, on **your** machine/network |
| Vercel (functions, bandwidth), Neon (storage/compute), backups | **No** — external bills. Uploads are small (250 records ≈ 0.2 MB/request); staging adds on the order of a few hundred bytes per candidate |
| Local compute for the extractor | No (your machine; no cloud spend) |
