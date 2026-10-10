# SEO — manual steps checklist

Steps that need an account, DNS or dashboard access and are **not** done by code changes. Keep this file updated as
PRs land. Per decision D15, Search Console / Bing / external SEO services are configured at the end, by the owner.
No blocking: all technical infrastructure ships first.

Legend: ☐ pending · ☑ done · ⏸ waiting on a PR

## A. Search Console and Bing (final stage, owner)

- ☐ Google Search Console: add a **Domain property** for `garage-os.ca` (DNS TXT verification).
- ☐ Bing Webmaster Tools: add the site (can import from Search Console).
- ⏸ Submit `https://www.garage-os.ca/sitemap.xml` in both (after the sitemap PR is deployed).
- ⏸ Check in Search Console after deploy of PR "canonical": URL Inspection on `/help`, `/pricing`, `/guides/set-up-your-shop` → "User-declared canonical" must be the page itself, not the home page.
- ⏸ Page indexing report: confirm no `/quote/`, `/portal/`, `/inspection/`, `/book/*/manage/`, `/sales*`, `/admin/*` URL is indexed. If one is, temporarily remove its `Disallow` from `robots.ts` so the crawler can read `noindex`, then restore it; use the Removals tool for urgent cases.
- ⏸ After `/fr` ships: International Targeting is automatic via hreflang; check the hreflang report for return-tag errors.
- ☐ Decide who owns the Search Console / Bing accounts (D15) and add a second owner.

## B. Hosting / DNS (do not change without explicit approval)

- ☑ Read-only check (2026-10-10): Vercel project `garage-os`; `garage-os.ca` → 308 → `www.garage-os.ca`; production `NEXT_PUBLIC_APP_URL` renders as `https://www.garage-os.ca`.
- ☐ Optional: update the **Preview** environment variable `NEXT_PUBLIC_APP_URL`. It is a fixed value pointing at an old branch URL, so canonicals on Preview carry that host. Harmless (Vercel noindexes previews) but misleading when verifying.
- ☐ Authority host is `https://www.garage-os.ca` (D10). Keep the GABAN page `gabansolutions.ca/software/garageos` temporarily; review its traffic and inbound links before deciding on a redirect/canonical (needs GABAN Search Console data).

## C. Data clean-up (owner, after PR "private routes" is deployed)

- ☐ Dry run: `npx tsx scripts/redact-pageview-private-paths.ts --allow-remote` with the production `DATABASE_URL` (prints counts only).
- ☐ If the counts are non-zero and expected: `npx tsx scripts/redact-pageview-private-paths.ts --allow-remote --apply`.
- ☐ Decide whether any token that appeared in `PageView.path` and is still valid (portal and quote links last 30 days) should be revoked. Revoke-all is available per customer in the portal card.

## D. Email provider

- ☐ Resend: confirm **click tracking is off** for the transactional sending domains (quote, portal, inspection, appointment-management and unsubscribe links carry bearer tokens; a tracking domain would see them).

## E. Analytics (after the analytics PR)

- ☐ Update the privacy policy text with the new first-party events/attribution fields (legal review, D8/D13).
- ☐ Confirm no cookies are introduced.

## F. Content and compliance (later stages)

- ☐ Native French review of all FR content (Québec).
- ☐ Legal review: CASL / Law 25 articles; comparison pages; terminology change (Devis).
- ☐ Competitor facts re-verified on official sites on the publication date (this environment cannot open external sites).
- ☐ Directory listings (Capterra / GetApp / Software Advice) — optional external SEO service, owner's decision.
- ☐ `llms.txt` (optional, D20).
