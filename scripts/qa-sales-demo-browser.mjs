// Run while qa-sales-demo.mjs is serving the disposable local app.
// GARAGEOS_QA_PLAYWRIGHT points to a directory containing playwright/package.json.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const requirePlaywright = createRequire(path.join(process.env.GARAGEOS_QA_PLAYWRIGHT, "package.json"));
const { chromium } = requirePlaywright("playwright");
const requireRepo = createRequire(path.join(process.cwd(), "package.json"));
const sharp = requireRepo("sharp");
const output = process.env.GARAGEOS_QA_OUTPUT;
if (!output) throw new Error("Set GARAGEOS_QA_OUTPUT for screenshots and results.");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 375, height: 900 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3100" });
const page = await context.newPage();
page.setDefaultTimeout(60_000);
const results = [];
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const widths = [375, 430, 768, 1024, 1440];
async function responsive(name) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    if (name.startsWith("wave2-booking-")) {
      // Exercise the real renderer's scroll reveals before retaining a full-page image.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += innerHeight * 0.75) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(700);
    }
    const measures = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
      toolbar: document.querySelector('aside[aria-label="DÉMO DE VENTE"]')?.getBoundingClientRect().bottom,
      topbar: document.querySelector('header')?.getBoundingClientRect().top,
    }));
    assert.ok(measures.document <= measures.viewport, `${name} ${width}: horizontal overflow ${JSON.stringify(measures)}`);
    if (name === "dashboard" && measures.toolbar !== undefined) assert.ok(measures.topbar >= measures.toolbar - 1, "Toolbar overlaps app navigation");
    await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true });
    results.push({ name, width, ...measures });
  }
  await page.setViewportSize({ width: 375, height: 900 });
}
try {
  await page.goto("http://localhost:3100/admin/login?callbackUrl=/platform/sales");
  await page.locator('input[name="email"]').fill("sales@example.test");
  await page.locator('input[name="password"]').fill("qa-password-local-only");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/platform");
  await page.goto("http://localhost:3100/platform/sales");
  await page.getByRole("heading", { name: "Démonstrations de vente" }).waitFor();
  await responsive("workspace-empty");
  await page.getByRole("link", { name: "Nouvelle démonstration" }).click();
  await responsive("prospect-form");
  const shopName = "Garage Démonstration Dupont et Fils — Réparation et entretien automobile";
  await page.getByLabel("Nom du garage").fill(shopName);
  await page.getByLabel("Adresse", { exact: true }).fill("123 rue de la Démonstration, Montréal");
  await page.getByLabel("Téléphone du garage").fill("5145550100");
  await page.getByLabel("Courriel du garage").fill("garage@example.test");
  await page.getByLabel("Nom du contact").fill("Jean Dupont");
  await page.getByLabel("Courriel du contact").fill("jean@example.test");
  await page.getByRole("button", { name: "Créer et préparer" }).click();
  await page.waitForURL((url) => /^\/platform\/sales\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"));
  const preparationUrl = page.url();
  await responsive("branding-empty");
  const logo = await sharp({ create: { width: 900, height: 450, channels: 4, background: { r: 35, g: 95, b: 160, alpha: 0.7 } } }).png().toBuffer();
  const sections = page.locator("section[aria-labelledby]");
  const logoSection = sections.nth(0);
  await logoSection.locator('input[type="file"]').nth(1).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: logo });
  await logoSection.getByRole("slider", { name: "Gauche (%)" }).fill("10");
  await logoSection.getByRole("combobox", { name: "Rotation" }).selectOption("90");
  await logoSection.getByRole("button", { name: "Aperçu de la préparation" }).click();
  await logoSection.getByAltText("Utiliser l’image préparée").waitFor();
  await responsive("logo-editor");
  await logoSection.getByText("Préparer avec ChatGPT", { exact: true }).click();
  await logoSection.getByRole("button", { name: "Copier la consigne ChatGPT" }).click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Preserve the logo's original design exactly/);
  await logoSection.getByRole("button", { name: "Utiliser l’image préparée" }).click();
  await logoSection.getByRole("status").filter({ hasText: "Enregistré" }).waitFor();
  // Replace and use original; both fallback and crop preparation work independently.
  await logoSection.locator('input[type="file"]').nth(1).setInputFiles({ name: "original.png", mimeType: "image/png", buffer: logo });
  await logoSection.getByRole("button", { name: "Utiliser l’original" }).click();
  await logoSection.getByRole("status").filter({ hasText: "Enregistré" }).waitFor();
  for (const index of [1, 2]) {
    const section = sections.nth(index);
    assert.equal(await section.locator('input[type="file"]').nth(0).getAttribute("capture"), "environment");
    assert.equal(await section.locator('input[type="file"]').nth(1).getAttribute("capture"), null);
    await section.locator('input[type="file"]').nth(0).setInputFiles({ name: "camera.png", mimeType: "image/png", buffer: logo });
    await section.getByRole("button", { name: "Utiliser l’original" }).click();
    await section.getByRole("status").filter({ hasText: "Enregistré" }).waitFor();
  }
  await responsive("branding-saved");
  await page.getByRole("button", { name: "Démarrer l’expérience client" }).click();
  await page.waitForURL("**/admin/onboarding");
  await page.getByRole("combobox", { name: "Forfait de démonstration" }).waitFor();
  assert.equal(await page.locator('input[name="name"]').inputValue(), shopName);
  assert.equal(await page.locator('input[name="email"]').inputValue(), "garage@example.test");
  if (process.env.GARAGEOS_QA_WAVE2 === "1") await page.locator('input[type="text"]:not([name])').fill("garage-demo-wave2");
  await responsive("onboarding-business");
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await page.waitForURL("**step=2");
  await responsive("onboarding-fiscal");
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await page.waitForURL("**step=3");
  await page.getByRole("button", { name: "Enregistrer les services", exact: true }).click();
  await page.waitForURL("**step=4");
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await page.waitForURL("**step=5");
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await page.waitForURL("**step=6");
  await page.getByRole("radio", { name: "Pro", exact: true }).check();
  await responsive("demo-plan");
  await page.getByRole("button", { name: "Continuer sans paiement" }).click();
  await page.waitForURL("**step=7");
  await page.getByRole("button", { name: "Aller au tableau de bord" }).click();
  await page.waitForURL("**/admin/dashboard");
  await page.getByRole("combobox", { name: "Forfait de démonstration" }).waitFor();
  await responsive("dashboard");
  for (const tier of ["CORE", "PRO", "COMPLETE"]) {
    await page.getByRole("combobox", { name: "Forfait de démonstration" }).selectOption(tier);
    await page.waitForFunction((p) => document.querySelector('select[aria-label="Forfait de démonstration"]')?.value === p && !document.querySelector('select[aria-label="Forfait de démonstration"]')?.disabled, tier);
    const state = await (await fetch("http://127.0.0.1:55442")).json();
    assert.equal(state.demos[0].currentPlan, tier);
    await page.goto("http://localhost:3100/admin/inventory");
    const text = await page.locator("main").innerText();
    results.push({ name: "tier-gate", tier, inventory: text.slice(0, 500) });
    if (tier === "CORE") assert.match(text, /Pro|forfait/i);
    else assert.match(text, /inventaire/i);
  }
  await page.goto("http://localhost:3100/admin/settings?tab=billing");
  await page.getByText("Cette démo n’a pas d’abonnement commercial.", { exact: false }).waitFor();
  const state = await (await fetch("http://127.0.0.1:55442")).json();
  assert.equal(state.demos[0].subscriptionStatus, "AWAITING_PLAN"); assert.equal(state.demos[0].plan, null);
  assert.equal(state.demos[0].stripeCustomerId, null); assert.equal(state.demos[0].stripeSubscriptionId, null);
  assert.ok(state.demos[0].onboardingCompletedAt); assert.ok(state.demos[0].communicationsSuspendedAt);
  assert.ok(state.demos[0].logoUrl && state.demos[0].bookingCoverImageUrl && state.demos[0].bookingShopImageUrl);
  if (process.env.GARAGEOS_QA_WAVE2 === "1") {
    const { verifyWave2Browser } = await import("./qa-sales-demo-wave2-browser.mjs");
    await verifyWave2Browser({ page, responsive, results });
  }
  await page.getByRole("button", { name: "Quitter la démo" }).click();
  await page.waitForURL("**/platform/sales");
  await responsive("workspace-active");
  await page.goto(preparationUrl);
  await page.getByRole("button", { name: "Démarrer l’expérience client" }).click();
  await page.waitForURL("**/admin/dashboard");
  await fetch("http://127.0.0.1:55442/expire", { method: "POST" });
  await page.reload();
  await page.waitForURL("**/platform");
  results.push({ name: "open-tab-expiration", returnsToPlatform: true });
  await fetch("http://127.0.0.1:55442/english", { method: "POST" });
  await page.goto("http://localhost:3100/platform/sales/new");
  await page.getByRole("heading", { name: "New prospect demo" }).waitFor();
  await responsive("prospect-form-en");
  const ownerContext = await browser.newContext({ viewport: { width: 375, height: 900 } });
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto("http://localhost:3100/admin/login");
  await ownerPage.locator('input[name="email"]').fill("owner@example.test");
  await ownerPage.locator('input[name="password"]').fill("qa-password-local-only");
  await ownerPage.locator('button[type="submit"]').click();
  await ownerPage.waitForURL("**/admin/onboarding");
  await ownerPage.goto("http://localhost:3100/platform/sales");
  await ownerPage.waitForURL("**/admin/onboarding");
  await ownerPage.goto("http://localhost:3100/admin/onboarding?step=6");
  assert.equal(await ownerPage.locator('aside[aria-label="SALES DEMO"]').count(), 0);
  assert.equal(await ownerPage.getByRole("button", { name: "Continue without payment" }).count(), 0);
  assert.match(await ownerPage.locator("main").innerText(), /payment|plan/i);
  await ownerPage.goto("http://localhost:3100/admin/dashboard");
  await ownerPage.waitForURL("**/admin/onboarding");
  results.push({ name: "normal-owner", salesRejected: true, noDemoToolbar: true, paymentStillRequired: true });
  await ownerContext.close();
  assert.deepEqual(errors, [], `Browser errors: ${errors.join("; ")}`);
  writeFileSync(path.join(output, "results.json"), JSON.stringify({ results, state, errors }, null, 2));
  console.log(`[wave1-browser] PASS ${results.length} responsive/flow checks. Screenshots: ${output}`);
} catch (e) {
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  console.error("[wave1-browser]", page.url(), await page.locator("body").innerText());
  throw e;
} finally { await browser.close(); }
