# PR 3 proposal — sitemap, hreflang and multilingual SEO (not started)

Depends on: PR #101 (route table `src/lib/seo/routes.ts`, merged). Independent of PR 4/5 content.

## Scope
1. `src/app/sitemap.ts` generated **from the route table** (single source), only indexable public URLs:
   - EN pages: all `PUBLIC_ROUTES` with an EN path, plus `/guides/*` and `/blog/*` entries from the existing content sources.
   - FR pages: only routes with `frStatus: "live"` and `frIndexable !== false` (none until PR 4).
   - Each entry carries `alternates.languages` (en-CA, fr-CA) only when both exist; never private/token routes (`isPrivatePath`) or `/book/[slug]` shop pages unless the owner opts them in (decision D-shop-pages).
   - `lastModified` only from real data (content dates); omitted otherwise. No fake `priority`/`changefreq`.
2. `Sitemap: https://www.garage-os.ca/sitemap.xml` line in `robots.ts` (host from `getSiteUrl()`).
3. hreflang in page metadata (`pageMetadata`): `alternates.languages` = `{ "en-CA", "fr-CA", "x-default" → EN }` when a live FR equivalent exists; self-referencing; canonical per locale (no cross-locale canonical). Pages without FR keep only their own canonical (no hreflang to a fallback page).
4. `/fr` home: flip to indexable (`frIndexable`) once its content is acceptable to the owner; otherwise stays `noindex` and out of the sitemap. FR pages that are noindex never appear in the sitemap and are not referenced by hreflang.
5. Open Graph: `og:locale` / `og:locale:alternate` already set per root; add `og:url` per page from canonical.
6. Structured data (small, factual): `Organization` + `WebSite` JSON-LD on the home in each locale (name, url; no ratings, no prices not verifiable).
7. Tests: sitemap contains no private/token/noindex URL; every hreflang pair is reciprocal; x-default is EN; FR noindex pages absent; robots has the Sitemap line; canonical tests from PR #99 still pass.

## Out of scope / not touched
No DNS, no Search Console/Bing submission (manual checklist), no Resend, no PageView cleanup, no French page content (PR 4), no Features pages (PR 5), no `/?_rsc` fix (#103).

## Acceptance
tsc, ESLint, tests, build; Preview READY; sitemap.xml and robots.txt inspected on the Preview; production re-verified after merge. Merge only with owner authorization.

## Questions for the owner
- Include `/book/[slug]` shop pages in the sitemap? (default: no)
- Make `/fr` indexable in PR 3, or wait for PR 4 content? (default: wait)
