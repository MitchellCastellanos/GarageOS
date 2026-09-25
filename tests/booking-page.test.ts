import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  MAX_FEATURED_SERVICES,
  buildBookingPageViewModel,
  inferServiceIconKey,
  isOwnedBookingImageUrl,
  requiresAdvancedDesign,
  resolveEffectiveDesign,
  selectFeaturedServices,
  toPublicServices,
  validateBookingImage,
  validateBookingPagePublish,
  type CatalogServiceInput,
} from "../src/lib/booking-page";
import { contrastRatio, deriveBrandPalette } from "../src/lib/brand-color";
import { planIncludes } from "../src/config/entitlements";
import { can } from "../src/lib/subscription";
import { getShopServiceCatalog } from "../src/lib/booking-slots";
import { db } from "../src/lib/db";

const FOLDER = "https://abc.supabase.co/storage/v1/object/public/accounting/booking-page/shop_1/";

function row(overrides: Partial<CatalogServiceInput> = {}): CatalogServiceInput {
  return {
    id: overrides.id ?? "svc",
    labelFr: "Changement d'huile",
    labelEn: "Oil change",
    labelEs: "Cambio de aceite",
    durationMinutes: 30,
    isActive: true,
    sortOrder: 0,
    iconKey: null,
    isFeatured: false,
    ...overrides,
  };
}

function mockDb<M extends keyof typeof db, K extends keyof (typeof db)[M]>(
  t: TestContext,
  model: M,
  method: K,
  impl: (...args: unknown[]) => unknown
) {
  const original = db[model][method];
  db[model][method] = t.mock.fn(impl) as unknown as (typeof db)[M][K];
  t.after(() => {
    db[model][method] = original;
  });
}

const validPublish = {
  template: "CLASSIC",
  typography: "GARAGE",
  brandColor: "#1d4ed8",
  coverImageUrl: null,
  shopImageUrl: null,
};

// ── Entitlements / downgrade ────────────────────────────────────

test("advanced booking-page design is a Pro capability (Core excluded, Complete included)", () => {
  assert.equal(planIncludes("CORE", "bookingPage.advancedDesign"), false);
  assert.equal(planIncludes("PRO", "bookingPage.advancedDesign"), true);
  assert.equal(planIncludes("COMPLETE", "bookingPage.advancedDesign"), true);
});

test("only non-default template or typography requires the advanced design entitlement", () => {
  assert.equal(requiresAdvancedDesign({ template: "CLASSIC", typography: "GARAGE" }), false);
  assert.equal(requiresAdvancedDesign({ template: "MINIMAL", typography: "GARAGE" }), true);
  assert.equal(requiresAdvancedDesign({ template: "CLASSIC", typography: "PREMIUM" }), true);
});

test("a downgraded shop renders Classic/default typography without losing an allowed choice", () => {
  assert.deepEqual(resolveEffectiveDesign({ template: "BOLD", typography: "MODERN" }, false), {
    template: "CLASSIC",
    typography: "GARAGE",
  });
  assert.deepEqual(resolveEffectiveDesign({ template: "BOLD", typography: "MODERN" }, true), {
    template: "BOLD",
    typography: "MODERN",
  });
});

test("can() resolves bookingPage.advancedDesign from the effective subscription", async (t) => {
  let subscription: Record<string, unknown> = { plan: "CORE", status: "ACTIVE", trialEndsAt: null };
  mockDb(t, "shop", "findUnique", async () => ({ organizationId: null, subscription }));

  assert.equal(await can("shop_1", "bookingPage.advancedDesign"), false);

  subscription = { plan: "PRO", status: "ACTIVE", trialEndsAt: null };
  assert.equal(await can("shop_1", "bookingPage.advancedDesign"), true);

  // Trial de Pro vencido → Core → la página cae a Classic.
  subscription = { plan: "PRO", status: "TRIALING", trialEndsAt: new Date(Date.now() - 1000) };
  assert.equal(await can("shop_1", "bookingPage.advancedDesign"), false);
});

// ── Publicación (enforcement de servidor) ───────────────────────

test("a crafted Core request cannot publish a premium template or typography", () => {
  const core = { advancedDesignAllowed: false, folderPublicUrl: FOLDER, currentImages: [] };
  assert.deepEqual(validateBookingPagePublish({ ...validPublish, template: "MODERN" }, core), {
    ok: false,
    error: "entitlement",
  });
  assert.deepEqual(validateBookingPagePublish({ ...validPublish, typography: "PREMIUM" }, core), {
    ok: false,
    error: "entitlement",
  });
  const allowed = validateBookingPagePublish(validPublish, core);
  assert.equal(allowed.ok, true);
});

test("Pro can publish any template and typography", () => {
  const pro = { advancedDesignAllowed: true, folderPublicUrl: FOLDER, currentImages: [] };
  for (const template of ["CLASSIC", "MODERN", "BOLD", "MINIMAL"]) {
    const result = validateBookingPagePublish({ ...validPublish, template, typography: "PREMIUM" }, pro);
    assert.equal(result.ok, true, template);
  }
});

test("publish rejects unknown enums, bad colors and normalizes an empty color to the default", () => {
  const ctx = { advancedDesignAllowed: true, folderPublicUrl: FOLDER, currentImages: [] };
  assert.equal(validateBookingPagePublish({ ...validPublish, template: "NEON" }, ctx).ok, false);
  assert.equal(validateBookingPagePublish({ ...validPublish, brandColor: "red" }, ctx).ok, false);
  const reset = validateBookingPagePublish({ ...validPublish, brandColor: "" }, ctx);
  assert.ok(reset.ok);
  assert.equal(reset.data.brandColor, null);
});

test("publish only accepts photos uploaded to this shop's folder (or already published ones)", () => {
  const ctx = { advancedDesignAllowed: false, folderPublicUrl: FOLDER, currentImages: ["https://legacy.example/old.jpg"] };
  const own = `${FOLDER}cover-1737000000000.webp`;
  assert.equal(validateBookingPagePublish({ ...validPublish, coverImageUrl: own }, ctx).ok, true);
  assert.equal(
    validateBookingPagePublish({ ...validPublish, shopImageUrl: "https://legacy.example/old.jpg" }, ctx).ok,
    true
  );

  for (const bad of [
    "https://evil.example/cover.webp",
    FOLDER.replace("shop_1", "shop_2") + "cover-1.webp",
    `${FOLDER}../shop_2/cover-1.webp`,
    "javascript:alert(1)",
  ]) {
    assert.deepEqual(validateBookingPagePublish({ ...validPublish, coverImageUrl: bad }, ctx), {
      ok: false,
      error: "invalidImage",
    });
  }

  // Sin storage configurado no se puede validar una foto nueva.
  assert.equal(
    validateBookingPagePublish({ ...validPublish, coverImageUrl: own }, { ...ctx, folderPublicUrl: null }).ok,
    false
  );
});

test("isOwnedBookingImageUrl accepts the cache-busting query but not nested paths", () => {
  assert.equal(isOwnedBookingImageUrl(`${FOLDER}shop-1.webp?t=123`, FOLDER), true);
  assert.equal(isOwnedBookingImageUrl(`${FOLDER}nested/shop-1.webp`, FOLDER), false);
  assert.equal(isOwnedBookingImageUrl(`${FOLDER}`, FOLDER), false);
});

test("booking photos are validated by type and size", () => {
  assert.equal(validateBookingImage({ size: 2_000_000, type: "image/jpeg" }), null);
  assert.equal(validateBookingImage({ size: 0, type: "image/jpeg" }), "empty");
  assert.equal(validateBookingImage({ size: 5 * 1024 * 1024, type: "image/jpeg" }), "tooLarge");
  assert.equal(validateBookingImage({ size: 1000, type: "image/svg+xml" }), "invalidType");
});

// ── Servicios reales ────────────────────────────────────────────

test("public services come from the active catalog, in order, with resolved icons", () => {
  const services = toPublicServices([
    row({ id: "b", sortOrder: 2, labelFr: "Freins", labelEn: "Brakes", labelEs: "Frenos" }),
    row({ id: "a", sortOrder: 1, iconKey: "battery" }),
    row({ id: "off", sortOrder: 0, isActive: false }),
    row({ id: "c", sortOrder: 3, iconKey: "not-an-icon", labelFr: "X", labelEn: "Y", labelEs: "Z" }),
  ]);
  assert.deepEqual(
    services.map((s) => [s.id, s.iconKey]),
    [
      ["a", "battery"],
      ["b", "brakes"],
      ["c", "wrench"],
    ]
  );
});

test("featured services skip deactivated rows and are capped", () => {
  const catalog = Array.from({ length: 8 }, (_, i) =>
    row({ id: `s${i}`, sortOrder: i, isFeatured: true, isActive: i !== 1 })
  );
  const featured = selectFeaturedServices(toPublicServices(catalog));
  assert.equal(featured.length, MAX_FEATURED_SERVICES);
  assert.ok(!featured.some((s) => s.id === "s1"));
  assert.deepEqual(selectFeaturedServices(toPublicServices([row()])), []);
});

test("icons are inferred from FR/EN/ES service names", () => {
  assert.equal(inferServiceIconKey(["Changement d'huile"]), "oil");
  assert.equal(inferServiceIconKey(["Alignement des roues"]), "alignment");
  assert.equal(inferServiceIconKey(["Pneus d'hiver"]), "tires");
  assert.equal(inferServiceIconKey(["Système électrique"]), "electrical");
  assert.equal(inferServiceIconKey(["Recarga de A/C"]), "ac");
  assert.equal(inferServiceIconKey(["Boil test"]), "wrench");
  assert.equal(inferServiceIconKey(["Mécanique générale"]), "wrench");
});

test("a shop without saved services gets the factory catalog with the old five featured services", async (t) => {
  mockDb(t, "shopBookingService", "findMany", async () => []);
  const catalog = await getShopServiceCatalog("shop_1");
  assert.deepEqual(
    catalog.filter((s) => s.isFeatured).map((s) => s.id).sort(),
    ["battery", "brakes", "general", "oil_change", "tires"]
  );
  assert.ok(catalog.every((s) => s.iconKey));
});

test("saved services expose their icon and featured metadata", async (t) => {
  mockDb(t, "shopBookingService", "findMany", async () => [
    {
      id: "row1",
      labelFr: "Freins",
      labelEn: "Brakes",
      labelEs: "Frenos",
      durationMinutes: 90,
      isActive: true,
      sortOrder: 0,
      iconKey: "brakes",
      isFeatured: true,
    },
  ]);
  const [service] = await getShopServiceCatalog("shop_1");
  assert.equal(service.iconKey, "brakes");
  assert.equal(service.isFeatured, true);
});

// ── View model / color ──────────────────────────────────────────

test("view model treats empty photo URLs as missing and derives featured services", () => {
  const vm = buildBookingPageViewModel({
    slug: "garage",
    shop: { name: "Garage", logoUrl: null, phone: null, address: null, bookingSlotMinutes: 60 },
    coverImageUrl: "",
    shopImageUrl: null,
    services: toPublicServices([row({ id: "x", isFeatured: true })]),
  });
  assert.equal(vm.coverImageUrl, null);
  assert.deepEqual(vm.featured.map((s) => s.id), ["x"]);
});

test("the brand palette stays readable for very light or invalid colors", () => {
  for (const color of ["#ffff00", "#ffffff", "#9be7ff", "not-a-color", null]) {
    const palette = deriveBrandPalette(color);
    assert.ok(contrastRatio(palette.primary, "#ffffff") >= 4.5, `${color} → ${palette.primary}`);
    assert.ok(contrastRatio(palette.primaryHover, "#ffffff") >= 4.5);
    assert.ok(contrastRatio(palette.primary, palette.primarySoft) >= 3);
  }
});
