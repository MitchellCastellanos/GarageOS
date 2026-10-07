// Screenshots the HTML documents produced by render-documents.ts (06,14,16,19,20) and rasterises the first
// page of the invoice PDF (15). Usage: DEMO_TOOLS_DIR=… node shoot-documents.mjs <renderDir>   (needs pdftoppm for 15)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { launch, capturesDir } from "./lib.mjs";

const renderDir = process.argv[2];
if (!renderDir) throw new Error("Usage: shoot-documents.mjs <renderDir>");
const browser = await launch();
for (const locale of ["fr", "en"]) {
  const out = capturesDir(locale);
  fs.mkdirSync(out, { recursive: true });
  const dir = path.join(renderDir, locale);
  const ctx = await browser.newContext({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2, locale: locale === "fr" ? "fr-CA" : "en-CA" });
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".html"))) {
    const page = await ctx.newPage();
    await page.goto(`file://${path.join(dir, f)}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    // The email as a mail client shows it: the full body on its own canvas (preheader is hidden by the template).
    await page.screenshot({ path: path.join(out, f.replace(/\.html$/, ".png")), fullPage: true });
    await page.close();
  }
  await ctx.close();
  const pdf = path.join(dir, "invoice-camille.pdf");
  fs.copyFileSync(pdf, path.join(out, "invoice-camille.pdf"));
  execFileSync("pdftoppm", ["-png", "-r", "150", "-f", "1", "-l", "1", "-singlefile", pdf, path.join(out, "15-invoice-pdf-page")]);
}
await browser.close();
console.log("documents shot");
