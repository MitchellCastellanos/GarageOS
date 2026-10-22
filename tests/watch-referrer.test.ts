// SEC-07: the tokenised /watch/[lang]?t=<token> URL must not leak through Referer, caches or indexes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import nextConfig from "../next.config";

const read = (p: string) => readFileSync(p, "utf8");

test("next.config: /watch/* sends Referrer-Policy same-origin and noindex; tokenised URLs are no-store", async () => {
  const rules = await nextConfig.headers!();
  const watch = rules.filter((r) => r.source === "/watch/:path*");
  const val = (key: string, pred: (r: (typeof watch)[number]) => boolean = () => true) =>
    watch.filter(pred).flatMap((r) => r.headers).find((h) => h.key === key)?.value;
  assert.equal(val("Referrer-Policy"), "same-origin", "same-origin keeps first-party POSTs working (no-referrer would send Origin: null)");
  assert.match(val("X-Robots-Tag") ?? "", /noindex/);
  const tokenRule = watch.find((r) => r.headers.some((h) => h.key === "Cache-Control"));
  assert.ok(tokenRule, "token URLs need Cache-Control");
  assert.deepEqual(tokenRule!.has, [{ type: "query", key: "t" }]);
  assert.match(tokenRule!.headers.find((h) => h.key === "Cache-Control")!.value, /no-store/);
  // The unconditional rules must not cache anything.
  assert.equal(val("Cache-Control", (r) => !r.has), undefined);
});

test("watch UI: no external links, every target=_blank is noopener+noreferrer, poster image sends no referrer", () => {
  for (const f of ["src/components/video/WatchClient.tsx", "src/components/video/VideoPlayer.tsx"]) {
    const src = read(f);
    assert.ok(!/href=["'`]https?:\/\//.test(src), `${f} must not link to an external host`);
    for (const m of src.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/g)) {
      assert.match(m[0], /rel=["'][^"']*noopener[^"']*noreferrer|rel=["'][^"']*noreferrer[^"']*noopener/, `${f}: ${m[0]}`);
    }
  }
  assert.match(read("src/components/video/VideoPlayer.tsx"), /<img [^>]*referrerPolicy="no-referrer"/);
});

test("the token never reaches metadata, the analytics beacon or the CTA redirect target", () => {
  const page = read("src/lib/watch-page.tsx");
  // canonical/og:url are built from watchPath() (no query); the token is only handed to the client component.
  assert.match(page, /canonicalUrl\(watchPath\(/);
  assert.ok(!/canonical[^\n]*\bsp\b|url: path[^\n]*token/.test(page));
  const beacon = read("src/components/AnalyticsBeacon.tsx");
  assert.match(beacon, /path: pathname,/);
  assert.ok(!/location\.(href|search)|searchParams\.toString\(\)|searchParams\.get\("t"\)/.test(beacon), "beacon must send pathname only");
  const cta = read("src/app/api/video/cta/route.ts");
  assert.match(cta, /dest\.origin !== new URL\(getAppUrl\(\)\)\.origin/, "redirect stays on our origin");
});

test("first-party video beacons authenticate by token, not by Referer/Origin", () => {
  for (const f of ["src/app/api/video/event/route.ts", "src/app/api/video/cta/route.ts"]) {
    assert.ok(!/referer|"origin"/i.test(read(f)), `${f} must not depend on Referer/Origin`);
  }
});
