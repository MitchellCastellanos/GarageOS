# Analytics — production verification procedure (page views, CTA events, retention)

Written 2026-10-23 after the question "production has no new `PageView` rows since 2026-10-21". Everything here is read-only and prints **counts and timestamps only** (never paths, hashes, IPs or user agents).

## 1. What the pipeline does (so you know where it can drop a request)
`AnalyticsBeacon` (browser, every public route change) → `POST /api/track` → guards in this order → `trackPageView` → `PageView` row.

| Step | Drops silently (always HTTP 204) when… | Leaves a trace |
|---|---|---|
| 1. `isTrackingOptOut` | `DNT: 1` or `Sec-GPC: 1` | none |
| 2. `isAllowedTrackOrigin` | foreign/`null` Origin, or neither Origin nor a same-site `Sec-Fetch-Site` | none |
| 3. declared `Content-Length` > 2 KB | oversized | none |
| 4. `checkRateLimit(trackIp)` | > 120 requests/min per IP | **a `RateLimitBucket` row `track-ip:<keyed hash>:<window>` (since the hashing change the id no longer contains the IP)** (this is how you prove a request reached the server and passed steps 1–3) |
| 5. bounded body read, JSON, `parseTrackPayload` | bad JSON, private/token path, locale ∉ en/fr | none |
| 6. `trackPageView` | bot user agent (`bot|crawl|spider|…|headlesschrome|lighthouse`), untrackable path, **or a database error (swallowed; only the error class name is logged)** | `console.error("[platform/analytics] trackPageView falló: <ErrorName>")` on failure |

## 2. Facts that can be read from the database (counts only)
```sql
-- Daily volume (compare the last days with the previous weeks)
SELECT date_trunc('day',"createdAt")::date AS day, count(*) AS views, count(DISTINCT "visitorHash") AS uniques
FROM garageos."PageView" WHERE "createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 1;

-- Newest rows and whether new columns are populated
SELECT max("createdAt") AS latest, count(*) FILTER (WHERE channel <> '') AS classified, count(*) AS total FROM garageos."PageView";

-- Did requests reach the server since the last 08:00 UTC purge? (one row per IP per minute window; counts only, never print ids)
SELECT split_part(id,':',1) AS limiter, count(*) AS buckets, sum(count) AS requests, min("expiresAt") AS first_window, max("expiresAt") AS last_window
FROM garageos."RateLimitBucket" GROUP BY 1;

-- Retention cron evidence
SELECT "createdAt", metadata->>'dryRun' AS dry_run, metadata->>'candidates' AS candidates, metadata->>'deleted' AS deleted
FROM garageos."PlatformAuditLog" WHERE action='ANALYTICS_RETENTION_RUN' ORDER BY "createdAt" DESC LIMIT 6;
```
Reading the third query: `track-ip` buckets that exist while no `PageView` rows were written prove that requests arrive and pass the Origin/size guards, and were then dropped by step 5/6 (typically bots). No `track-ip` bucket at all, with human visits, would point at the browser side (script not loading, ad blocker, DNT/GPC) or at the guards.

## 3. Controlled production visit (needs a person with a normal browser)
The agent sandbox cannot reach `https://www.garage-os.ca` (proxy 403) and the Vercel fetch tool performs plain GETs without running JavaScript, so a human step is required:
1. Open a **normal** window (not private mode, DNT/GPC and tracking-protection extensions off) and visit `https://www.garage-os.ca/pricing`; wait 5 seconds. Do not log in. Note the time (UTC).
2. Immediately (Vercel runtime logs are kept only ~1 hour on this plan) run the Vercel MCP `get_runtime_logs` with `query: "/api/track"`, `since: "30m"`, and look for a `POST /api/track` entry and for any `trackPageView falló` line.
3. Run the SQL above: expect `latest` within seconds of the visit and, for the new row, `channel = 'direct'`, `pageType = 'commercial'`.
4. Interpretation: row present → pipeline healthy (the earlier gap was absence of human traffic). No row but a `track-ip` bucket and no error log → the request was dropped before the insert (check DNT/GPC in that browser, a bot-like user agent, or an extension). Error log present → a database/Prisma problem; read the error class name.

## 4. Local reproduction (no production access) — used on 2026-10-23
Build `main`, start it on a scratch PostgreSQL with all migrations (see `docs/testing.md`), then drive a real Chromium (Playwright from `/opt/node22/lib/node_modules/playwright`, executable `/opt/pw-browsers/chromium`) with a normal Chrome user agent (the default headless UA contains `HeadlessChrome`, which is filtered as a bot). Results on commit `0bd1f60`: `/pricing` → row `direct/commercial`; `/features?utm_source=newsletter&utm_medium=email` with a Google referrer → `email/commercial`, utm normalised; `DNT: 1` → no row.

## 5. Status of the 2026-10-21 gap (facts vs hypotheses)
Proven: last `PageView` 2026-10-21 14:45 UTC; typical volume since mid-October is 1–4 rows/day with a zero day on 2026-10-02; no production deployment happened between 2026-10-19 and 2026-10-22 19:11 UTC (so the gap began under the same code that had been recording visits); `track-ip` buckets created ≈ 11:20 UTC on 2026-10-23 prove that at least two browser requests reached `/api/track` and passed the Origin/size guards; local Chromium run records rows correctly. Vercel Web Analytics is not enabled, so there is no independent traffic source. Runtime logs older than ~1 hour are not retained.
Not proven: whether any **human** visit since 2026-10-21 failed to be stored. The two requests at ≈ 11:20 UTC either were bots (filtered by design) or failed after the guards without a visible error. The controlled visit above settles it.

### Result of the controlled visit (2026-10-23)
- **Incognito Chrome window (owner, 13:49 UTC):** three `PageView` rows appeared within seconds (`/pricing`, `/get-started`, `/pricing`), `channel = direct`, `pageType = commercial`, Chrome desktop. **The production pipeline is proven to work end to end.**
- **Normal Chrome profile (owner, ≈ 9:44 ET):** no row and no `track-ip` bucket. Not proven why. Hypothesis (unverified): a content/tracking blocker extension in that profile (the endpoint is named `/api/track`) or DNT/GPC enabled there. Test: repeat in the normal profile with extensions disabled, then with `navigator.doNotTrack` / `navigator.globalPrivacyControl` printed in the console.
- **`track-ip` buckets at 11:20 and 13:14 UTC:** they came from Vercel deployment-URL visits (`*.vercel.app`, region sfo1, screenshot/preview bots), not from the production domain. Those are filtered or discarded by design.
- **Conclusion:** the "missing PageViews" are explained by low human traffic (1–4 rows/day) plus visitors with blockers/DNT, not by a pipeline fault. If blockers are confirmed, a neutral beacon path name is the only code change worth considering (owner decision; not done).
