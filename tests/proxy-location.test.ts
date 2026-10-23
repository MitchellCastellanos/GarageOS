// The proxy must live in src/ (next to src/app) or Next ignores it; and the host-resolution logic must be safe.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  createHostSlugCache, hostWithoutPort, resolveShopSlug, resolveShopSlugSafely, withTimeout, type HostLookups,
} from "../src/lib/shop-host";

test("proxy.ts is in src/ (beside src/app) and not at the repository root", () => {
  assert.ok(fs.existsSync("src/app"), "the app directory is under src/");
  assert.ok(fs.existsSync("src/proxy.ts"), "src/proxy.ts exists");
  assert.ok(!fs.existsSync("proxy.ts") && !fs.existsSync("middleware.ts"), "a root proxy.ts/middleware.ts is ignored by Next when app lives in src/");
  const src = fs.readFileSync("src/proxy.ts", "utf8");
  assert.match(src, /matcher:\s*\["\/"\]/);
  assert.match(src, /export async function proxy\(/);
});

function fakeLookups(over: Partial<HostLookups> & { calls?: string[] } = {}): HostLookups & { calls: string[] } {
  const calls = over.calls ?? [];
  return {
    calls,
    rootDomain: over.rootDomain ?? "garageos.example",
    shopSlugBySubdomain: over.shopSlugBySubdomain ?? (async (s) => (calls.push(`sub:${s}`), s === "laurent" ? "laurent" : null)),
    shopSlugByVerifiedDomain: over.shopSlugByVerifiedDomain ?? (async (d) => (calls.push(`dom:${d}`), d === "citas.laurent.example" ? "laurent" : null)),
  };
}

test("subdomain and verified custom domain resolve; reserved, nested, unknown and unverified do not", async () => {
  const l = fakeLookups();
  assert.equal(await resolveShopSlug("laurent.garageos.example", l), "laurent");
  assert.equal(await resolveShopSlug("citas.laurent.example", l), "laurent");
  assert.equal(await resolveShopSlug("www.garageos.example", l), null);
  assert.equal(await resolveShopSlug("admin.garageos.example", l), null);
  assert.equal(await resolveShopSlug("a.b.garageos.example", l), null);
  assert.equal(await resolveShopSlug("nope.garageos.example", l), null);
  assert.equal(await resolveShopSlug("garageos.example", l), null, "the root domain itself is looked up as a custom domain, not a subdomain");
  assert.equal(await resolveShopSlug("pending.example", l), null);
  assert.equal(hostWithoutPort("Citas.Laurent.Example:3000"), "citas.laurent.example");
});

test("results are cached for the TTL; errors and timeouts are not cached and fail open", async () => {
  const t = 1000;
  const cache = createHostSlugCache(60_000);
  const l = fakeLookups();
  assert.equal(await resolveShopSlugSafely("laurent.garageos.example", l, cache, { now: () => t }), "laurent");
  assert.equal(await resolveShopSlugSafely("laurent.garageos.example", l, cache, { now: () => t + 59_000 }), "laurent");
  assert.equal(l.calls.length, 1, "second call served from cache");
  assert.equal(await resolveShopSlugSafely("laurent.garageos.example", l, cache, { now: () => t + 61_000 }), "laurent");
  assert.equal(l.calls.length, 2, "expired entry is looked up again");

  const kinds: string[] = [];
  let fail = true;
  const flaky = fakeLookups({ shopSlugByVerifiedDomain: async () => { if (fail) throw new Error("db down"); return "laurent"; } });
  assert.equal(await resolveShopSlugSafely("x.example", flaky, cache, { onError: (k) => kinds.push(k) }), null);
  fail = false;
  assert.equal(await resolveShopSlugSafely("x.example", flaky, cache), "laurent", "the failure was not cached");
  assert.deepEqual(kinds, ["db down"]);

  const hang = fakeLookups({ shopSlugByVerifiedDomain: () => new Promise<string | null>(() => {}) });
  const started = Date.now();
  assert.equal(await resolveShopSlugSafely("hang.example", hang, cache, { timeoutMs: 40, onError: (k) => kinds.push(k) }), null);
  assert.ok(Date.now() - started < 1000);
  assert.equal(kinds[kinds.length - 1], "timeout");
  assert.equal(cache.get("hang.example", Date.now()), undefined);
});

test("withTimeout passes values and errors through", async () => {
  assert.equal(await withTimeout(Promise.resolve(5), 100), 5);
  await assert.rejects(withTimeout(Promise.reject(new Error("boom")), 100), /boom/);
});

test("the cache is bounded against hostile Host headers", () => {
  const cache = createHostSlugCache(60_000);
  for (let i = 0; i < 5000; i++) cache.set(`h${i}.example`, null, 0);
  let alive = 0;
  for (let i = 0; i < 5000; i++) if (cache.get(`h${i}.example`, 1)) alive++;
  assert.ok(alive <= 1000);
});
