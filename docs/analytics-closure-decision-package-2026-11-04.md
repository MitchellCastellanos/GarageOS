# Analytics closure: decision package (2026-11-04)

Status: **for owner and counsel. Nothing here is published or enabled.** Evidence tags as in `docs/handoffs/garageos-seo-analytics-final-closure.md` ([AUTO], [PROD-RO], [CODE]). Statements marked **[COUNSEL]** are legal questions the engineering side cannot answer; none is asserted as law.

## 1. Privacy audit: what GarageOS actually does

| Topic | Fact | Source |
|---|---|---|
| Page views (ON) | `POST /api/track`: normalised path (no query, no private/tokenised paths), locale, referrer **host only**, `utm_source/medium/campaign` (validated), device class, browser name, **country** (from the hosting provider header), `shopSlug`/`shopId` when the page is a shop booking page, `channel`, `pageType`, `visitorHash`. | [CODE] schema + route |
| Visitor identifier | `HMAC-SHA256(ANALYTICS_HASH_SECRET, UTC-date \| IP \| user-agent)`, first 32 hex. Rotates daily, so no cross-day linking. Pseudonymous, **not anonymous**. Raw IP and full UA string are not stored in the record. Secret set in production. | [CODE], [PROD-RO] |
| DNT / GPC | `DNT: 1` or `Sec-GPC: 1` → dropped on the server before anything else, for page views, CTA events and signup attribution. A drop leaves no trace. | [CODE] `isTrackingOptOut` |
| Cookies / storage | None for analytics. Beacon uses `sendBeacon`; no third-party script. | [CODE] |
| IP / email handling | IP used in memory for the hash and rate limiting. `RateLimitBucket.id` now stores a keyed hash (#206): 0 raw IPs/emails in production. | [PROD-RO] |
| CTA events (OFF) | `POST /api/track/event`: allowlisted `ctaId`, path, locale, channel, pageType, `visitorHash`. Returns 204 immediately when the flag is off, before limiter or DB. | [CODE] |
| Signup attribution (OFF) | One row per new shop (first touch, never updated, deleted with the shop): landing path, locale, channel, pageType, allowlisted CTA id, validated UTM, referrer host. No email, IP, hash, UA, free text. Captured only by the email/password signup route, after the shop commits, never able to fail the signup. **Google sign-up is not attributed.** | [CODE] |
| Access | Super Admin only (`requireSuperAdmin()` before queries); aggregates only; cells under 5 folded. | [CODE], [AUTO] |
| Retention | 13 months configured for `PageView` and `AnalyticsEvent`; deletion **OFF** (dry-run audited daily). `SignupAttribution` has no age-based retention: it lives and is deleted with its shop. | [CODE], [PROD-RO] |
| Location of data | Neon project region `aws-us-east-2` (Ohio); hosting on Vercel (`iad1` observed in response ids). Data is processed outside Québec/Canada. | [PROD-RO] |

### Corrections the 2026-10-23 draft needs before publication
1. Its "counsel point 1" (raw IP/email in rate-limit counters) is **resolved** by #206 in production; reword to "keyed hash" or drop the caveat.
2. Add that visits to a shop's public booking pages are recorded with the shop identifier (the shop's customers are the visitors). **[COUNSEL]**: roles of GarageOS vs the shop for those visits.
3. State where data is stored (United States) and that country is derived from the hosting header. **[COUNSEL]**: whether Québec Law 25 requires a documented assessment for this transfer, and the exact wording of the existing "outside Quebec or Canada" section.
4. The current `/privacy` mentions DNT/GPC only for video links. Add it for page analytics (the draft does).
5. Keep "[DISABLED]" sections out of the published text until each flag is on; keep "we plan to delete after 13 months" until `ANALYTICS_RETENTION_APPLY` is on.
6. **[COUNSEL]**: whether a daily keyed hash of IP+UA is "personal information" for Law 25/PIPEDA purposes (assume yes until told otherwise), the lawful basis/consent position for non-essential analytics, CASL not applicable to page views, the controller identity, and the Privacy Officer contact (already published).

Publication-ready EN/FR text with these markers: `docs/privacy-notice-analytics-draft-2026-10-23.md` (apply corrections 1-5; it is accurate on everything else I checked against code).

## 2. Activation sequence for CTA and signup attribution (after approval only)

Pre-conditions: privacy text approved and published (§1); owner writes explicit approval for **each** flag; deployment of `main` READY.

For each flag, one at a time (CTA first, then attribution):
1. Vercel → Production env: add `ANALYTICS_CTA_ENABLED=true` (then later `ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED=true`). Redeploy production.
2. Verify the new deployment is READY.
3. Controlled test, normal browser, DNT/GPC off, a marketing page: click one CTA; expect exactly one `AnalyticsEvent` row (`SELECT type, "ctaId", path, locale, channel, "pageType" FROM garageos."AnalyticsEvent"`). Repeat with DNT on: expect no new row. Rapid double-click: expect duplicates bounded by the limiter (the limiter, not unique keys, is the guard, so confirm count ≤ clicks).
4. Confirm `/platform/analytics` CTA panel shows the event (cells under 5 are folded by design, so expect "other" at this volume).
5. Confirm no sensitive data: the table has no email/IP/UA columns by schema; check `path` values contain no token or query.
6. For attribution: **do not create a real account or touch billing without separate approval.** Verification option: owner signs up a test shop on purpose from a CTA link (`?from=…&cta=…`), then `SELECT "landingPath", locale, channel, "pageType", "ctaId", "utmSource" FROM garageos."SignupAttribution"` (expect 1 row, no personal columns); that shop is then removed by the owner (cascade removes the row).
- Already proven on disposable DBs [AUTO]: first-touch wins, UTM allowlisting, token/PII rejection, flag-off writes nothing and queries nothing, DNT/GPC skip, failed signup unaffected, existing signup/trial flow unchanged.
- Not proven live [NOT DONE]: browser click-through, Google OAuth (never attributed by design), Stripe/onboarding with the flag ON.

Rollback (no data change needed): delete the env var, redeploy, verify READY → collection stops immediately; endpoints return 204. Recorded rows remain (delete only with approval: `DELETE FROM garageos."AnalyticsEvent"`; for attribution, rows disappear with their shop or via `DELETE FROM garageos."SignupAttribution"`).

## 3. French indexing readiness (decision: **defer**)

Exists: 14 French route files (`/fr`, produit, fonctionnalités ×5, tarifs, intégrations, démo, commencer, contact, aide), correct `lang="fr-CA"`, own canonical, `noindex, follow`, derived from the same typed content as English (plan prices from code), terminology guard (Devis / Ordre de travail).

Blocking before any page can be indexed:
- Route registry marks all but `/fr` as `planned` and `/fr` as `frIndexable: false`; per pair: set `frStatus: "live"`, remove the flag, which also activates reciprocal hreflang + `x-default` and sitemap entries (`alternatesFor`/`isIndexablePath` already implement this) [CODE].
- **Native Québec review not done** (`docs/fr-wave1-review.md` is explicitly a preliminary engineering review) and `docs/fr-terminology-review.md` decisions pending.
- **Legal dependency**: there is no `/fr/confidentialite` or `/fr/conditions`. `/privacy` and `/terms` carry EN and FR in one page. Indexing French commercial pages that link to them needs counsel's decision on separate FR legal URLs.
- Help articles have no FR equivalents (only the `/fr/aide` shell), `/resources` and `/blog` are EN-only (fallback nearest-ancestor is by design).
- Proposed first pairs (smallest-risk, review these): `/` ↔ `/fr`, `/pricing` ↔ `/fr/tarifs`, `/features` ↔ `/fr/fonctionnalites`, `/product` ↔ `/fr/produit`. Switch on one pair at a time; verify canonical/hreflang reciprocity live; submit in Search Console.

## 4. Retention and recovery recommendation

- Retention: 13 months is within the contract (12-month floor). Dry-runs are clean and the deletion path is proven on synthetic data [AUTO]. **Recommendation:** once the notice is published (§1), set `ANALYTICS_RETENTION_APPLY=true`. Current effect is nil (nothing older than 2026-09-19 exists; first deletions would start ~2027-10-19), so the risk is near zero and the benefit is a verifiable policy. Needs your explicit approval.
- Decide whether `SignupAttribution` also needs an age limit (currently deleted only with the shop). **[COUNSEL/OWNER]**
- Recovery branches (all contain the 6 pre-sanitisation token paths and ~full production data): `backup-pre-analytics-v2-20261022` (2026-10-23), `br-super-water-aexovmvr` (2026-10-24), `br-rapid-resonance-aeuusosk` (2026-10-24). The two migrations they protected are applied and verified, the tokens have expired (~30 days from 2026-10-10 at the latest), and PITR is only 6 h. **Recommendation:** keep one until the next scheduled change, then delete the other two; delete the third once the owner is satisfied (≈ now). Deletion requires your approval; I did not delete any.

## 5. CI: `db-tests` as a required check (recommendation: **no, not yet**)

`db-tests` is path-filtered (`prisma/**, src/**, tests/**, scripts/**…`). A required check from a path-filtered workflow stays "expected" on docs-only PRs and blocks them. It has been green on every merged PR I reviewed, but the nine `Date.now() % 100000` phone fixtures are a latent flake and the first rule is to avoid excess infrastructure. Revisit after (a) removing the path filter or adding an always-run gate job and (b) hardening those fixtures. `verify` remains the required check. A weekly scheduled run already exists to catch date-dependent failures; this sprint's `reports.test.ts` failure is exactly that class (it lives in `verify`, not `db-tests`).

## 6. Owner decision package (answer per line: Approve / Defer / Change)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Counsel reviews and you publish the EN/FR analytics notice with corrections §1 | Approve review now |
| D2 | Enable `ANALYTICS_CTA_ENABLED` (after D1) | Approve after D1 |
| D3 | Enable `ANALYTICS_SIGNUP_ATTRIBUTION_ENABLED` (after D2 verified) | Approve after D2 |
| D4 | Accept that Google sign-ups are not attributed, or fund a follow-up | Accept for now |
| D5 | Enable `ANALYTICS_RETENTION_APPLY` | Approve after D1 |
| D6 | Delete recovery branches `br-rapid-resonance-aeuusosk`, `br-super-water-aexovmvr`, `backup-pre-analytics-v2-20261022` | Approve deleting all but the newest, then that one later |
| D7 | Search Console + Bing: verify property, submit sitemap (needs your account/DNS) | Do now; independent of everything else |
| D8 | French indexing | Defer until native + legal review |
| D9 | Marketing wording "estimate" vs "Quotes/Devis" | Align marketing to the product menu ("Quotes") |
| D10 | `db-tests` required | Not yet (§5) |

Until you write an approval in the conversation, each item stays unapproved.
