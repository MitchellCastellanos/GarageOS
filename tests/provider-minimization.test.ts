import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildPlatformTelegramAlertText } from "../src/lib/platform/telegram-alert";

test("Telegram alert carries shop name + link only, never the support message body", () => {
  const body = "Cliente Jean Tremblay 514-555-0100 NIV 1HGCM82633A004352";
  const text = buildPlatformTelegramAlertText("Garage <b>X</b> & Fils", "conv_1", "https://garage-os.ca/");
  assert.ok(!text.includes("Tremblay") && !text.includes("514") && !text.includes(body));
  assert.match(text, /Garage &lt;b&gt;X&lt;\/b&gt; &amp; Fils/, "shop name is HTML-escaped (parse_mode HTML)");
  assert.match(text, /https:\/\/garage-os\.ca\/platform\/messages\/conv_1$/);
});

test("support action passes no message content to Telegram; verification logs carry no email address", () => {
  const support = readFileSync("src/actions/support.ts", "utf8");
  assert.match(support, /sendPlatformTelegramAlert\(buildPlatformTelegramAlertText\(/);
  assert.doesNotMatch(support, /sendPlatformTelegramAlert\(`/);
  const ev = readFileSync("src/lib/email-verification.ts", "utf8");
  assert.doesNotMatch(ev, /console\.(warn|error)\([^)]*\$\{email\}/);
});
