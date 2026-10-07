// Captures the real Garage Laurent screens for /demo into docs/demo-journey/captures/{fr,en}/.
// STATUS: written while the local Postgres was blocked (Windows error 487); NOT yet run against the app.
// Expect to adjust selectors/waits on first run. Usage:
//   DEMO_TOOLS_DIR=<dir with playwright-core+sharp> DEMO_OWNER_PASSWORD=<local> \
//   DEMO_ACCESS_FILE=<private access-links.json, outside repo> node scripts/demo-journey/capture.mjs [--only=03,04] [--locale=fr]
// Email/PDF captures (06,14,16,19,20,15) come from render-documents (see README) and are not produced here.
import fs from "node:fs";
import path from "node:path";
import { launch, login, BASE, capturesDir, repoRoot } from "./lib.mjs";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const only = arg("only")?.split(",");
const locales = arg("locale") ? [arg("locale")] : ["fr", "en"];
const access = process.env.DEMO_ACCESS_FILE ? JSON.parse(fs.readFileSync(process.env.DEMO_ACCESS_FILE, "utf8")) : {};

const D = { width: 1440, height: 1000 };
const M = { width: 390, height: 844 };
const ID = (k) => `mkt-gl-v1-${k}`;

// route templates only; tokens come from the private access file and never reach the manifest.
const CAPTURES = [
  { file: "01-dashboard-desktop", vp: D, auth: true, route: "/admin/dashboard" },
  { file: "02-agenda-desktop", vp: D, auth: true, route: "/admin/appointments" },
  { file: "03-booking-desktop", vp: D, route: "/book/garage-laurent-demo" },
  { file: "04-booking-mobile", vp: M, route: "/book/garage-laurent-demo" },
  { file: "05-booking-form-mobile", vp: M, route: "/book/garage-laurent-demo", note: "scroll to the booking form; adjust selector on first run" },
  { file: "07-client-vehicle-history-desktop", vp: D, auth: true, route: `/admin/clients/${ID("client-camille")}` },
  { file: "08-inspection-admin-desktop", vp: D, auth: true, route: `/admin/inspections/${ID("insp-camille")}` },
  { file: "09-inspection-report-mobile", vp: M, route: "/inspection/<token:camilleInspectionReport>", token: "camilleInspectionReport" },
  { file: "10-estimate-editor-desktop", vp: D, auth: true, route: `/admin/quotes/${ID("quote-camille")}` },
  { file: "11-estimate-customer-mobile", vp: M, route: "/quote/<token:alexandreQuoteApproval>", token: "alexandreQuoteApproval", note: "Alexandre's pending quote (218.45 CAD) unless a Camille staged snapshot exists; badge it in the manifest" },
  { file: "12-approval-history-desktop", vp: D, auth: true, route: `/admin/quotes/${ID("quote-camille")}`, note: "scroll to approval history" },
  { file: "13-work-order-desktop", vp: D, auth: true, route: `/admin/work-orders/${ID("wo-camille")}` },
  { file: "17-payment-record-desktop", vp: D, auth: true, route: `/admin/invoices/${ID("inv-camille")}` },
  { file: "18-customer-portal-mobile", vp: M, route: "/portal/<token:camillePortal>", token: "camillePortal" },
  { file: "21-campaign-editor-desktop", vp: D, auth: true, route: `/admin/campaigns/${ID("campaign-winter")}` },
  { file: "22-sms-inbox-desktop", vp: D, auth: true, route: "/admin/inbox", optional: true },
  { file: "23-inventory-desktop", vp: D, auth: true, route: "/admin/inventory" },
  { file: "24-reports-desktop", vp: D, auth: true, route: "/admin/reports" },
  { file: "25-tire-storage-desktop", vp: D, auth: true, route: "/admin/tire-storage" },
];

const provenance = [];
const browser = await launch();
for (const locale of locales) {
  const outDir = capturesDir(locale);
  fs.mkdirSync(outDir, { recursive: true });
  const adminCtx = await browser.newContext({ viewport: D, deviceScaleFactor: 2, locale: locale === "fr" ? "fr-CA" : "en-CA" });
  await adminCtx.addInitScript((l) => { localStorage.setItem("marketing-locale", l); }, locale);
  await login(adminCtx);
  for (const c of CAPTURES) {
    if (only && !only.some((o) => c.file.startsWith(o))) continue;
    let route = c.route;
    if (c.token) {
      const link = access[c.token];
      if (!link) { console.warn(`skip ${c.file}: no ${c.token} in access file`); continue; }
      route = new URL(link).pathname;
    }
    const ctx = c.auth ? adminCtx : await browser.newContext({ viewport: c.vp, deviceScaleFactor: 2, locale: locale === "fr" ? "fr-CA" : "en-CA" });
    const page = await ctx.newPage();
    await page.setViewportSize(c.vp);
    // Interface language: the app stores the locale in a cookie/setting; the public pages take ?lang= where supported.
    const url = `${BASE}${route}${c.auth ? "" : (route.includes("?") ? "&" : "?") + `lang=${locale}`}`;
    const res = await page.goto(url, { waitUntil: "networkidle" }).catch((e) => ({ status: () => 0, error: e }));
    const status = res?.status?.() ?? 0;
    if (status >= 400 || status === 0) { console.warn(`FAILED ${c.file} (${status}) ${c.route}`); if (c.optional) continue; }
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: "*{caret-color:transparent!important} nextjs-portal,[data-nextjs-toast]{display:none!important}" });
    await page.waitForTimeout(600);
    const file = path.join(outDir, `${c.file}.png`);
    await page.screenshot({ path: file, fullPage: false });
    provenance.push({ file: `${c.file}.png`, locale, routeTemplate: c.route.replace(/\/[A-Za-z0-9_-]{20,}$/, "/<token>"), viewport: `${c.vp.width}x${c.vp.height}@2x`, httpStatus: status, capturedAt: new Date().toISOString(), note: c.note ?? null });
    await page.close();
    if (!c.auth) await ctx.close();
  }
  await adminCtx.close();
}
await browser.close();
const prov = path.join(repoRoot, "docs/demo-journey/capture-log.json");
fs.mkdirSync(path.dirname(prov), { recursive: true });
fs.writeFileSync(prov, JSON.stringify(provenance, null, 2) + "\n");
console.log(`captured ${provenance.length}; log -> docs/demo-journey/capture-log.json`);
