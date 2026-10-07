import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { bookingPublicPath } from "../src/config/app";
import { DEMO_BOOKING_URL, DEMO_LOGO_SRC, DEMO_SHOP_SLUG, DEMO_UI } from "../src/lib/demo-journey";
import { SHOP_SLUG } from "../scripts/marketing/garage-laurent-dataset";

test("demo QR points at the seeded Garage Laurent booking page on the public domain", () => {
  assert.equal(DEMO_SHOP_SLUG, SHOP_SLUG);
  assert.equal(DEMO_BOOKING_URL, `https://www.garage-os.ca${bookingPublicPath(SHOP_SLUG)}`);
});

test("demo QR logo is a local static PNG (keeps /demo free of Supabase/DB)", () => {
  assert.ok(DEMO_LOGO_SRC.startsWith("/demo/garage-laurent/"));
  const file = path.join(process.cwd(), "public", DEMO_LOGO_SRC);
  assert.ok(existsSync(file));
  assert.equal(readFileSync(file).subarray(1, 4).toString(), "PNG");
});

test("QR copy exists in FR and EN", () => {
  for (const l of ["en", "fr"] as const) {
    for (const k of ["qrTitle", "qrBody", "qrOpen", "qrAlt"] as const) assert.ok(DEMO_UI[l][k].length > 5, `${l}.${k}`);
  }
});
