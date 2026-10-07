// Layout/interaction QA for /demo (no login, no DB). Usage: node scripts/demo-journey/qa-demo-page.mjs [--shots=<dir>]
import { launch, BASE } from "./lib.mjs";
import fs from "node:fs";
import path from "node:path";

const shotsArg = process.argv.find((a) => a.startsWith("--shots="));
const shotsDir = shotsArg ? shotsArg.slice(8) : null;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
const sizes = [{ w: 390, h: 844 }, { w: 768, h: 1024 }, { w: 1440, h: 1000 }];
const results = [];
const b = await launch();
for (const locale of ["fr", "en"]) {
  for (const { w, h } of sizes) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript((l) => localStorage.setItem("marketing-locale", l), locale);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // Fuerza la carga de imágenes diferidas recorriendo la página.
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length);
    const imgs = await page.locator("main img").count();
    const lang = await page.evaluate(() => document.documentElement.lang);
    const h1 = await page.locator("h1").innerText();
    // Navegación por ancla
    await page.locator('nav[aria-label] a[href="#invoice"]').first().click();
    await page.waitForTimeout(300);
    const invoiceTop = await page.evaluate(() => Math.round(document.getElementById("invoice").getBoundingClientRect().top));
    // Lightbox: abrir, Escape, foco de vuelta
    let lightbox = "n/a";
    const fig = page.locator("figure button").first();
    if (await fig.count()) {
      await fig.scrollIntoViewIfNeeded();
      await fig.focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(250);
      const open = await page.locator("dialog[open]").count();
      const toggled = await page.locator("dialog[open] button[aria-pressed]").first().click().then(() => true).catch(() => false);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      const closed = (await page.locator("dialog[open]").count()) === 0;
      const refocus = await page.evaluate(() => document.activeElement?.closest("figure") !== null);
      lightbox = `open=${open} fullsize-toggle=${toggled} escape-closes=${closed} focus-returned=${refocus}`;
    }
    // Enlace SMS de factura abre el visor
    const smsLink = page.locator("#invoice button", { hasText: "garageos.com" }).first();
    let smsOpen = "n/a";
    if (await smsLink.count()) { await smsLink.click(); await page.waitForTimeout(200); smsOpen = (await page.locator("dialog[open]").count()) === 1 ? "opens-viewer" : "FAILED"; await page.keyboard.press("Escape"); }
    results.push({ locale, w, overflow, broken, imgs, lang, h1, invoiceTop, lightbox, smsOpen, errors: errors.length });
    if (errors.length) console.log(locale, w, errors.slice(0, 3));
    if (shotsDir && (w === 390 || w === 1440)) await page.screenshot({ path: path.join(shotsDir, `demo-${locale}-${w}.png`), fullPage: true });
    await ctx.close();
  }
}
await b.close();
console.table(results);
