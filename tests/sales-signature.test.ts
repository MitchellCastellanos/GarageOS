import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SIGNATURE_COLORS, SIGNATURE_LOGO_PATH, buildSignature, formatTitle, stripTrailingSignature } from "../src/domain/sales-comms/signature";
import { SignaturePreview } from "../src/components/sales-comms/SignaturePreview";
import { commsEn, commsFr } from "../src/lib/admin-locale/sales-comms";

const base = { name: "Alexandre Tremblay", title: "Sales Representative", email: "alexandre@sales.garage-os.ca", phone: "514-555-0100", websiteUrl: "https://www.garage-os.ca", bookingUrl: "https://app.garage-os.ca/sales/book/abc", logoUrl: "https://app.garage-os.ca/brand/logo-monochrome-dark.png", language: "EN" as const };

test("complete profile: branded table signature (logo, colors, name, title | GarageOS, linked email, phone, website, booking) + plain text", () => {
  const s = buildSignature(base);
  assert.equal(s.ok, true);
  for (const c of [SIGNATURE_COLORS.navy, SIGNATURE_COLORS.blue, SIGNATURE_COLORS.offWhite]) assert.ok(s.html.includes(c), c);
  assert.ok(s.html.includes("Alexandre Tremblay") && s.html.includes("Sales Representative | <span") && s.html.includes(">GarageOS</span>"));
  assert.ok(s.html.includes('href="mailto:alexandre@sales.garage-os.ca"') && s.html.includes('href="tel:5145550100"') && s.html.includes(">garage-os.ca<") === false);
  assert.ok(s.html.includes('href="https://www.garage-os.ca/"') && s.html.includes(">www.garage-os.ca<"));
  assert.ok(s.html.includes("Book a demo") && s.html.includes("https://app.garage-os.ca/sales/book/abc"));
  assert.equal(s.text, ["Alexandre Tremblay", "Sales Representative | GarageOS", "alexandre@sales.garage-os.ca", "514-555-0100", "www.garage-os.ca", "Book a demo: https://app.garage-os.ca/sales/book/abc"].join("\n"));
});

test("email-client compatibility: tables + inline CSS only, absolute HTTPS logo with alt text and fixed size, readable without images", () => {
  const s = buildSignature(base);
  assert.ok(s.html.startsWith("<table") && s.html.includes('role="presentation"'));
  for (const bad of ["<script", "<style", "<link", "<svg", " class=", "javascript:", "onerror", "position:", "flex", "grid"]) assert.equal(s.html.toLowerCase().includes(bad), false, bad);
  const img = /<img [^>]*>/.exec(s.html)![0];
  assert.match(img, /src="https:\/\/app\.garage-os\.ca\/brand\/logo-monochrome-dark\.png"/);
  assert.match(img, /alt="GarageOS"/); assert.match(img, /width="120"/); assert.match(img, /height="40"/);
  // With the image blocked, the name/title/contact lines are still real text in the markup.
  const withoutImg = s.html.replace(/<img [^>]*>/g, "");
  for (const t of ["Alexandre Tremblay", "alexandre@sales.garage-os.ca", "514-555-0100"]) assert.ok(withoutImg.includes(t));
});

test("the logo is the OFFICIAL repository asset, not a recreation", () => {
  assert.equal(SIGNATURE_LOGO_PATH, "/brand/logo-monochrome-dark.png");
  assert.ok(existsSync(`public${SIGNATURE_LOGO_PATH}`));
  const png = readFileSync(`public${SIGNATURE_LOGO_PATH}`);
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(png.readUInt32BE(16), 480); assert.equal(png.readUInt32BE(20), 160);
});

test("missing optional fields degrade gracefully; missing required fields are reported", () => {
  const min = buildSignature({ ...base, title: "", phone: "", bookingUrl: null });
  assert.equal(min.ok, true);
  assert.ok(min.text.includes("Sales Representative | GarageOS"), "default title");
  assert.equal(min.html.includes("tel:"), false); assert.equal(min.html.includes("Book a demo"), false);
  assert.equal(min.lines.length, 4);
  const bad = buildSignature({ ...base, name: "  ", email: "not-an-email" });
  assert.deepEqual([bad.ok, bad.missing], [false, ["name", "email"]]);
  assert.deepEqual(buildSignature({ ...base, email: null }).missing, ["email"]);
});

test("French signature labels and title default; title suffix normalised to exactly one '| GarageOS'", () => {
  const fr = buildSignature({ ...base, language: "FR", title: "", phone: "" });
  assert.ok(fr.text.includes("Représentant aux ventes | GarageOS") && fr.html.includes("Réserver une démo"));
  for (const t of ["Sales Representative — GarageOS", "Sales Representative | GarageOS", "Sales Representative - GarageOS", "Sales Representative"]) assert.equal(formatTitle(t, "EN"), "Sales Representative | GarageOS", t);
});

test("HTML injection: every employee value is escaped; only http(s) links; phone/email links rebuilt from validated parts", () => {
  const evil = buildSignature({
    ...base, name: '<img src=x onerror=alert(1)>"Eve"', title: "<script>alert(1)</script>", phone: '"><a href="javascript:alert(1)">x</a>',
    websiteUrl: "javascript:alert(1)", bookingUrl: 'https://x.test/"><script>alert(1)</script>', email: "a@b.ca",
  });
  const tags = new Set([...evil.html.matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => m[1].toLowerCase()));
  assert.deepEqual([...tags].sort(), ["a", "img", "span", "table", "td", "tr"], "only our own markup — no injected tags");
  assert.equal(/href="javascript|<img[^>]*onerror/i.test(evil.html), false, evil.html);
  assert.equal((evil.html.match(/<img /g) ?? []).length, 1, "exactly one image: the logo");
  assert.ok(evil.html.includes("&lt;script&gt;") && evil.html.includes("&lt;img src=x"));
  assert.equal(/href="[^"]*javascript:/i.test(evil.html), false, "javascript: website dropped");
  assert.equal(evil.html.includes("tel:"), false, "non-numeric phone gets no tel: link");
  const hdr = buildSignature({ ...base, name: "Al\r\nBcc: x@y.z" });
  assert.equal(/[\r\n]/.test(hdr.text.split("\n")[0]), false, "control characters flattened");
});

test("no duplicate signature: typed/old/template signatures at the end of a body are removed before the generated one is appended", () => {
  const who = { name: "Alexandre Tremblay", email: "alexandre@sales.garage-os.ca" };
  const gen = buildSignature(base).text;
  const body = "Bonjour,\n\nVoici mon message.";
  assert.equal(stripTrailingSignature(body, who), body, "plain body untouched");
  assert.equal(stripTrailingSignature(`${body}\n\n--\n${gen}`, { ...who, generatedText: gen }), body, "generated signature already present");
  assert.equal(stripTrailingSignature(`${body}\n\n-- \nAlexandre Tremblay\nalexandre@sales.garage-os.ca`, who), body, "-- delimited");
  assert.equal(stripTrailingSignature(`${body}\n\nAlexandre Tremblay\nSales Representative — GarageOS\nalexandre@sales.garage-os.ca`, who), body, "final paragraph naming the sender");
  assert.equal(stripTrailingSignature(`Contact alexandre@sales.garage-os.ca for details.\n\nMerci.`, who), "Contact alexandre@sales.garage-os.ca for details.\n\nMerci.", "mentions earlier in the text are kept");
  assert.equal(stripTrailingSignature(stripTrailingSignature(`${body}\n\n--\n${gen}`, who), who), body, "idempotent");
});

test("responsive live preview: scrollable, shrink-safe container, exact generated markup, incomplete-profile message, EN/FR titles", () => {
  const src = { name: "Alexandre Tremblay", title: "", email: "alexandre@sales.garage-os.ca", phone: "", websiteUrl: "https://www.garage-os.ca", bookingUrl: null, bookingEnabled: false, logoUrl: base.logoUrl, emailLanguage: "EN" as const };
  const en = renderToStaticMarkup(createElement(SignaturePreview, { locale: "en", src }));
  assert.ok(en.includes("Email Signature Preview") && en.includes("overflow-x-auto") && en.includes("max-w-full") && en.includes("sm:col-span-2"));
  assert.ok(en.includes(buildSignature({ ...base, title: "", phone: "", bookingUrl: null }).html), "preview = exactly the outgoing markup");
  assert.ok(en.includes("Sales Representative | GarageOS") && en.includes("brand/logo-monochrome-dark.png"));
  const fr = renderToStaticMarkup(createElement(SignaturePreview, { locale: "fr", src: { ...src, emailLanguage: "FR" } }));
  assert.ok(fr.includes("Aperçu de la signature courriel") && fr.includes("Représentant aux ventes | GarageOS"));
  const incomplete = renderToStaticMarkup(createElement(SignaturePreview, { locale: "fr", src: { ...src, name: "", email: "" } }));
  assert.ok(incomplete.includes("Nom affiché") && incomplete.includes("Adresse courriel de l&#x27;expéditeur") && !incomplete.includes("signature-preview"));
  assert.ok(renderToStaticMarkup(createElement(SignaturePreview, { locale: "en", src: { ...src, email: "" } })).includes("Sender email address"));
  assert.equal(commsEn.sig.previewTitle, "Email Signature Preview"); assert.equal(commsFr.sig.previewTitle, "Aperçu de la signature courriel");
});
