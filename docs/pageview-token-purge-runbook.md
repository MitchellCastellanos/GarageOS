# Runbook: purge private-path rows from `PageView`

Context: before PR #100 the first-party analytics stored the full pathname of every page, including bearer-token
URLs (`/portal/<token>`, `/quote/<token>`, `/inspection/<token>`, `/book/<slug>/manage/<token>`, `/sales/…`).
PR #100 stops new rows; this runbook removes the historical ones, in a controlled way.

Script: `scripts/redact-pageview-private-paths.ts` (read-only unless `--apply`; prints **counts only**, never
paths, tokens, referrer hosts or personal data).

## 0. What was and was not done
- Dry run against production: **not executed by Claude** — no authorized access. The app database is Neon; the
  connection string is an encrypted Vercel variable that must not be decrypted without an explicit request, and
  the Supabase project connected to the tooling is storage only (no `garageos` schema).
- The script was validated on a local PostgreSQL 16 with all migrations: dry run, `--report`, `--apply`
  (9 private rows deleted, 3 public kept) and idempotent re-run.

## 1. Before anything: recovery posture
- Neon point-in-time restore (PITR): per `docs/operations-runbook.md` the window is **6 h on the Free plan**
  (confirm in the Neon console). Create a **Neon branch** from the current state right before `--apply`: it is an
  instant, copy-on-write snapshot you can restore from or query.
- Independent daily encrypted dump in R2 (`daily/`, 30-day retention, RPO ≤ 24 h).
- Important: the rows to delete *contain the tokens*. Any backup taken before the purge keeps them. The R2 dump
  expires after 30 days and portal/quote tokens expire after 30 days, so the exposure closes on its own on the same
  timescale. Delete the temporary Neon branch after you have verified the result.

## 2. Dry run (safe)
Use the SELECT-only role if you have it (`backup_ro` per the runbook): even a mistyped `--apply` cannot delete.

```
DATABASE_URL='<read-only or production url>' \
  npx tsx scripts/redact-pageview-private-paths.ts --report --allow-remote
```
Output: rows per private family, rows in odd forms, date range, distinct paths and (daily-hash) visitors,
external and search-engine referrers on private rows, token-shaped values in other columns, and how many of the
exposed tokens are still usable today (portal, quote, inspection share, appointment link).

## 3. Decide (do not revoke indiscriminately)
| Evidence in the report | Meaning | Action |
|---|---|---|
| Search-engine referrers on private rows = 0 and Search Console shows no indexed private URL | No sign of exposure outside GarageOS systems | Purge; let tokens expire |
| Private rows with search-engine referrers > 0, or Search Console lists a private URL | A crawler or user reached it from a search result | Revoke only the affected tokens that are still valid; remove the `Disallow` temporarily so `noindex` is read |
| "Still usable" counts > 0 and no external evidence | Exposure is internal (database, Super Admin panel, backups, Vercel logs) | Purge; optionally re-issue only portal links still valid that you consider sensitive |
| Token-shaped values in `utm_*`/`shopSlug`/`referrerHost` > 0 | Tokens leaked into another column | The same `--apply` does not clean these; run a targeted `UPDATE` after review |

Per-customer revocation exists on the customer's portal card; a quote link is re-issued by re-sending the quote.

## 4. Apply
1. Create the Neon branch (or confirm a fresh PITR point).
2. `… --report --allow-remote` once more and save the counts.
3. `… --apply --allow-remote`.
4. Re-run the dry run: **Filas a eliminar: 0**. Spot check `/platform/analytics` still renders.
5. Delete the temporary branch when done.

## 5. Recovery
Restore from the Neon branch / PITR (within the window) or from the R2 dump into an isolated scratch database
(`scripts/restore-drill.sh` refuses non-empty targets). Only `PageView` is touched; no business data.

## 6. Concrete read-only dry-run (aggregate counts only)
Nothing here deletes, revokes or reads credentials on your behalf; **you** run it with your own authorised access and paste back only the printed counts.

**Option A — the script (recommended, includes variant matching):**
1. In a shell on a trusted machine: `export DATABASE_URL='<Neon read-only role URL (backup_ro) — do not paste it anywhere>'`.
2. `npx tsx scripts/redact-pageview-private-paths.ts --report --allow-remote`
3. Copy the printed report (counts per private family, odd forms, date range, distinct paths/visitors, referrer counts, token-shaped values in other columns, tokens still usable). It never prints paths, tokens, referrer hosts or personal data.

**Option B — SQL console, counts only (plain forms; the script also catches encoded/mixed-case variants):**
```sql
SELECT count(*) AS total, min("createdAt") AS first_row, max("createdAt") AS last_row FROM "garageos"."PageView";

SELECT split_part(lower(path), '/', 2) AS family, count(*) AS rows
FROM "garageos"."PageView"
WHERE lower(path) ~ '^/(portal|quote|inspection|sales|sales-invite|sales-recover|sales-recovery-email|account-recovery|activate-demo|admin|platform)(/|$)'
   OR lower(path) ~ '^/book/[^/]+/manage(/|$)'
GROUP BY 1 ORDER BY 2 DESC;
```
Do **not** `SELECT path` for those rows (that would display tokens).

**What to send back:** the counts. With them I can classify the exposure using the §3 table and prepare the exact `--apply` plan (Neon branch + PITR check first). `--apply`, token revocation and any targeted `UPDATE` need your separate, explicit authorisation.
