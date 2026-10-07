// Shared helpers for the Garage Laurent demo-journey capture tooling.
// playwright-core and sharp are NOT repo dependencies: point DEMO_TOOLS_DIR at a folder
// (outside the repo) where `npm i playwright-core sharp` was run.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const toolsDir = process.env.DEMO_TOOLS_DIR;
if (!toolsDir) throw new Error("Set DEMO_TOOLS_DIR to the folder holding playwright-core and sharp.");
const req = createRequire(path.join(toolsDir, "package.json"));
export const { chromium } = req("playwright-core");
export const sharp = req("sharp");

export const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
export const OWNER_EMAIL = "demo.garage.laurent@example.com";
export const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
export const capturesDir = (locale) => path.join(repoRoot, "docs/demo-journey/captures", locale);

export function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) {
    const p = path.join(root, d, "chrome-win64", "chrome.exe");
    if (fs.existsSync(p)) return p;
    const p2 = path.join(root, d, "chrome-win", "chrome.exe");
    if (fs.existsSync(p2)) return p2;
  }
  throw new Error("No Chromium found; set CHROMIUM_PATH.");
}

export async function launch() {
  return chromium.launch({ executablePath: findChromium(), headless: true });
}

export async function login(context) {
  const password = process.env.DEMO_OWNER_PASSWORD;
  if (!password) throw new Error("Set DEMO_OWNER_PASSWORD (never committed).");
  const page = await context.newPage();
  await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.fill('input[type="email"], input[name="email"]', OWNER_EMAIL);
  await page.fill('input[type="password"]', password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.endsWith("/admin/login"), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);
  return page;
}
