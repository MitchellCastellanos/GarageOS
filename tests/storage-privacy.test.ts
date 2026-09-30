import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { patchDb, mockSubscription } from "./helpers/db-mock";
import {
  isCleanStoragePath, isPublicAssetPath, isTenantStoragePath, rewriteLegacyPublicAssetUrl, sanitizeStorageFileName,
} from "../src/lib/storage-paths";

const storage = await import("../src/lib/storage");
const pkg = await import("../src/lib/invoice-document-package");

// ── cliente Supabase falso ────────────────────────────────────────────────
interface Call { op: string; bucket: string; path?: string; ttl?: number }
function fakeClient(opts: { publicBuckets?: string[]; existing?: string[] } = {}) {
  const calls: Call[] = [];
  const objects = new Map<string, Buffer>();
  const publicBuckets = new Set(opts.publicBuckets ?? ["public-assets"]);
  const existing = opts.existing ?? ["public-assets", "accounting", "communications"];
  const client = {
    storage: {
      listBuckets: async () => ({ data: existing.map((name) => ({ name, public: publicBuckets.has(name) })), error: null }),
      createBucket: async () => ({ error: null }),
      from: (bucket: string) => ({
        upload: async (path: string, buf: Buffer) => { calls.push({ op: "upload", bucket, path }); objects.set(`${bucket}/${path}`, buf); return { error: null }; },
        download: async (path: string) => {
          calls.push({ op: "download", bucket, path });
          const b = objects.get(`${bucket}/${path}`);
          return b ? { data: new Blob([new Uint8Array(b)]), error: null } : { data: null, error: { message: "not found" } };
        },
        createSignedUrl: async (path: string, ttl: number) => { calls.push({ op: "sign", bucket, path, ttl }); return { data: { signedUrl: `https://x.supabase.co/sign/${bucket}/${path}?token=t&ttl=${ttl}` }, error: null }; },
        getPublicUrl: (path: string) => { calls.push({ op: "public", bucket, path }); return { data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}` } }; },
      }),
    },
  } as unknown as SupabaseClient;
  return { client, calls, objects };
}
function withClient(t: { after: (fn: () => void) => void }, f = fakeClient()) {
  storage.__setStorageClientForTests(f.client);
  t.after(() => storage.__setStorageClientForTests(null));
  return f;
}

// ── validación de paths ───────────────────────────────────────────────────
test("path validation: crafted paths cannot escape the tenant prefix", () => {
  const good = "shopA/invoice-share/tok.pdf";
  assert.ok(isTenantStoragePath("shopA", good));
  const bad = [
    "shopB/invoice-share/tok.pdf", "shopA/../shopB/x.pdf", "shopA/./x", "shopA//x", "/shopA/x", "shopA/x/", "shopA/",
    "shopA", "shopAB/x", "shopA/%2e%2e/shopB/x", "shopA\\..\\shopB\\x", "shopA/x\u0000.pdf", "", "shopA/" + "a".repeat(600),
    "shopA/x\n", "  shopA/x",
  ];
  for (const p of bad) assert.equal(isTenantStoragePath("shopA", p), false, JSON.stringify(p));
  for (const p of [null, undefined, 42, {}, ["shopA/x"]]) assert.equal(isTenantStoragePath("shopA", p), false);
  for (const s of ["", "a/b", "..", "a b", "a%2Fb"]) assert.equal(isTenantStoragePath(s, `${s}/x`), false, `shopId ${s}`);
  assert.equal(isCleanStoragePath("a/../b"), false);
});

test("file names are sanitised before entering a key", () => {
  assert.equal(sanitizeStorageFileName("../../etc/passwd"), "__.._etc_passwd");
  assert.doesNotMatch(sanitizeStorageFileName("../../a b/ç.pdf"), /[\/\\ ]/);
  assert.equal(sanitizeStorageFileName(""), "file");
  assert.equal(sanitizeStorageFileName(".hidden"), "_hidden");
});

// ── público ────────────────────────────────────────────────────────────────
test("public assets: logo and booking images use the public bucket and keep public URLs", async (t) => {
  const f = withClient(t);
  const logo = await storage.uploadShopLogoToStorage("shopA", Buffer.from("x"), "image/png", "png");
  assert.equal(logo.storagePath, "logos/shopA/logo.png");
  assert.match(logo.publicUrl, /\/object\/public\/public-assets\/logos\/shopA\/logo\.png$/);
  const img = await storage.uploadBookingPageImageToStorage("booking-page/shopA/", "cover", Buffer.from("x"));
  assert.match(img.publicUrl, /\/object\/public\/public-assets\/booking-page\/shopA\/cover-\d+\.webp$/);
  assert.ok(f.calls.filter((c) => c.op === "upload").every((c) => c.bucket === "public-assets"));
  assert.match(storage.publicAssetFolderUrl("booking-page/shopA/"), /public-assets\/booking-page\/shopA\/$/);
  assert.throws(() => storage.publicAssetFolderUrl("shopA/invoice-share/"), /Not a public asset path/);
});

test("public URL helper refuses private / non-public / traversal paths", (t) => {
  withClient(t);
  for (const p of ["shopA/invoice-share/t.pdf", "shopA/inspections/1/a.jpg", "logos/../shopA/x", "communications/x", "/logos/a"]) {
    assert.throws(() => storage.publicAssetUrl(p), /Not a public asset path/, p);
  }
  assert.equal(isPublicAssetPath("logos/s/logo.png"), true);
});

test("public bucket is only used for public prefixes; a private bucket that is public fails closed", async (t) => {
  withClient(t, fakeClient({ publicBuckets: ["public-assets", "accounting"] })); // accounting aún público (pre-migración)
  await assert.rejects(
    storage.uploadPrivateDocument("shopA", "invoice-payments/INV-1/receipts", "r.pdf", Buffer.from("x"), "application/pdf"),
    /PRIVADO/
  );
  await assert.rejects(storage.uploadInvoiceClientPackage("shopA", "tok", Buffer.from("x")), /PRIVADO/);
});

// ── privado ────────────────────────────────────────────────────────────────
test("private uploads return only a tenant path — no URL — and go to the private bucket", async (t) => {
  const f = withClient(t);
  const res = await storage.uploadPrivateDocument("shopA", "invoice-payments/INV-1/receipts", "../r ec.pdf", Buffer.from("x"), "application/pdf");
  assert.deepEqual(Object.keys(res), ["storagePath"]);
  assert.ok(isTenantStoragePath("shopA", res.storagePath));
  assert.doesNotMatch(res.storagePath, /\.\.|\s/);
  const pkgPath = await storage.uploadInvoiceClientPackage("shopA", "tok_1", Buffer.from("x"));
  assert.equal(pkgPath, "shopA/invoice-share/tok_1.pdf");
  assert.ok(f.calls.every((c) => c.bucket === "accounting" && c.op === "upload"));
  assert.ok(!f.calls.some((c) => c.op === "public"), "no public URL generated for private docs");
  assert.equal(await storage.uploadInvoiceClientPackage("shopA", "a/../b", Buffer.from("x")).catch(() => "rejected"), "rejected");
});

test("same-shop signed URL works (short TTL); cross-shop and crafted paths are rejected before Supabase is called", async (t) => {
  const f = withClient(t);
  const url = await storage.signedUrlForPrivateDocument("shopA", "shopA/inspections/i1/1-a.jpg", 60);
  assert.match(url, /^https:\/\/x\.supabase\.co\/sign\/accounting\/shopA\//);
  assert.ok(!/object\/public/.test(url));
  const before = f.calls.length;
  for (const p of ["shopB/inspections/i1/1-a.jpg", "shopA/../shopB/x.jpg", "shopB/../shopA/x.jpg", "shopA/%2e%2e/x"]) {
    await assert.rejects(storage.signedUrlForPrivateDocument("shopA", p), /Invalid storage path/, p);
    await assert.rejects(storage.downloadPrivateDocument("shopA", p), /Invalid storage path/, p);
    assert.equal(await storage.trySignedUrlForPrivateDocument("shopA", p), null);
  }
  assert.equal(f.calls.length, before, "no storage call for rejected paths");
});

test("invoice/payment/accounting documents: same-shop download works, other shop's path is skipped when assembling a package", async (t) => {
  const f = withClient(t);
  f.objects.set("accounting/shopA/invoice-payments/INV-1/receipts/r.pdf", Buffer.from("%PDF-A"));
  f.objects.set("accounting/shopB/invoice-payments/INV-9/receipts/r.pdf", Buffer.from("%PDF-B"));
  t.mock.method(console, "error", () => {});
  const parts = await pkg.storagePathsToParts("shopA", [
    "shopA/invoice-payments/INV-1/receipts/r.pdf",
    "shopB/invoice-payments/INV-9/receipts/r.pdf", // manipulado
  ]);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].buffer.toString(), "%PDF-A");
  assert.ok(!f.calls.some((c) => c.path?.startsWith("shopB/")), "shop B object never requested");
});

test("communication attachments stay private: private bucket, tenant-bound signed URL, no public URL", async (t) => {
  const f = withClient(t);
  const { storagePath } = await storage.uploadCommunicationAttachment("shopA", "msg_1", "inv oice.pdf", Buffer.from("x"), "application/pdf");
  assert.ok(isTenantStoragePath("shopA", storagePath));
  const url = await storage.signedUrlForCommunicationAttachment("shopA", storagePath);
  assert.match(url, /\/sign\/communications\//);
  await assert.rejects(storage.signedUrlForCommunicationAttachment("shopB", storagePath), /Invalid storage path/);
  await assert.rejects(storage.uploadCommunicationAttachment("shopA", "../m", "a.pdf", Buffer.from("x"), "application/pdf"), /Invalid message id/);
  assert.ok(f.calls.every((c) => c.bucket === "communications" && c.op !== "public"));
  // un bucket de comunicaciones público debe fallar cerrado
  withClient(t, fakeClient({ publicBuckets: ["communications"] }));
  await assert.rejects(storage.uploadCommunicationAttachment("shopA", "m1", "a.pdf", Buffer.from("x"), "application/pdf"), /PRIVADO/);
});

// ── Reporte DVI compartido (cliente / Customer Portal) ─────────────────────
test("shared DVI report photo: token holder gets a 60s signed redirect; wrong token / other inspection / no plan get 404", async (t) => {
  const f = withClient(t);
  const route = await import("../src/app/inspection/[token]/photo/[photoId]/route");
  const TOKEN = "t".repeat(32);
  const find = patchDb(t, "inspectionPhoto", "findFirst", (async (args: { where: { id: string; inspectionItem: { inspection: { shareToken: string } } } }) =>
    args.where.id === "p1" && args.where.inspectionItem.inspection.shareToken === TOKEN
      ? { storagePath: "shopA/inspections/i1/1-a.jpg", inspectionItem: { inspection: { shopId: "shopA" } } }
      : null) as never);
  mockSubscription(t, "PRO");
  const call = (token: string, photoId: string) =>
    route.GET(new Request("http://x"), { params: Promise.resolve({ token, photoId }) });

  const ok = await call(TOKEN, "p1");
  assert.equal(ok.status, 302);
  const loc = ok.headers.get("location")!;
  assert.match(loc, /\/sign\/accounting\/shopA\/inspections\/i1\/1-a\.jpg\?token=t&ttl=60$/);
  assert.equal(ok.headers.get("cache-control"), "no-store");

  assert.equal((await call("z".repeat(32), "p1")).status, 404, "wrong token");
  assert.equal((await call(TOKEN, "p2")).status, 404, "photo of another inspection");
  assert.equal((await call("short", "p1")).status, 404, "malformed token");
  assert.ok(find.mock.callCount() >= 3);
  assert.equal(f.calls.filter((c) => c.op === "sign").length, 1, "only the authorised request signed a URL");

  // Cross-tenant: la BD devuelve una foto cuyo path es de OTRO taller → no se firma.
  patchDb(t, "inspectionPhoto", "findFirst", (async () => ({ storagePath: "shopB/inspections/i9/x.jpg", inspectionItem: { inspection: { shopId: "shopA" } } })) as never);
  assert.equal((await call(TOKEN, "p1")).status, 404);
});

test("shared DVI report photo: shop without the plan no longer serves photos", async (t) => {
  withClient(t);
  const route = await import("../src/app/inspection/[token]/photo/[photoId]/route");
  patchDb(t, "inspectionPhoto", "findFirst", (async () => ({ storagePath: "shopA/inspections/i1/a.jpg", inspectionItem: { inspection: { shopId: "shopA" } } })) as never);
  mockSubscription(t, "CORE");
  const res = await route.GET(new Request("http://x"), { params: Promise.resolve({ token: "t".repeat(32), photoId: "p1" }) });
  assert.equal(res.status, 404);
});

// ── Migración ──────────────────────────────────────────────────────────────
test("legacy URL rewrite: only public assets move; private paths and other hosts are never rewritten", () => {
  const base = "https://x.supabase.co/storage/v1/object/public/accounting/";
  assert.deepEqual(rewriteLegacyPublicAssetUrl(`${base}logos/s1/logo.png?t=123`), {
    from: `${base}logos/s1/logo.png?t=123`,
    to: "https://x.supabase.co/storage/v1/object/public/public-assets/logos/s1/logo.png?t=123",
    path: "logos/s1/logo.png",
  });
  assert.ok(rewriteLegacyPublicAssetUrl(`${base}booking-page/s1/cover-1.webp`));
  for (const u of [`${base}s1/invoice-share/t.pdf`, `${base}logos/../s1/x`, "https://x.supabase.co/storage/v1/object/public/public-assets/logos/a", "https://evil.example/logo.png", null, 5]) {
    assert.equal(rewriteLegacyPublicAssetUrl(u), null, String(u));
  }
});

// ── Guardas de código: nadie más puede generar URLs públicas ───────────────
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}
test("codebase guard: getPublicUrl only in storage.ts, no legacy public-URL helpers, no public/accounting URLs", () => {
  for (const file of walk("src")) {
    const src = readFileSync(file, "utf8");
    if (!file.endsWith("lib/storage.ts")) {
      assert.doesNotMatch(src, /getPublicUrl\s*\(/, `${file} builds a public URL directly`);
    }
    assert.doesNotMatch(src, /publicUrlForStoragePath|uploadToStorage\b|downloadFromStorage\b|ensureAccountingBucket|ACCOUNTING_BUCKET/, `${file} uses a removed unsafe helper`);
    if (!file.endsWith("lib/storage-paths.ts")) assert.doesNotMatch(src, /object\/public\/accounting/, `${file} references the old public bucket`);
  }
  const storageSrc = readFileSync("src/lib/storage.ts", "utf8");
  assert.equal((storageSrc.match(/getPublicUrl\(/g) ?? []).length, 1, "single public-URL site, guarded by isPublicAssetPath");
});
