// SEC-05: the visitor hash is an HMAC keyed by a server-only secret, not a hash of public values.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { __resetVisitorHashForTests, hashVisitor } from "../src/lib/privacy/visitor-hash";

const SECRET = "test-secret-test-secret-test-secret-1234";
const OTHER = "other-secret-other-secret-other-secret-99";
const NOW = new Date("2026-10-22T10:00:00Z");
const IP = "203.0.113.77";
const UA = "Mozilla/5.0 (X11; Linux x86_64) Test";

test("deterministic for same inputs, secret and UTC day; 32 hex chars; no IP in output", () => {
  const a = hashVisitor(IP, UA, { secret: SECRET, now: NOW });
  const b = hashVisitor(IP, UA, { secret: SECRET, now: new Date("2026-10-22T23:59:59Z") });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.ok(!a.includes(IP) && !a.includes("203"));
});

test("different day, IP, UA or secret gives a different hash", () => {
  const base = hashVisitor(IP, UA, { secret: SECRET, now: NOW });
  assert.notEqual(base, hashVisitor(IP, UA, { secret: SECRET, now: new Date("2026-10-23T00:00:00Z") }));
  assert.notEqual(base, hashVisitor("203.0.113.78", UA, { secret: SECRET, now: NOW }));
  assert.notEqual(base, hashVisitor(IP, UA + "x", { secret: SECRET, now: NOW }));
  assert.notEqual(base, hashVisitor(IP, UA, { secret: OTHER, now: NOW }));
});

test("matches HMAC-SHA256 over `day|ip|ua` and not the old public-salt sha256", () => {
  const got = hashVisitor(IP, UA, { secret: SECRET, now: NOW });
  const hmac = crypto.createHmac("sha256", SECRET).update(`2026-10-22|${IP}|${UA}`).digest("hex").slice(0, 32);
  const legacy = crypto.createHash("sha256").update(`2026-10-22|${IP}|${UA}`).digest("hex").slice(0, 32);
  assert.equal(got, hmac);
  assert.notEqual(got, legacy);
});

test("missing or short secret: ephemeral key, stable within the process, never the legacy formula, one warning", () => {
  __resetVisitorHashForTests();
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args.join(" "));
  try {
    const legacy = crypto.createHash("sha256").update(`2026-10-22|${IP}|${UA}`).digest("hex").slice(0, 32);
    const missing = hashVisitor(IP, UA, { secret: undefined, now: NOW });
    const short = hashVisitor(IP, UA, { secret: "too-short", now: NOW });
    const empty = hashVisitor(IP, UA, { secret: "", now: NOW });
    assert.match(missing, /^[0-9a-f]{32}$/);
    assert.equal(missing, short);
    assert.equal(missing, empty);
    assert.notEqual(missing, legacy);
    assert.notEqual(missing, hashVisitor(IP, UA, { secret: SECRET, now: NOW }));
    assert.equal(warnings.length, 1, "warns exactly once");
    assert.ok(!warnings[0].includes(IP) && !warnings[0].includes(UA) && !warnings[0].includes(SECRET));
    // A fresh process (simulated) gets a different ephemeral key.
    __resetVisitorHashForTests();
    assert.notEqual(missing, hashVisitor(IP, UA, { secret: undefined, now: NOW }));
  } finally {
    console.warn = original;
    __resetVisitorHashForTests();
  }
});

test("reads ANALYTICS_HASH_SECRET from the environment by default", () => {
  const prev = process.env.ANALYTICS_HASH_SECRET;
  process.env.ANALYTICS_HASH_SECRET = SECRET;
  try {
    assert.equal(hashVisitor(IP, UA, { now: NOW }), hashVisitor(IP, UA, { secret: SECRET, now: NOW }));
  } finally {
    if (prev === undefined) delete process.env.ANALYTICS_HASH_SECRET;
    else process.env.ANALYTICS_HASH_SECRET = prev;
  }
});

test("analytics.ts uses the shared helper and no longer carries the public date salt", () => {
  const src = readFileSync("src/lib/platform/analytics.ts", "utf8");
  assert.ok(src.includes('from "@/lib/privacy/visitor-hash"'));
  assert.ok(!src.includes("dailySalt"));
  assert.ok(!src.includes("createHash"));
});
