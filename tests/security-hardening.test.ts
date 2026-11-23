import test from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../next.config";

test("private/token routes are not frameable; /book (embeddable) is", async () => {
  const headers = await nextConfig.headers!();
  const framing = headers.filter((h) => h.headers.some((x) => x.key === "X-Frame-Options"));
  assert.ok(framing.length > 0);
  const sources = framing.map((h) => h.source);
  assert.ok(sources.includes("/admin/:path*"));
  assert.ok(sources.every((s) => !s.startsWith("/book/:slug") || s.includes("manage")));
  assert.ok(!sources.includes("/book/:path*"));
  const base = headers.find((h) => h.source === "/:path*");
  assert.ok(base?.headers.some((x) => x.key === "Strict-Transport-Security"));
  assert.ok(base?.headers.some((x) => x.key === "X-Content-Type-Options" && x.value === "nosniff"));
});
