# Indexation, privacy and token-leak policy

Single source of truth in code: `src/lib/privacy/private-paths.ts` (used by `robots.ts`, the `headers()` in
`next.config.ts`, the analytics beacon and its endpoint, and the clean-up script).

## What is private

| Family | Routes | Protected by |
|---|---|---|
| App and APIs | `/admin/**`, `/platform/**`, `/api/**` | Session / route authorization |
| Token links (bearer) | `/portal/*`, `/quote/*`, `/inspection/*`, `/book/<slug>/manage/*`, `/sales/*`, `/sales-invite/*`, `/sales-recover`, `/sales-recovery-email/*`, `/account-recovery`, `/activate-demo/*` | The token itself (high entropy, stored hashed, expiring, revocable) |

Public and indexable: marketing and Resources pages, `/watch/{en,fr}` (clean URL), `/demo`, and each shop's public
booking page `/book/<slug>`. `/demo/booking` is public but `noindex` and not counted in analytics.

## Important: `noindex` is not a security control

`noindex`, `X-Robots-Tag` and `robots.txt` only keep well-behaved search engines from listing or copying a URL.
They do not protect it. Anyone holding a token URL can open it. The controls are the token properties above and
the session. Do not rely on indexation settings to hide data.

## Layers applied

1. `robots.txt` (`src/app/robots.ts`): `Disallow` for every private family. Trailing `/` and `$` forms so a future
   public page that merely shares a prefix (`/quote-software`) is not blocked.
2. `X-Robots-Tag: noindex, nofollow, noarchive` header on every private family (also covers PDFs, 404s for a bad
   token and other non-HTML responses).
3. `<meta name="robots">` in page metadata: `src/app/admin/layout.tsx` (all of `/admin`, including login and
   signup), `src/app/platform/layout.tsx`, `portal/layout.tsx`, `/quote/[token]`, `/inspection/[token]`,
   `/book/[slug]/manage/[token]`, and the `/sales*`, `/account-recovery`, `/activate-demo` pages (already present).
4. If Search Console ever shows a private URL as indexed, temporarily remove its `Disallow` so the crawler can read
   the `noindex`, then restore it.

## Token leakage review

| Channel | Finding | Action |
|---|---|---|
| **Own analytics** | **Leak.** `AnalyticsBeacon` sent every pathname to `/api/track` and `PageView.path` stored it. Only `/admin`, `/platform`, `/activate-demo` and `/demo/booking` were skipped, so portal, quote, inspection, appointment-management and sales tokens were written to the database and listed in the Super Admin traffic panel. | Beacon and endpoint now drop private paths (`isTrackablePath`). `scripts/redact-pageview-private-paths.ts` removes rows already stored (dry-run by default). |
| Referer header | Browsers default to `strict-origin-when-cross-origin`, which sends only the origin cross-site. Older clients and third-party resources could still receive the full URL. | `Referrer-Policy: same-origin` header on all token routes; same value in page metadata. Deliberately **not** `no-referrer`: with it browsers send `Origin: null` on same-origin POSTs, which breaks Server Actions (quote approval, appointment link). A test forbids `no-referrer` on those routes. |
| Third-party resources on token pages | None found: the inspection page loads photos from its own origin (`/inspection/<token>/photo/<id>`); no iframes or external assets in portal, quote, inspection or manage pages. | None needed. |
| Server application logs | No code path logs a token. Existing `console.error` lines log internal ids only. | None. |
| Platform request logs | Vercel request logs record the URL path, so tokens appear there. Inherent to path-based tokens. | Residual risk: keep log retention/access limited; tokens are hashed at rest, expire (portal and quote: 30 days) and are revocable. |
| Email click tracking | No tracking flags are set in the sending code; the provider's domain-level setting could still rewrite links through a tracking domain. | Manual check (see checklist): click tracking off for transactional domains. |
| `document.referrer` into analytics | Beacon sends it; the server stores only the host name. | None. |

## Out of scope here (decided separately)

Indexation policy for individual shops' public pages (`/book/<slug>`), sitemap, hreflang, `/fr` routes.
