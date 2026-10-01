import assert from "node:assert/strict";
const control = async (path, method = "GET") => (await fetch("http://127.0.0.1:55442" + path, { method })).json();
export async function verifyWave2Browser({ page, responsive, results }) {
  await page.goto("http://localhost:3100/admin/demo");
  await page.getByRole("heading", { name: /Parcours de démonstration/ }).waitFor();
  await responsive("wave2-controls-fr");
  await page.getByRole("button", { name: "Charger un scénario de démonstration" }).click();
  await page.getByText("Scénario chargé.", { exact: false }).waitFor();
  let state = await control("/wave2-state");
  const batch = state.demos[0].scenarioBatchId;
  assert.ok(batch); assert.deepEqual(Object.values(state.counts), [1, 1, 1, 1, 1, 1]);
  await page.reload(); assert.equal(await page.getByRole("button", { name: "Charger un scénario de démonstration" }).count(), 0);
  await responsive("wave2-scenario-loaded");
  await page.getByLabel("J’ai l’autorisation de contacter", { exact: false }).check();
  await page.getByRole("button", { name: "Activer les communications de la démo", exact: true }).click();
  await page.getByRole("heading", { name: "Communications de la démo activées" }).waitFor();
  state = await control("/wave2-state");
  assert.equal(state.demos[0].communicationsEnabled, true); assert.equal(state.demos[0].communicationsSuspendedAt, null);
  // All providers remain disabled in the QA app. Enabling Sales semantics cannot change that.
  results.push({ name: "wave2-scenario-communications", batch, counts: state.counts, providerActions: "disabled" });
  await control("/wave2-booking", "POST");
  const bookingUrl = "http://localhost:3100/book/" + state.demos[0].slug;
  assert.ok(state.demos[0].slug);
  for (const tier of ["CORE", "PRO", "COMPLETE"]) {
    await page.goto("http://localhost:3100/admin/demo");
    await page.getByRole("combobox", { name: "Forfait de démonstration" }).selectOption(tier);
    await page.waitForFunction((p) => document.querySelector('select[aria-label="Forfait de démonstration"]')?.value === p && !document.querySelector('select[aria-label="Forfait de démonstration"]')?.disabled, tier);
    await page.goto(bookingUrl);
    await page.getByRole("heading", { level: 1 }).waitFor();
    assert.match(await page.locator("body").innerText(), /Garage Démonstration Dupont/);
    // Renderer publishes actual design on its root via CSS classes.
    const headingFont = await page.locator(".bp-body").first().evaluate((e) => e.style.getPropertyValue("--bp-font-heading"));
    assert.match(headingFont, tier === "CORE" ? /font-oswald/ : /font-bp-playfair/);
    const snapshot = await page.locator("body").innerText();
    assert.match(snapshot, /huile|Oil|frein|Brake/i);
    await responsive("wave2-booking-" + tier.toLowerCase());
    state = await control("/wave2-state");
    assert.equal(state.demos[0].bookingTemplate, "MODERN"); // stored preference survives Core fallback
    results.push({ name: "wave2-booking-tier", tier, persistedTemplate: "MODERN" });
  }
  await control("/wave2-live", "POST"); await control("/wave2-link", "POST");
  await page.goto("http://localhost:3100/admin/demo");
  await page.getByLabel("Supprimer aussi ce lot fictif", { exact: false }).check();
  await page.getByLabel("Je comprends ce qui sera réinitialisé.").check();
  await page.getByRole("button", { name: "Recommencer le parcours", exact: true }).click();
  await page.getByText("Ce scénario est lié", { exact: false }).waitFor();
  await responsive("wave2-restart-refused");
  state = await control("/wave2-state"); assert.equal(state.demos[0].scenarioBatchId, batch); assert.ok(state.demos[0].onboardingCompletedAt);
  await control("/wave2-unlink", "POST");
  await page.getByRole("button", { name: "Recommencer le parcours", exact: true }).click();
  await page.waitForURL("**/admin/onboarding");
  state = await control("/wave2-state");
  assert.equal(state.demos[0].scenarioBatchId, null); assert.equal(state.demos[0].onboardingCompletedAt, null);
  assert.deepEqual(Object.values(state.counts), [0, 0, 0, 0, 0, 0]);
  assert.ok(state.demos[0].logoUrl && state.demos[0].bookingCoverImageUrl && state.demos[0].bookingShopImageUrl);
  await responsive("wave2-restart-onboarding");
  await control("/wave2-complete", "POST");
  await page.goto("http://localhost:3100/admin/clients");
  await page.getByText("Real prospect", { exact: true }).waitFor();
  results.push({ name: "wave2-restart-safe", removedScenario: true, preservedLiveClient: true, preservedBranding: true });
  await control("/wave2-english", "POST");
  await page.goto("http://localhost:3100/admin/demo");
  await page.getByRole("heading", { name: /Demo walkthrough/ }).waitFor();
  await responsive("wave2-controls-en");
  await control("/wave2-complete", "POST");
  await page.goto("http://localhost:3100/admin/dashboard");
}
