import assert from "node:assert/strict";
import test from "node:test";
import { capabilitiesFor } from "../src/domain/sales-crm/access";
import { checkCorporateEmail, checkRecoveryEmail, isCorporateEmail, leaksRecoveryEmail, recoveryTarget, defaultSenderFacts } from "../src/domain/sales-crm/identity";
import { NO_ENGAGEMENT, cityKey, evaluateAcquisition, evaluateColdEmail, provinceCode, requiredMode, resolveTerritory, type TerritoryRule } from "../src/domain/sales-crm/territory";
import { canPublish, pickVideo, safeHttpsUrl, videoCtaText, type VideoRow } from "../src/domain/platform-video";
import { BUILTIN_TEMPLATES, COMMERCIAL_TEMPLATE_KEYS, TEMPLATE_KEYS, renderTemplate, unknownVariables } from "../src/domain/sales-comms/templates";
import { buildSignature } from "../src/domain/sales-comms/signature";

// ── Corporate identity ────────────────────────────────────────────────────────
test("corporate login must be a @garage-os.ca address; the recovery email must be private and different", () => {
  assert.deepEqual(checkCorporateEmail("  JPerez@Garage-OS.ca "), { ok: true, email: "jperez@garage-os.ca" });
  for (const bad of ["jperez@gmail.com", "jperez@garage-os.com", "jperez@evil.garage-os.ca", "@garage-os.ca", "x@garage-os.ca", "j perez@garage-os.ca", "jperez@garage-os.ca.evil.com"]) {
    assert.equal(checkCorporateEmail(bad).ok, false, bad);
  }
  assert.equal(isCorporateEmail(null), false);
  assert.deepEqual(checkRecoveryEmail("Jose@Hotmail.com", "jperez@garage-os.ca"), { ok: true, email: "jose@hotmail.com" });
  assert.deepEqual(checkRecoveryEmail("other@garage-os.ca", "jperez@garage-os.ca"), { ok: false, code: "RECOVERY_IS_CORPORATE" });
  assert.deepEqual(checkRecoveryEmail("nope", "jperez@garage-os.ca"), { ok: false, code: "INVALID_EMAIL" });
});

test("only a VERIFIED recovery address can receive account-recovery links", () => {
  assert.equal(recoveryTarget({ recoveryEmail: "a@b.co", recoveryEmailVerifiedAt: null }), null);
  assert.equal(recoveryTarget({ recoveryEmail: null, recoveryEmailVerifiedAt: new Date() }), null);
  assert.equal(recoveryTarget({ recoveryEmail: "a@b.co", recoveryEmailVerifiedAt: new Date() }), "a@b.co");
});

test("the private recovery address never appears in the sender identity or the prospect-facing signature", () => {
  const facts = defaultSenderFacts({ displayName: null, userName: "José Pérez", title: "Account Executive", phone: null, uiLocale: "FR" }, "jperez@garage-os.ca");
  assert.equal(facts.fromEmail, "jperez@garage-os.ca");
  assert.equal(facts.defaultLanguage, "FR");
  const sig = buildSignature({ name: facts.fromName, title: facts.jobTitle, email: facts.fromEmail, phone: facts.phone, websiteUrl: "https://www.garage-os.ca", bookingUrl: null, logoUrl: "https://www.garage-os.ca/brand/logo-monochrome-dark.png", language: "FR" });
  assert.equal(leaksRecoveryEmail(sig.html + sig.text, "jose.perez@hotmail.com"), false);
  assert.ok(sig.text.includes("jperez@garage-os.ca"));
  assert.equal(leaksRecoveryEmail("write to jose.perez@hotmail.com", "Jose.Perez@hotmail.com"), true);
});

// ── Capabilities by mode ──────────────────────────────────────────────────────
test("FIELD adds field privileges; REMOTE never receives them; Super Admin has everything", () => {
  for (const kind of ["SALES_REP", "SALES_MANAGER"] as const) {
    assert.ok(capabilitiesFor(kind, "FIELD").has("plan_field_routes") && capabilitiesFor(kind, "FIELD").has("log_field_visits"));
    assert.ok(!capabilitiesFor(kind, "REMOTE").has("plan_field_routes") && !capabilitiesFor(kind, "REMOTE").has("log_field_visits"));
    assert.ok(!capabilitiesFor(kind).has("plan_field_routes"), "default mode is least-privilege");
  }
  assert.ok(capabilitiesFor("SALES_MANAGER", "REMOTE").has("reassign_prospects"), "administrative role is independent of mode");
  assert.ok(capabilitiesFor("SUPER_ADMIN").has("plan_field_routes"));
});

// ── Territories ───────────────────────────────────────────────────────────────
const montreal: TerritoryRule = { key: "greater-montreal", acquisition: "FIELD_EXCLUSIVE", provinces: ["QC"], priorityDays: null, priorityStartedAt: null, active: true, sortOrder: 10,
  cities: ["montreal", "laval", "longueuil", "brossard", "saint-hubert", "boucherville", "saint-lambert"], postalPrefixes: ["H", "J4"] };
const canada: TerritoryRule = { key: "canada", acquisition: "REMOTE_DEFAULT", provinces: [], cities: [], postalPrefixes: [], priorityDays: null, priorityStartedAt: null, active: true, sortOrder: 1000 };
const rules = [canada, montreal];

test("territory resolution: Greater Montréal by city (accents, St-/Saint-) or postal prefix; everything else is Canada/remote", () => {
  assert.equal(cityKey("Montréal"), "montreal");
  assert.equal(cityKey("St-Hubert"), "saint-hubert");
  assert.equal(cityKey("  Saint Lambert "), "saint-lambert");
  assert.equal(provinceCode("Québec"), "QC");
  assert.equal(provinceCode("Ontario"), "ON");
  const at = (loc: object) => resolveTerritory(rules, loc)?.key;
  assert.equal(at({ city: "Montréal", province: "Québec" }), "greater-montreal");
  assert.equal(at({ city: "Laval", province: "QC" }), "greater-montreal");
  assert.equal(at({ city: "St-Hubert", province: "QC" }), "greater-montreal");
  assert.equal(at({ city: "Brossard" }), "greater-montreal");
  assert.equal(at({ postalCode: "h2x 1y4", province: "QC" }), "greater-montreal");
  assert.equal(at({ postalCode: "J4K 2T3" }), "greater-montreal");
  assert.equal(at({ city: "Quebec City", province: "QC", postalCode: "G1R 4P5" }), "canada");
  assert.equal(at({ city: "Toronto", province: "ON", postalCode: "M5V 2T6" }), "canada");
  assert.equal(at({ city: "Montreal", province: "ON" }), "canada", "same city name in another province is not Greater Montréal");
  assert.equal(at({ postalCode: "H0H 0H0", province: "ON" }), "canada", "a postal prefix is not trusted against a contradicting province");
  assert.equal(at({}), "canada");
  assert.equal(resolveTerritory([{ ...canada, active: false }], {}), null);
});

test("initial acquisition: Greater Montréal is FIELD-exclusive, the rest of Canada is REMOTE by default", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const field = { mode: "FIELD" as const, coverageKeys: [], isSuperAdmin: false };
  const remote = { mode: "REMOTE" as const, coverageKeys: [], isSuperAdmin: false };
  assert.equal(requiredMode(montreal, NO_ENGAGEMENT, now), "FIELD");
  assert.equal(requiredMode(canada, NO_ENGAGEMENT, now), "REMOTE");
  assert.equal(evaluateAcquisition(field, montreal, NO_ENGAGEMENT, now).allowed, true);
  assert.deepEqual(evaluateAcquisition(remote, montreal, NO_ENGAGEMENT, now), { allowed: false, code: "FIELD_MODE_REQUIRED" });
  assert.equal(evaluateAcquisition(remote, canada, NO_ENGAGEMENT, now).allowed, true);
  assert.equal(evaluateAcquisition(field, canada, NO_ENGAGEMENT, now).allowed, true, "FIELD includes remote work");
  assert.equal(evaluateAcquisition({ mode: null, coverageKeys: [], isSuperAdmin: false }, canada, NO_ENGAGEMENT, now).allowed, false);
  assert.equal(evaluateAcquisition({ mode: null, coverageKeys: [], isSuperAdmin: true }, montreal, NO_ENGAGEMENT, now).allowed, true);
  assert.equal(evaluateAcquisition(remote, montreal, { ...NO_ENGAGEMENT, touched: true, activeOpportunity: true }, now, true).allowed, true, "existing active opportunities retain ownership");
  assert.deepEqual(evaluateAcquisition({ ...field, coverageKeys: ["canada"] }, montreal, NO_ENGAGEMENT, now), { allowed: false, code: "OUTSIDE_COVERAGE" });
});

test("future FIELD territory: priority window, then untouched prospects are released to REMOTE", () => {
  const ottawa: TerritoryRule = { key: "ottawa", acquisition: "FIELD_PRIORITY", provinces: ["ON"], cities: ["ottawa"], postalPrefixes: [], priorityDays: 90, priorityStartedAt: new Date("2026-11-01T00:00:00Z"), active: true, sortOrder: 20 };
  const inside = new Date("2026-12-15T00:00:00Z"), after = new Date("2027-02-15T00:00:00Z");
  assert.equal(requiredMode(ottawa, NO_ENGAGEMENT, inside), "FIELD");
  assert.equal(requiredMode(ottawa, NO_ENGAGEMENT, after), "REMOTE", "untouched → released");
  assert.equal(requiredMode(ottawa, { ...NO_ENGAGEMENT, touched: true }, after), "FIELD", "touched by the field team → stays");
  assert.equal(requiredMode({ ...ottawa, priorityStartedAt: null }, NO_ENGAGEMENT, after), "FIELD", "an unconfigured window never silently releases");
});

test("cold email: never automated first contact in a field-held territory; follow-up is allowed after a documented visit or reply", () => {
  const base = { required: "FIELD" as const, eng: NO_ENGAGEMENT, automated: true, senderMode: "FIELD" as const };
  assert.deepEqual(evaluateColdEmail(base), { allowed: false, code: "TERRITORY_FIELD_FIRST_CONTACT" });
  assert.equal(evaluateColdEmail({ ...base, eng: { ...NO_ENGAGEMENT, visited: true, touched: true } }).allowed, true, "post-visit follow-up");
  assert.equal(evaluateColdEmail({ ...base, eng: { ...NO_ENGAGEMENT, replied: true } }).allowed, true);
  assert.deepEqual(evaluateColdEmail({ ...base, automated: false, senderMode: "REMOTE" }), { allowed: false, code: "TERRITORY_FIELD_ONLY" });
  assert.equal(evaluateColdEmail({ ...base, automated: false }).allowed, true, "a FIELD agent may write one-off");
  assert.equal(evaluateColdEmail({ ...base, required: "REMOTE" }).allowed, true, "remote territories are unaffected");
  assert.equal(evaluateColdEmail({ ...base, eng: { ...NO_ENGAGEMENT, touched: true } }).allowed, false, "a call alone is not a documented visit");
});

// ── Videos ────────────────────────────────────────────────────────────────────
test("video URLs: only real https links; placeholders and unsafe hosts are rejected", () => {
  assert.equal(safeHttpsUrl("https://www.youtube.com/watch?v=abc123"), "https://www.youtube.com/watch?v=abc123");
  for (const bad of ["", "http://x.com/v", "https://example.com/v", "https://localhost/v", "https://10.0.0.1/v", "https://user:pw@x.com/v", "https://x.com/{{video}}", "https://x.com/TODO", "javascript:alert(1)", "https://intranet/v", "https://x.com/<b>"]) {
    assert.equal(safeHttpsUrl(bad), null, bad);
  }
  assert.equal(canPublish({ title: "Overview", url: "https://vimeo.com/123456" }), true);
  assert.equal(canPublish({ title: "", url: "https://vimeo.com/123456" }), false);
});

test("a video is only used when PUBLISHED, in the right language and placement; no cross-language fallback", () => {
  const row = (o: Partial<VideoRow>): VideoRow => ({ key: "product-overview", language: "EN", title: "GarageOS overview", url: "https://vimeo.com/1234567", thumbnailUrl: "https://cdn.garage-os.ca/t.jpg", status: "PUBLISHED", allowWebsite: true, allowOutreach: true, ...o });
  assert.ok(pickVideo([row({})], "product-overview", "EN", "outreach"));
  assert.equal(pickVideo([row({ status: "DRAFT" })], "product-overview", "EN", "outreach"), null, "unpublished");
  assert.equal(pickVideo([row({})], "product-overview", "FR", "outreach"), null, "never a different language");
  assert.equal(pickVideo([row({ allowOutreach: false })], "product-overview", "EN", "outreach"), null);
  assert.ok(pickVideo([row({ allowOutreach: false })], "product-overview", "EN", "website"));
  assert.equal(pickVideo([row({ url: "https://example.com/v" })], "product-overview", "EN", "outreach"), null, "broken URL even if marked published");
  assert.equal(pickVideo([row({ thumbnailUrl: "http://insecure/t.jpg" })], "product-overview", "EN", "outreach")?.thumbnailUrl, null, "insecure thumbnail dropped, video kept");
  assert.match(videoCtaText("FR", "Aperçu", "https://vimeo.com/1"), /Aperçu.*https:\/\/vimeo\.com\/1/);
});

// ── Templates ─────────────────────────────────────────────────────────────────
test("outreach templates: every key exists in EN and FR; only known variables; the sender is identified; video templates need a real video", () => {
  for (const key of COMMERCIAL_TEMPLATE_KEYS) for (const lang of ["EN", "FR"] as const) {
    const t = BUILTIN_TEMPLATES.find((x) => x.key === key && x.language === lang);
    assert.ok(t, `${key}/${lang}`);
    assert.deepEqual(unknownVariables(t.subject + t.body), [], `${key}/${lang}`);
    if (key === "INTRODUCTION" || key === "VIDEO_INTRODUCTION") assert.match(t.body, /\{\{\s*seller\.name\s*\}\}/, `${key}/${lang} identifies the sender in the first contact`);
    assert.doesNotMatch(t.body + t.subject, /guarantee|garantie|limited time|temps limité|act now|urgent|testimonial|témoignage|#1|best in/i, `${key}/${lang} no hype`);
  }
  assert.equal(TEMPLATE_KEYS.length, new Set(TEMPLATE_KEYS).size);
  const vid = BUILTIN_TEMPLATES.find((x) => x.key === "VIDEO_INTRODUCTION" && x.language === "EN")!;
  const noVideo = renderTemplate(vid.subject, vid.body, { greeting: "Hi A,", "prospect.name": "Garage X", "seller.name": "S", "booking.link": "https://x.test/b" });
  assert.deepEqual(noVideo.missing, ["video.link"], "unpublished video blocks the send instead of shipping a hole");
  const withVideo = renderTemplate(vid.subject, vid.body, { greeting: "Hi A,", "prospect.name": "Garage X", "seller.name": "S", "booking.link": "https://x.test/b", "video.link": "https://vimeo.com/1234567" });
  assert.deepEqual(withVideo.missing, []);
  assert.match(withVideo.body, /vimeo\.com\/1234567/);
  assert.doesNotMatch(withVideo.body, /\{\{/);
});

test("the optional video CTA disappears silently when nothing is published (no placeholder, no blank gap)", () => {
  const f1 = BUILTIN_TEMPLATES.find((x) => x.key === "FOLLOW_UP_1" && x.language === "FR")!;
  const vars = { greeting: "Bonjour A,", "prospect.name": "Garage X", "seller.name": "S", "booking.link": "https://x.test/b" };
  const none = renderTemplate(f1.subject, f1.body, vars);
  assert.deepEqual(none.missing, []);
  assert.doesNotMatch(none.body, /\{\{|\n{3,}/);
  const some = renderTemplate(f1.subject, f1.body, { ...vars, "video.cta": videoCtaText("FR", "Aperçu", "https://vimeo.com/1234567") });
  assert.match(some.body, /vimeo\.com\/1234567/);
});

test("post-visit follow-up template exists in EN and FR and needs the booking link", () => {
  for (const lang of ["EN", "FR"] as const) {
    const t = BUILTIN_TEMPLATES.find((x) => x.key === "FIELD_VISIT_FOLLOW_UP" && x.language === lang);
    assert.ok(t); assert.deepEqual(t.required, ["booking.link"]);
  }
});
