// Field Planner 2.0 workspace rendering: territory counts, legend/filters, unlocated panel, EN and FR, server-rendered (no browser, no network).
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import "./helpers/action-harness";

const { FieldWorkspace } = await import("../src/components/sales-field/FieldWorkspace");

const summary = (over = {}) => ({
  total: 5, located: 2, coverage: { LOCATED: 2, PENDING: 1, AMBIGUOUS_FAILED: 1, INSUFFICIENT_ADDRESS: 1 },
  unlocatedSample: [{ id: "c", name: "Garage Gamma", city: "Montréal", address: "1 Rue Test", coverage: "PENDING" }, { id: "d", name: "Garage Delta", city: "Laval", address: null, coverage: "AMBIGUOUS_FAILED" }], ...over,
});
const render = (locale: "en" | "fr", s = summary(), stops: { id: string; name: string; city: string | null; lat: number; lng: number }[] = []) =>
  renderToStaticMarkup(createElement(FieldWorkspace, { locale, mapConfig: null, summary: s, canRecord: true, initial: { plannedDate: "2026-10-20", name: "", stops } }));

test("all eight CRM status filters and the legend are present (EN)", () => {
  const html = render("en");
  for (const label of ["Not contacted", "Not visited", "Visit attempted", "Follow-up required", "Interested", "Demo scheduled", "Customer", "Lost / not interested"]) assert.ok(html.includes(label), label);
  assert.ok(html.includes("Reset filters"));
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 8);
});

test("territory coverage is reported separately from loaded markers and route stops", () => {
  const html = render("en", summary(), [{ id: "x", name: "Garage X", city: "Laval", lat: 45.5, lng: -73.6 }]);
  assert.ok(html.includes("In your territory") && html.includes("On the map") && html.includes("In this view") && html.includes("Match filters") && html.includes("Route stops"));
  assert.ok(html.includes("1/25"));
  assert.ok(html.includes("Garage X"));
});

test("unlocated prospects are listed with the reason and need no manual action", () => {
  const html = render("en");
  assert.ok(html.includes("Prospects not on the map yet") && html.includes("Garage Gamma") && html.includes("Locating automatically") && html.includes("Ambiguous or not found"));
  assert.ok(html.includes("nothing to do unless the address is wrong"));
  assert.ok(!render("en", summary({ total: 2, located: 2, unlocatedSample: [] })).includes("not on the map yet"));
});

test("French copy and the no-map fallback", () => {
  const html = render("fr");
  assert.ok(html.includes("Non contacté") && html.includes("Démo planifiée") && html.includes("Réinitialiser les filtres") && html.includes("Dans votre territoire"));
  assert.ok(html.includes("n’est pas configurée"), "list fallback explained");
});
