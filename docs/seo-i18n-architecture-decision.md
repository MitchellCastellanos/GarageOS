# Decision: separate root layouts for EN / FR public HTML

Status: proposed in PR "EN/FR routing infrastructure" (tanda 2, PR 2). Pending owner review.

## Problem

Indexable pages must serve correct `<html lang>` (`en-CA` / `fr-CA`) in the
initial HTML (WCAG 3.1.1, search-engine language signals). Today a single root
layout hardcodes the language, and French was client-side only (a toggle),
so crawlers never saw French.

## Options compared

| Criterion | A. Separate root layouts (route groups) | B. Single root layout, `lang="fr-CA"` on a container |
|---|---|---|
| `<html lang>` correct in SSR HTML | Yes, per locale | No: `<html>` keeps one value; a nested `lang` div is not what crawlers/AT use as document language |
| Dynamic reading of locale in root layout | Not needed (static per group) | Needs `headers()`/`cookies()` or a param in the root → makes **every** page dynamic, losing static/ISR (home uses `revalidate = 300`) |
| Next.js impact | Supported pattern; navigation between roots is a full page load (EN↔FR only) | None structurally, but forces dynamic rendering to get a real `<html lang>` |
| Dashboard / auth / private routes | Unchanged URLs; they live in the `(site)` group with the EN root (verified by spike: 152–160 files moved mechanically, URLs identical) | Unchanged |
| Metadata | Per-root `metadata` via `rootMetadata(locale)`; page metadata via `pageMetadata()` with alternates | One root metadata; locale must be injected per page |
| Performance | Static/ISR preserved; full reload only when switching language | Dynamic rendering cost on all pages |
| Maintenance | One-time file move; routes table in `src/lib/seo/routes.ts` is the single source | Fewer moves, but fragile hacks (client-set `lang`, dynamic root) |
| Risk | Moderate, mitigated: no URL change, 404 behaviour unchanged, existing 32 privacy/indexation tests still pass | Low migration risk, but does not meet the goal |

## Decision

Option A. Route groups `(site)` (English, all current URLs) and `(fr)`
(`/fr/…`, translated slugs), each with its own root layout built from the shared
`RootShell`. No automatic language redirect and no permanent banner; the
switcher uses real `<a hrefLang>` links resolved by the routes table, with an
explicit fallback (nearest ancestor, then locale home) when a page has no
equivalent. Login/signup keep the legacy in-place preference.

## Evidence

- Spike: moved routes into `(site)`; build output URL list unchanged; static/ISR
  markers preserved; default 404 unchanged.
- `tests/i18n-routing.test.ts`: route table, slugs, switch targets and fallbacks.
- `tests/seo-canonical.test.ts` and PR #100 privacy suite pass on the new layouts.
- Browser checks: html `lang` per locale, switcher links, fallbacks.

## Known pre-existing finding (not caused by this change)

On `/`, revisits sometimes hang 7–30 s on `GET /?_rsc=…` prefetches (aborted),
reproduced identically on `main` baseline build under local `next start`.
Tracked separately; not a blocker for this PR.

## Not in this PR

French pages remain `noindex` until PR 3 (sitemap/hreflang) and PR 4 (French
commercial pages) land.
