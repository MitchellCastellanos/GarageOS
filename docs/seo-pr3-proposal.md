# PR #3 — Sitemap, hreflang and multilingual SEO (implementable spec, NOT started)

Entry point for context: [`SEO_HANDOFF.md`](./SEO_HANDOFF.md). Status: **specification only; no code written.**
(Naming: "PR #3" is the program step; the master plan calls the sitemap work PR-03 and the FR route/hreflang work PR-05b. GitHub PR numbers are assigned when opened.)

Base: `main` (EN/FR routing from PR #101 is merged; route table in `src/lib/seo/routes.ts`).

## Final owner decisions (binding)

1. `/book/[slug]` shop pages are **NOT** in the global sitemap (they stay crawlable per `robots.ts`; unchanged).
2. `/fr` stays `noindex, follow` until the French pages are complete and approved for indexing. It is **not** in the sitemap and **not** referenced by hreflang until then.
3. hreflang links only **real equivalent pages that are indexable and have their own canonical**. Never point to fallbacks (e.g. the language switcher's `/fr` fallback for `/pricing`) or to `noindex` pages.
4. Keep `en-CA`, `fr-CA` and `x-default` → the English URL where applicable.
5. No DNS, Search Console, Bing or Resend changes in this step.

## Planned files

| File | Change |
|---|---|
| `src/app/sitemap.ts` (new) | `MetadataRoute.Sitemap` built from the route table + content sources. Host from `getSiteUrl()` (`src/lib/seo/site.ts`, authority `https://www.garage-os.ca`). |
| `src/lib/seo/sitemap-entries.ts` (new, pure, testable) | `buildSitemapEntries()` returning `{ url, alternates?, lastModified? }[]`; no Next imports so `tsx --test` can load it. |
| `src/lib/seo/routes.ts` | Add a pure helper `alternatesFor(path)` → `{ "en-CA"?, "fr-CA"?, "x-default"? }` (absolute URLs) that returns hreflang only when BOTH locales are live+indexable; otherwise `undefined`. Do not change `switchTarget` (the switcher keeps its fallbacks). |
| `src/lib/seo/metadata.ts` | `pageMetadata()` adds `alternates.languages` from `alternatesFor(path)` (canonical stays self-referencing per locale). Keep the existing "noindex for non-indexable FR" behaviour. |
| `src/app/robots.ts` | Add `sitemap: \`${getSiteUrl()}/sitemap.xml\``; keep every existing `Disallow`. |
| `src/lib/seo/json-ld.ts` (new) | `organizationJsonLd()`, `webSiteJsonLd(locale)`; rendered on the home of each locale only. |
| `src/app/(site)/page.tsx`, `src/app/(fr)/fr/page.tsx` | Render the JSON-LD script (FR home only emits it if indexable; today it is noindex → omit). |
| `tests/seo-sitemap.test.ts` (new) | See acceptance tests. |
| `docs/seo-master-plan.md`, `docs/seo-manual-checklist.md` | Update status; never remove manual items. |

## Sitemap inclusion / exclusion rules

Include (EN): every `PUBLIC_ROUTES` entry with an EN path that is an indexable public page (`/`, `/product`, `/features`, `/pricing`, `/integrations`, `/demo`, `/get-started`, `/quick-start`, `/about`, `/contact`, `/privacy`, `/terms`, `/changelog`, `/help`, `/guides`, `/blog`) plus each `/guides/<slug>` and `/blog/<slug>` from their existing content sources (`src/components/marketing/ResourceArticles.tsx` and the guide/blog page modules — read them to enumerate slugs; do not hard-code a second list).
Include (FR): only routes with `frStatus: "live"` AND `frIndexable !== false` (currently none; `/fr` is `frIndexable: false`).
Each included URL = its own canonical (`canonicalUrl(path)`; no trailing slash except the root rule already in `site.ts`).
`alternates.languages` only if `alternatesFor(path)` returns a pair.
`lastModified`: only from a real date in the content source; otherwise omit. No fake `priority` / `changefreq`.
Exclude always: anything where `isPrivatePath()` / `isTokenPath()` (`src/lib/privacy/private-paths.ts`) is true (`/admin`, `/platform`, `/api`, `/portal`, `/quote`, `/inspection`, `/sales*`, `/activate-demo`, `/account-recovery`, `/book/*/manage`, …); `/book/[slug]` (decision 1); `/watch/*` unless the owner decides otherwise (not decided → exclude); login/signup; any page whose metadata is `noindex`; any URL with a query string.

## Canonical rules

Unchanged from PR #99/#101: each page declares its own absolute canonical via `pageMetadata()`; root layouts declare none. EN and FR versions of a page each canonicalize to themselves (no cross-locale canonical). A noindex page still has its own canonical but is excluded from sitemap and hreflang.

## hreflang rules (reciprocal)

- Emit `en-CA` and `fr-CA` on a page only if the equivalent exists with `frStatus: "live"`, is indexable, and is itself listed in the sitemap.
- Both pages of a pair carry the same set (reciprocity), each including a self-reference.
- `x-default` = the English URL of the pair.
- Pages without a live FR equivalent: no hreflang at all (only their own canonical).
- Never derive hreflang from `switchTarget` (it returns fallbacks by design).

## JSON-LD (only verifiable facts)

`Organization`: name `GarageOS`, url `https://www.garage-os.ca`, logo URL that exists in `public/`. `WebSite`: name, url, `inLanguage`. No `AggregateRating`, no review markup, no prices (`Offer` waits for the pricing PR), no `SoftwareApplication` until feature claims are verified. Validate JSON parses; keep it out of private/noindex pages.

## Acceptance tests (`tests/seo-sitemap.test.ts` + existing suites)

1. Sitemap has no URL for which `isPrivatePath`/`isTokenPath` is true, none under `/book/`, none noindex, none with `?`.
2. Every sitemap URL starts with `https://www.garage-os.ca` (authority host) regardless of Preview env.
3. FR URLs appear only for live+indexable routes (today: zero); `/fr` absent.
4. hreflang reciprocity: for every pair A↔B, B lists A; `x-default` equals the EN URL; no hreflang target is noindex or missing from the sitemap.
5. A page with no live FR equivalent emits no `alternates.languages`.
6. `robots.txt` contains the `Sitemap:` line and still contains all previous `Disallow` rules (existing `tests/privacy-indexation.test.ts` stays green).
7. Canonical tests (`tests/seo-canonical.test.ts`) and i18n route tests (`tests/i18n-routing.test.ts`) stay green.
8. JSON-LD parses and contains only the allowed fields.
Plus: `npx tsc --noEmit`, `npx eslint`, full `npx tsx --test tests/*.test.ts`, `next build`, Vercel Preview READY, inspect `/sitemap.xml` and `/robots.txt` on the Preview, then on production after merge.

## Risks

- Preview canonicals use a stale `NEXT_PUBLIC_APP_URL` (known pending item): the sitemap must use `getSiteUrl()` consistently; tests must not depend on the env var.
- Turning a FR page `live` + indexable later (PR #4) automatically adds it to sitemap + hreflang: that is intended, but PR #4 must add FR pages and flip the flags together.
- Do not let the sitemap enumerate dynamic content that is not meant to be public.
- Vercel Preview build may flake on the Oswald font fetch: allow one redeploy of the same commit; never an empty commit.

## Must NOT touch

DNS; Search Console/Bing submission (manual checklist); Resend; PageView data/cleanup; migrations; env vars; dependencies; auth/dashboard/portal/quote/booking logic; `proxy.ts`; French page content (PR #4); Features pages (PR #5); the `/?_rsc` investigation (issue #103); language-switcher fallback behaviour.

## Out of scope (owner decisions pending)

Whether `/watch/*` pages are sitemap-eligible; when `/fr` becomes indexable (after FR content approval).
