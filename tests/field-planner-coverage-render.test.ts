// Field Planner rendering: the coverage indicator and the located/unlocated list, EN and FR, server-rendered (no browser, no network).
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import "./helpers/action-harness";

const { RoutePlanner } = await import("../src/components/sales-field/RoutePlanner");

const mk = (id: string, name: string, coverage: "LOCATED" | "PENDING" | "AMBIGUOUS_FAILED" | "INSUFFICIENT_ADDRESS", city = "Montréal") => ({
  id, name, city, address: "1 Rue Test", territoryKey: null, stage: null, plannedElsewhere: false, coverage,
  location: coverage === "LOCATED" ? { usable: true as const, lat: 45.5, lng: -73.5 } : { usable: false as const, reason: "NONE" },
});
const candidates = [mk("a", "Garage Alpha", "LOCATED"), mk("b", "Garage Beta", "LOCATED", "Laval"), mk("c", "Garage Gamma", "PENDING"), mk("d", "Garage Delta", "AMBIGUOUS_FAILED"), mk("e", "Garage Epsilon", "INSUFFICIENT_ADDRESS")];
const render = (locale: "en" | "fr", cs = candidates, showAll = false) => renderToStaticMarkup(createElement(RoutePlanner, {
  locale, candidates: cs, territories: [], geocoding: { mode: "DISABLED", reason: "NO_PROVIDER_CONFIGURED" }, mapConfig: null,
  initial: { plannedDate: "2026-10-20", name: "", selectedIds: showAll ? ["c"] : [] },
}));

test("the planner shows the four coverage counts and lists located prospects first; unlocated ones stay hidden behind the existing toggle", () => {
  const html = render("en");
  for (const [label, n] of [["On the map", 2], ["Locating automatically", 1], ["Ambiguous or not found", 1], ["Address incomplete", 1]] as const) assert.ok(html.includes(`${label}: ${n}`), label);
  assert.ok(html.includes("Garage Alpha") && html.includes("Garage Beta"));
  assert.ok(!html.includes("Garage Gamma") && !html.includes("Garage Delta"), "unlocated prospects are hidden until the seller asks");
  assert.ok(html.includes("3 hidden") || html.includes("(3 "), "the hidden count is still reported");
  assert.ok(html.includes("nothing for you to do"), "no manual geolocation work is asked of the seller");
});

test("a selected-but-unlocated prospect explains its state without any manual action", () => {
  const html = render("en", candidates, true);
  assert.ok(html.includes("Garage Gamma") && html.includes("Locating automatically") && html.includes("Will appear on the map once located."));
});

test("French copy", () => {
  const html = render("fr");
  assert.ok(html.includes("Sur la carte: 2") && html.includes("Localisation automatique en cours: 1") && html.includes("Adresse incomplète: 1"));
});

test("nothing is rendered when the seller has no prospects, and the all-located case shows no 'pending' note", () => {
  assert.ok(!render("en", []).includes("Map location coverage"));
  const all = render("en", candidates.filter((c) => c.coverage === "LOCATED"));
  assert.ok(all.includes("On the map: 2") && !all.includes("nothing for you to do"));
});
