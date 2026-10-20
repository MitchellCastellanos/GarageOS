// English/French parity of the softphone and Voice settings copy, and full coverage of every server error code.
import assert from "node:assert/strict";
import test from "node:test";
import { callingCopy } from "../src/lib/admin-locale/sales-calling";
import { CALL_ERROR_CODES } from "../src/lib/voice/types";

const keys = (o: unknown, p = ""): string[] => (o && typeof o === "object" && !Array.isArray(o) ? Object.entries(o).flatMap(([k, v]) => keys(v, `${p}${k}.`)) : [p.slice(0, -1)]);
const strings = (o: unknown): string[] => (typeof o === "string" ? [o] : o && typeof o === "object" ? Object.values(o).flatMap(strings) : []);

test("EN and FR expose exactly the same keys", () => {
  assert.deepEqual(keys(callingCopy("fr")).sort(), keys(callingCopy("en")).sort());
});

test("every server error code has a message in both languages; no string is empty", () => {
  for (const loc of ["en", "fr"] as const) {
    const c = callingCopy(loc) as unknown as { errors: Record<string, string> };
    for (const code of CALL_ERROR_CODES) assert.ok(c.errors[code]?.trim(), `${loc}: ${code}`);
    for (const s of strings(callingCopy(loc))) assert.ok(s.trim().length > 0, `${loc}: empty string`);
  }
});

test("French is actually translated (not a copy of English) for the user-facing call controls", () => {
  const en = JSON.stringify(callingCopy("en")), fr = JSON.stringify(callingCopy("fr"));
  assert.notEqual(en, fr);
  const same = strings(callingCopy("en")).filter((s, i) => s === strings(callingCopy("fr"))[i] && s.length > 12);
  assert.ok(same.length < 8, `too many untranslated strings: ${same.slice(0, 5).join(" | ")}`);
});
