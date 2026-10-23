# PERF-01 / issue #103: slow `GET /?_rsc=` on revisits of `/`

Status: **not reproducible locally; no code change made.** Investigated 2026-10-23 on `main` (Next 16.2.3, Node 22).

## Method

- `next build` + `next start -p 3000` with the placeholder env from `docs/testing.md` (`NEXT_PUBLIC_APP_URL=http://localhost:3000`).
- Playwright (preinstalled Chromium), one page, listeners on `request` / `response` / `requestfailed`, timing every URL containing `_rsc=`.
- Sequence: load `/` (wait for `networkidle`), then client-side click `/pricing`, `/`, `/fr`, `/`, `/pricing`, `/` (4 s between steps, 10 s tail).
- Run twice on `localhost:3000` and once on `127.0.0.1:3000`.

## Numbers

| Run | `_rsc` requests | Max latency | Failed / aborted / pending | `/?_rsc=` latency |
|---|---|---|---|---|
| `localhost:3000` run 1 | 82 | 20 ms | 0 | 0-10 ms |
| `localhost:3000` run 2 | 82 | 20 ms | 0 | 0-10 ms |
| `127.0.0.1:3000` | 82 | 20 ms | 0 | 0-10 ms |

`networkidle` on `/` reached in about 1 s every time. The issue reports 7-30 s and `ERR_ABORTED`; none of that appears here.

## Hypotheses and verdicts

1. **`proxy.ts` matching RSC requests: ruled out for production.**
   - `proxy.ts` sits at the repo root but the app lives in `src/`. Next only registers a proxy at `src/proxy.ts` when a `src/` directory exists. The build route table has **no `Proxy (Middleware)` entry**, and a `console.log` probe at the top of `proxy()` never fired across any request. The file is compiled but never invoked, so shop-domain resolution (custom domains, subdomains) does not run at all today.
   - Experiment only (not committed): moving it to `src/proxy.ts` makes the build list `Proxy (Middleware)` and the probe fire on every `/` and `/?_rsc=` request. For the app host (`localhost`) the proxy returns immediately (0.01-0.13 s). For any other host with an unreachable database (`DATABASE_URL` pointing at a black-holed IP) `/` and `/?_rsc=` **hang until the client gives up (25 s timeout, no response)**. So the proxy would be a plausible 7-30 s hang source for non-app hosts if it were active; it is not active.
   - Consequence: it cannot explain #103 on `www.garage-os.ca`. It is a separate finding (see "Separate finding").
2. **ISR `revalidate = 300` on `src/app/(site)/page.tsx`: not reproduced.** `/` is served prerendered (`x-nextjs-cache: HIT`, `s-maxage=300`) in about 5 ms, RSC and HTML. A revalidation after 300 s was not exercised locally; on Vercel the stale-while-revalidate path is platform behaviour.
3. **Link prefetch of many routes from `HomeView` / `MarketingHeader`: not reproduced.** About 27 distinct prefetch URLs per page (`/pricing`, `/features`, `/product`, `/demo`, `/get-started`, `/admin/login`, `/fr`, `/`), all 200 in under 20 ms. `prefetch={false}` was therefore not tried: there is nothing to improve locally and it would change navigation behaviour.
4. **Blocking server component / DB call on `/`: not reproducible.** The home route is static; with an unreachable database `/` still returns in about 10 ms.

## What is still unknown

The original report was against a local `next start` and could not be matched here. The reporter's environment may differ (different `NEXT_PUBLIC_APP_URL`, a custom `Host`, a reachable but slow database, many open tabs, a dev proxy). With the current code the only code path able to produce a multi-second hang on `/?_rsc=` is the proxy's database lookup, and it is dormant. A production-only cause (Vercel edge cache, ISR regeneration, function cold start) cannot be confirmed or excluded from this sandbox.

## Production data needed (owner)

Vercel project logs, last 7 days, production:

1. Runtime logs for requests with `path` = `/` and query containing `_rsc`: list `duration`/`durationMs`, `statusCode`, `cache` (HIT / STALE / MISS / REVALIDATED). Question: are slow ones MISS/STALE (regeneration) or HIT (platform/edge)?
2. Same query for `/fr` and `/pricing` as the control. The issue says those stay under 1 s.
3. Count of `statusCode` 499 / client-closed for `/?_rsc=` vs other routes.
4. Function invocations for `/` (not edge cache hits): is the home route rendering at runtime and how long? Check Observability, route `/`, p50/p95 duration and cold start share.
5. Whether the slow requests cluster around 300 s boundaries after the last render (ISR) or are random.
6. Real User Monitoring / Speed Insights: INP/TTFB for `/` on returning visits, by browser.

If (1) shows MISS/STALE with long durations, the cause is regeneration of `/` (it calls the cached published-video list; inspect that fetch). If it shows HIT with long durations, it is Vercel-side and `prefetch={false}` on the home/logo links is the cheapest mitigation to trial on a Preview.

## Separate finding: `proxy.ts` is inert

`proxy.ts` must live at `src/proxy.ts` to be picked up; at the root it is ignored. `docs/SEO_FUTURE_BACKLOG.md` line 25 states "`proxy.ts` is at the repository root (not `src/proxy.ts`)" as if intended, and `docs/launch-readiness.md` describes it as active. If custom domains / subdomains are expected to work, moving it activates a DB lookup for every non-app-host request to `/`; add a lookup timeout and skip `?_rsc` / prefetch requests at the same time, and test on a Preview first. This PR does not move it because that changes production routing behaviour and needs an owner decision.
