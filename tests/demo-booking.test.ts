import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContactSection } from "../src/components/booking/ContactSection";
import { LocaleProvider } from "../src/components/booking/LocaleProvider";
import { PhoneLink } from "../src/components/booking/PhoneLink";
import { BookingDemoContext } from "../src/components/booking/BookingDemoContext";
import { toPublicServices, selectFeaturedServices, groupOpenHours } from "../src/lib/booking-page";
import { DEMO_BOOKING_COPY } from "../src/lib/demo-booking-copy";
import {
  demoAvailableDates, demoDateWindow, demoServiceDuration, demoSlotsForDate,
} from "../src/lib/demo-booking-availability";
import {
  DEMO_BOOKING_CATALOG, DEMO_BOOKING_DESIGN, DEMO_BOOKING_HOURS, DEMO_BOOKING_SHOP, DEMO_BOOKING_SLUG, DEMO_BOOKING_TIMEZONE,
  buildDemoBookingPage,
} from "../src/lib/demo-booking-shop";
import * as D from "../scripts/marketing/garage-laurent-dataset";
import { isTrackablePath } from "../src/lib/privacy/private-paths";

// PhoneLink exige children en sus props; createElement los recibe como argumento.
const Phone = PhoneLink as unknown as ComponentType<{ phone: string; className?: string; children?: ReactNode }>;

const root = process.cwd();
const sha = (file: string) => createHash("sha256").update(readFileSync(path.join(root, file))).digest("hex");

// ── Fidelidad con el seed ─────────────────────────────────────────────────────────
test("demo shop data mirrors the seeded Garage Laurent (services, order, icons, featured, hours, slug, tz)", () => {
  assert.equal(DEMO_BOOKING_SLUG, D.SHOP_SLUG);
  assert.equal(DEMO_BOOKING_TIMEZONE, D.SHOP_TZ);
  assert.equal(DEMO_BOOKING_CATALOG.length, D.SERVICES.length);
  D.SERVICES.forEach((s, i) => {
    const row = DEMO_BOOKING_CATALOG[i];
    assert.equal(row.id, D.id(`svc-${s.key}`));
    assert.deepEqual([row.labelFr, row.labelEn, row.labelEs], [s.labelFr, s.labelEn, s.labelEs]);
    assert.equal(row.iconKey, s.iconKey);
    assert.equal(row.isFeatured, s.featured);
    assert.equal(row.sortOrder, i);
    assert.equal(row.durationMinutes, 60);
  });
  for (let dow = 0; dow <= 6; dow++) {
    const h = D.SHOP_HOURS[dow];
    const row = DEMO_BOOKING_HOURS.find((r) => r.dayOfWeek === dow)!;
    assert.equal(row.isClosed, h === null);
    assert.equal(row.openTime, h?.open ?? "09:00");
    assert.equal(row.closeTime, h?.close ?? "17:00");
  }
});

test("seed shop settings are the ones the replica uses (brand, contact, template, typography, slot rules)", () => {
  const seed = readFileSync(path.join(root, "scripts/seed-marketing-garage-laurent.ts"), "utf8");
  const has = (s: string) => assert.ok(seed.includes(s), s);
  has(`brandColor: "${DEMO_BOOKING_SHOP.brandColor}"`);
  has(`address: "${DEMO_BOOKING_SHOP.address}"`);
  has(`phone: "${DEMO_BOOKING_SHOP.phone}"`);
  has(`bookingSlotMinutes: ${DEMO_BOOKING_SHOP.bookingSlotMinutes}`);
  has(`bookingLeadTimeHours: ${DEMO_BOOKING_SHOP.bookingLeadTimeHours}`);
  has(`bookingAdvanceDays: ${DEMO_BOOKING_SHOP.bookingAdvanceDays}`);
  has(`bookingTemplate: "${DEMO_BOOKING_DESIGN.template}"`);
  has(`bookingTypography: "${DEMO_BOOKING_DESIGN.typography}"`);
});

test("view model: 6 services in seed order, 4 featured, grouped hours Mon–Fri 8–17 + Sat 9–13", () => {
  const page = buildDemoBookingPage();
  assert.equal(page.services.length, 6);
  assert.deepEqual(page.featured.map((s) => s.iconKey), ["oil", "tires", "brakes", "inspection"]);
  assert.deepEqual(selectFeaturedServices(toPublicServices(DEMO_BOOKING_CATALOG)).length, 4);
  assert.deepEqual(page.hours, groupOpenHours(DEMO_BOOKING_HOURS));
  assert.deepEqual(page.hours, [
    { fromDay: 1, toDay: 5, openTime: "08:00", closeTime: "17:00" },
    { fromDay: 6, toDay: 6, openTime: "09:00", closeTime: "13:00" },
  ]);
});

test("replica assets are the shop's own: logo identical to the manifest hash, cover/shop WebP sized like the Storage objects", () => {
  const manifest = JSON.parse(readFileSync(path.join(root, "docs/demo-journey/garage-laurent-assets-manifest.json"), "utf8"));
  const logo = manifest.assets.find((a: { role: string }) => a.role === "logo");
  assert.equal(sha("public/demo/garage-laurent/booking/logo.png"), logo.sha256);
  // Tamaños de los objetos reales en Supabase Storage (verificados por consulta de solo lectura).
  assert.equal(readFileSync(path.join(root, "public/demo/garage-laurent/booking/cover.webp")).length, 251_436);
  assert.equal(readFileSync(path.join(root, "public/demo/garage-laurent/booking/shop.webp")).length, 249_074);
  for (const url of [DEMO_BOOKING_SHOP.logoUrl, DEMO_BOOKING_SHOP.coverImageUrl, DEMO_BOOKING_SHOP.shopImageUrl]) {
    assert.ok(url.startsWith("/demo/garage-laurent/booking/"), url);
  }
});

// ── Disponibilidad ficticia ───────────────────────────────────────────────────────
const NOW = new Date("2026-10-07T15:00:00Z"); // miércoles 11:00 en Montreal (EDT)

test("window is 30 shop-days starting today in Montreal, and rolls over at local midnight (not UTC)", () => {
  const w = demoDateWindow(NOW);
  assert.equal(w.length, 30);
  assert.equal(w[0], "2026-10-07");
  assert.equal(w[1], "2026-10-08");
  // 23:30 en Montreal del 7 ya es 8 en UTC: para el taller sigue siendo el 7.
  assert.equal(demoDateWindow(new Date("2026-10-08T03:30:00Z"))[0], "2026-10-07");
  assert.equal(demoDateWindow(new Date("2026-10-08T04:30:00Z"))[0], "2026-10-08");
});

test("slots respect shop hours, grid, service duration, closed Sundays and the 24 h lead time", () => {
  const dur = demoServiceDuration("mkt-gl-v1-svc-oil");
  assert.equal(dur, 60);
  // Hoy (miércoles 11:00) con 24 h de anticipación: no hay nada hoy; mañana solo desde las 11:00.
  assert.deepEqual(demoSlotsForDate("2026-10-07", dur, NOW), []);
  const tomorrow = demoSlotsForDate("2026-10-08", dur, NOW).map((s) => s.time);
  assert.ok(tomorrow.length >= 3 && tomorrow.every((t) => t >= "11:00" && t <= "16:00"), tomorrow.join());
  // Domingo cerrado.
  assert.deepEqual(demoSlotsForDate("2026-10-11", dur, NOW), []);
  // Sábado 9–13: última salida a las 12:00 para 60 min y a las 11:00 para 120 min.
  const sat60 = demoSlotsForDate("2026-10-10", 60, NOW).map((s) => s.time);
  assert.ok(sat60.length >= 3 && sat60.every((t) => t >= "09:00" && t <= "12:00"));
  const sat120 = demoSlotsForDate("2026-10-10", 120, NOW).map((s) => s.time);
  assert.ok(sat120.every((t) => t >= "09:00" && t <= "11:00"));
  // Días laborales lejanos: de 8:00 a 16:00 en rejilla de 60 min.
  for (const s of demoSlotsForDate("2026-10-20", 60, NOW)) assert.match(s.time, /^(08|09|1[0-6]):00$/);
});

test("a longer service never overlaps closing time or a fictitious appointment", () => {
  for (const date of demoDateWindow(NOW)) {
    for (const s of demoSlotsForDate(date, 180, NOW)) {
      const startMin = Number(s.time.slice(0, 2)) * 60;
      const close = date === "2026-10-10" || date === "2026-10-17" || date === "2026-10-24" || date === "2026-10-31" ? 13 * 60 : 17 * 60;
      assert.ok(startMin + 180 <= close, `${date} ${s.time}`);
    }
  }
});

test("availability is deterministic, future-relative, never empty on open days, and nothing beyond the 30-day window", () => {
  assert.deepEqual(demoAvailableDates(60, NOW), demoAvailableDates(60, NOW));
  const dates = demoAvailableDates(60, NOW);
  assert.ok(dates.length >= 15, `${dates.length} bookable days`);
  assert.ok(dates.every((d) => d >= "2026-10-08"));
  assert.ok(!dates.includes("2026-10-11")); // domingo
  // Dentro de 100 días no hay nada (ventana de 30).
  assert.deepEqual(demoSlotsForDate("2027-01-20", 60, NOW), []);
  // Misma lógica en otra fecha relativa: se desplaza con el reloj.
  const later = new Date("2026-11-04T15:00:00Z"); // 11:00 EST, ya con horario de invierno
  const w = demoDateWindow(later);
  assert.equal(w[0], "2026-11-04");
  assert.ok(demoAvailableDates(60, later).every((d) => d >= "2026-11-05"));
});

// ── Booking real intacto sin el modo demo ───────────────────────────────────────────
test("without the demo context the real components keep their normal behaviour (SSR)", () => {
  const html = renderToStaticMarkup(createElement(LocaleProvider, null, createElement(ContactSection, { slug: "x", shopName: "X" })));
  assert.match(html, /type="submit"/);
  assert.doesNotMatch(html, /\sdisabled=""/);
  // className idéntico al original (sin espacios sobrantes).
  assert.ok(html.includes('class="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm" name="name"') || html.includes('class="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm"'));
  const phone = renderToStaticMarkup(createElement(LocaleProvider, null, createElement(Phone, { phone: "+1 514 555 0100", className: "c" }, "tel")));
  assert.match(phone, /<a href="tel:\+1 514 555 0100"/);
});

test("with the demo context: contact form is disabled with the FR note, no submit button, phone is not a link", () => {
  const api = { loadDates: async () => ({ dates: [], availableDates: [] }), loadSlots: async () => [] };
  const wrap = (child: ReturnType<typeof createElement>) =>
    renderToStaticMarkup(createElement(LocaleProvider, null, createElement(BookingDemoContext.Provider, { value: api }, child)));
  const contact = wrap(createElement(ContactSection, { slug: "x", shopName: "X" }));
  assert.doesNotMatch(contact, /type="submit"/);
  assert.equal((contact.match(/\sdisabled=""/g) ?? []).length, 4);
  assert.ok(contact.includes(DEMO_BOOKING_COPY.fr.formNote.replace("'", "&#x27;")));
  const phone = wrap(createElement(Phone, { phone: "+1 514 555 0100", className: "c" }, "tel"));
  assert.doesNotMatch(phone, /href=/);
  assert.match(phone, /aria-disabled="true"/);
});

test("demo copy carries the required form note in FR, EN and ES", () => {
  assert.equal(DEMO_BOOKING_COPY.es.formNote, "Aquí tus clientes completan sus datos para reservar. El envío está deshabilitado en esta demostración.");
  assert.ok(DEMO_BOOKING_COPY.fr.formNote.includes("désactivé"));
  assert.ok(DEMO_BOOKING_COPY.en.formNote.includes("disabled"));
});

test("demo-only source files perform no network or write calls", () => {
  const files = [
    "src/lib/demo-booking-availability.ts", "src/lib/demo-booking-shop.ts", "src/lib/demo-booking-copy.ts",
    "src/components/booking/demo/DemoBookingExperience.tsx", "src/app/(site)/demo/booking/page.tsx",
  ];
  for (const f of files) {
    const src = readFileSync(path.join(root, f), "utf8");
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|sendBeacon|@\/lib\/db|prisma|supabase|use server|"POST"/i, f);
  }
  assert.ok(readdirSync(path.join(root, "src/app/(site)/demo/booking")).every((n) => n === "page.tsx"), "no route handlers under /demo/booking");
});

test("the page-view beacon skips the demo booking replica (no write endpoint, no IP/user-agent stored)", () => {
  const src = readFileSync(path.join(root, "src/components/AnalyticsBeacon.tsx"), "utf8");
  // El beacon decide con la función compartida (src/lib/privacy/private-paths.ts), que además excluye las rutas con token.
  assert.match(src, /if \(!isTrackablePath\(pathname\)\) return;/);
  assert.equal(isTrackablePath("/demo/booking"), false);
  assert.equal(isTrackablePath("/demo/booking/anything"), false);
  assert.equal(isTrackablePath("/demo"), true); // /demo (marketing) sigue igual
});
