// Signup attribution: personal-looking or unsafe hand-off values are dropped, never stored. Pure, no database.
import assert from "node:assert/strict";
import test from "node:test";
import { buildSignupAttribution, cleanReferrerHost, sanitizeHandoff } from "../src/lib/analytics/signup-attribution";

test("privacy: personal-looking or unsafe values are dropped from every field, never stored", () => {
  const personal = [
    "me@example.com", "514-555-0199", "+1 (514) 555 0199", "5145550199", "https://evil.example/x?a=b", "//evil.example", "javascript:alert(1)",
    ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxIn0", "sig"].join("."), ["sk", "live", "abcdefghijklmnopqrstuvwxyz"].join("_"), // assembled at runtime: not real secrets, and keeps secret scanners quiet "0123456789abcdef0123456789abcdef", "1.2.3.4", "<script>", "../../etc/passwd",
  ];
  for (const bad of personal) {
    assert.deepEqual(sanitizeHandoff({ from: bad, lang: bad, cta: bad, utm_source: bad, utm_medium: bad, utm_campaign: bad }), {}, `drops: ${bad}`);
    const r = buildSignupAttribution({ from: bad, lang: bad, lp: bad, cta: bad, utm_source: bad, utm_medium: bad, utm_campaign: bad }, { referrerHost: bad });
    assert.equal(JSON.stringify(r).includes(bad), false, `never stored: ${bad}`);
    assert.equal(r.channel, "direct");
    assert.equal(r.referrerHost, "", `referrer host rejects: ${bad}`);
  }
  assert.equal(cleanReferrerHost("me@example.com"), "");
  assert.equal(cleanReferrerHost("https://evil.example/x"), "");
});

test("privacy: landing paths lose query strings and fragments; private and tokenised prefixes are dropped entirely", () => {
  assert.equal(sanitizeHandoff({ lp: "/pricing?email=a@b.com&token=abc#x" }).lp, "/pricing");
  for (const priv of ["/admin/signup", "/admin/dashboard", "/api/auth/signup", "/portal/abcdefghijklmnopqrstuvwxyz012345"]) assert.equal(sanitizeHandoff({ lp: priv }).lp, undefined, `private prefix dropped: ${priv}`);
  for (const lp of ["/a@b.com", "/514-555-0199", "/5145550199", "/call/514.555.0199", "https://evil.example/pricing", "\\\\evil"]) {
    assert.equal(sanitizeHandoff({ lp }).lp, undefined, `dropped: ${lp}`);
  }
  assert.equal(sanitizeHandoff({ lp: "//evil.example" }).lp, "/evil.example", "a protocol-relative URL collapses to a plain (harmless) path, never a URL");
  assert.equal(sanitizeHandoff({ lp: "/blog/useful-vehicle-history-guide-for-buyers" }).lp, "/blog/useful-vehicle-history-guide-for-buyers", "long legitimate slugs survive");
});

test("privacy: the stored surface is minimal (no email, IP, user agent, visitor hash or free text)", () => {
  assert.deepEqual(Object.keys(buildSignupAttribution({ from: "home:x", utm_source: "a" })).sort(), ["channel", "ctaId", "landingPath", "locale", "pageType", "referrerHost", "utmCampaign", "utmMedium", "utmSource"]);
});
