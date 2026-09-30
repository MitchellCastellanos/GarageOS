import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyLegacyReference, runStoragePrivacyMigration, type MigrationDb } from "../src/lib/storage-migration";

// Datos con el formato EXACTO observado en Production (ids/tamaños reales; host ficticio).
const SHOP1 = "cmtxolncy000004jpmkkzxz5i";
const SHOP2 = "cmumna948000004jj4xz5hme5";
const LOGO1 = `logos/${SHOP1}/logo.png`;
const LOGO2 = `logos/${SHOP2}/logo.png`;
const HOST = "https://abcdefghijklmnop.supabase.co/storage/v1/object/public";
const LEGACY1 = `${HOST}/accounting/${LOGO1}?t=1789000000001`;
const LEGACY2 = `${HOST}/accounting/${LOGO2}?t=1789000000002`;
const PRIV = [
  `${SHOP1}/invoice-share/tokA.pdf`, `${SHOP1}/invoice-share/tokB.pdf`, `${SHOP1}/invoice-share/tokC.pdf`,
];

function fakeWorld(opts: { publicBucketExists?: boolean } = {}) {
  const buckets = new Map<string, { public: boolean; objects: Map<string, Buffer> }>();
  buckets.set("accounting", { public: true, objects: new Map() });
  if (opts.publicBucketExists !== false) buckets.set("public-assets", { public: true, objects: new Map() });
  const acc = buckets.get("accounting")!.objects;
  acc.set(LOGO1, Buffer.alloc(1727815, 1));
  acc.set(LOGO2, Buffer.alloc(1727815, 2));
  PRIV.forEach((p, i) => acc.set(p, Buffer.alloc(1000 + i, 3)));
  const removed: string[] = [];

  const sb = {
    storage: {
      listBuckets: async () => ({ data: [...buckets].map(([name, b]) => ({ name, public: b.public })), error: null }),
      createBucket: async (name: string, o: { public: boolean }) => { buckets.set(name, { public: o.public, objects: new Map() }); return { error: null }; },
      updateBucket: async (name: string, o: { public: boolean }) => { buckets.get(name)!.public = o.public; return { error: null }; },
      from: (name: string) => {
        const b = () => buckets.get(name)!;
        return {
          list: async (prefix: string) => {
            const seen = new Map<string, { name: string; id: string | null; metadata: { size: number } | null }>();
            for (const [p, buf] of b().objects) {
              if (prefix && !p.startsWith(`${prefix}/`)) continue;
              const rest = prefix ? p.slice(prefix.length + 1) : p;
              const [head, ...tail] = rest.split("/");
              seen.set(head, tail.length ? { name: head, id: null, metadata: null } : { name: head, id: p, metadata: { size: buf.length } });
            }
            return { data: [...seen.values()], error: null };
          },
          download: async (p: string) => (b().objects.has(p) ? { data: new Blob([new Uint8Array(b().objects.get(p)!)]), error: null } : { data: null, error: { message: "not found" } }),
          upload: async (p: string, buf: Buffer) => { b().objects.set(p, Buffer.from(buf)); return { error: null }; },
          remove: async (paths: string[]) => { paths.forEach((p) => b().objects.delete(p)); removed.push(...paths); return { error: null }; },
        };
      },
    },
  } as unknown as SupabaseClient;

  const shops = [
    { id: SHOP1, logoUrl: LEGACY1, bookingCoverImageUrl: null, bookingShopImageUrl: null },
    { id: SHOP2, logoUrl: LEGACY2, bookingCoverImageUrl: null, bookingShopImageUrl: null },
  ] as Array<{ id: string } & Record<"logoUrl" | "bookingCoverImageUrl" | "bookingShopImageUrl", string | null>>;
  const invoices = PRIV.map((p, i) => ({ id: `inv${i}`, shopId: SHOP1, pdfUrl: null as string | null, clientPackagePath: p }));
  const writes: string[] = [];
  const db: MigrationDb = {
    shop: {
      findMany: async () => shops.map((s) => ({ ...s })),
      update: async ({ where, data }) => { writes.push(`shop:${where.id}`); Object.assign(shops.find((s) => s.id === where.id)!, data); return {}; },
      count: async ({ where }) => shops.filter((s) => where.OR.some((c) => { const [f, cond] = Object.entries(c)[0]; return ((s as Record<string, string | null>)[f] ?? "").includes(cond.contains); })).length,
    },
    invoice: {
      findMany: async (args) => (JSON.stringify(args).includes("pdfUrl") ? invoices.filter((i) => (i.pdfUrl ?? "").includes("/storage/v1/object/public/")) : invoices.filter((i) => i.clientPackagePath)),
      update: async ({ where, data }) => { writes.push(`invoice:${where.id}`); invoices.find((i) => i.id === where.id)!.pdfUrl = data.pdfUrl; return {}; },
    },
    accountingDocument: { findMany: async () => [] },
    inspectionPhoto: { findMany: async () => [] },
    invoicePaymentEntry: { findMany: async () => [] },
  };
  return { sb, db, shops, buckets, removed, writes };
}

const run = (w: ReturnType<typeof fakeWorld>, o: Partial<{ apply: boolean; finalize: boolean; deletePublicCopies: boolean }> = {}) =>
  runStoragePrivacyMigration(w.sb, w.db, { apply: false, finalize: false, deletePublicCopies: false, ...o });

test("classify: exact legacy URL format from Production", () => {
  const src = new Map([[LOGO1, 1727815]]);
  const empty = new Map<string, number>();
  const c = classifyLegacyReference(SHOP1, LEGACY1, src, empty);
  assert.deepEqual(c, { action: "copy", path: LOGO1, to: `${HOST}/public-assets/${LOGO1}?t=1789000000001` });
  assert.equal(classifyLegacyReference(SHOP1, LEGACY1, src, new Map([[LOGO1, 1727815]])).action, "rewrite");
  assert.equal(classifyLegacyReference(SHOP1, LEGACY1, src, new Map([[LOGO1, 5]])).action, "copy", "partial/corrupt destination is re-copied");
  assert.equal(classifyLegacyReference(SHOP1, LEGACY1, empty, empty).action, "source-missing");
  assert.equal(classifyLegacyReference(SHOP2, LEGACY1, src, empty).action, "ownership-mismatch", "another shop's logo path");
  assert.equal(classifyLegacyReference(SHOP1.slice(0, 10), LEGACY1, src, empty).action, "ownership-mismatch", "id prefix is not a match");
  assert.equal(classifyLegacyReference(SHOP1, `${HOST}/public-assets/${LOGO1}`, src, empty).action, "skip", "already migrated");
  assert.equal(classifyLegacyReference(SHOP1, `${HOST}/accounting/${PRIV[0]}`, src, empty).action, "skip", "private paths are never rewritten");
  assert.equal(classifyLegacyReference(SHOP1, null, src, empty).action, "skip");
});

test("dry-run: the 2 logos are PLANNED (not unresolved), nothing is written, finalize is reported as blocked", async () => {
  const w = fakeWorld();
  const r = await run(w, { finalize: true });
  assert.equal(r.publicObjects, 2);
  assert.equal(r.privateObjects, 3);
  assert.equal(r.planned, 2);
  assert.equal(r.unresolved, 0, "a dry-run copy is not an unresolved reference");
  assert.equal(r.stillPublicRefs, 2);
  assert.equal(r.missingPrivateRefs, 0);
  assert.equal(r.rewritten, 0);
  assert.deepEqual(w.writes, []);
  assert.equal(w.buckets.get("public-assets")!.objects.size, 0);
  assert.equal(w.buckets.get("accounting")!.public, true, "dry-run --finalize never changes visibility");
});

test("apply: copies both logos verified, rewrites DB, keeps the 3 private objects, deletes nothing", async () => {
  const w = fakeWorld();
  const r = await run(w, { apply: true });
  assert.equal(r.rewritten, 2);
  assert.equal(r.unresolved, 0);
  assert.equal(r.stillPublicRefs, 0);
  const pub = w.buckets.get("public-assets")!.objects;
  assert.deepEqual([...pub.keys()].sort(), [LOGO1, LOGO2].sort());
  assert.equal(pub.get(LOGO1)!.length, 1727815);
  assert.equal(w.shops[0].logoUrl, `${HOST}/public-assets/${LOGO1}?t=1789000000001`);
  assert.equal(w.shops[1].logoUrl, `${HOST}/public-assets/${LOGO2}?t=1789000000002`);
  assert.equal(w.buckets.get("accounting")!.objects.size, 5, "originals untouched");
  assert.deepEqual(w.removed, []);
  assert.equal(w.buckets.get("accounting")!.public, true, "not finalized yet");
});

test("second dry-run after apply is clean and idempotent; then finalize makes accounting private", async () => {
  const w = fakeWorld();
  await run(w, { apply: true });
  const writesBefore = w.writes.length;
  const again = await run(w, { finalize: true });
  assert.equal(again.planned, 0);
  assert.equal(again.unresolved, 0);
  assert.equal(again.stillPublicRefs, 0);
  assert.equal(w.writes.length, writesBefore);
  // re-apply es no-op
  assert.equal((await run(w, { apply: true })).rewritten, 0);
  const fin = await run(w, { apply: true, finalize: true });
  assert.equal(fin.bucketMadePrivate, true);
  assert.equal(w.buckets.get("accounting")!.public, false);
  assert.equal(w.buckets.get("public-assets")!.public, true);
  assert.equal(w.buckets.get("accounting")!.objects.size, 5, "no deletion of old public copies");
  assert.deepEqual(w.removed, []);
});

test("one-shot --apply --finalize works from the initial state", async () => {
  const w = fakeWorld({ publicBucketExists: false });
  const fin = await run(w, { apply: true, finalize: true });
  assert.equal(fin.bucketMadePrivate, true);
  assert.equal(w.buckets.get("public-assets")!.public, true);
  assert.equal(w.buckets.get("public-assets")!.objects.size, 2);
});

test("finalize is refused while a public reference cannot be resolved (missing source) and nothing is deleted", async () => {
  const w = fakeWorld();
  w.buckets.get("accounting")!.objects.delete(LOGO2); // el objeto del logo 2 no existe
  const r = await run(w, { apply: true });
  assert.equal(r.unresolved, 1);
  assert.equal(r.stillPublicRefs, 1);
  await assert.rejects(run(w, { apply: true, finalize: true }), /refusing to finalize/);
  assert.equal(w.buckets.get("accounting")!.public, true);
  assert.equal(w.shops[1].logoUrl, LEGACY2, "unresolved reference left untouched");
});

test("a shop pointing at another shop's logo path is never rewritten", async () => {
  const w = fakeWorld();
  w.shops[1].logoUrl = LEGACY1;
  const r = await run(w, { apply: true });
  assert.equal(r.unresolved, 1);
  assert.equal(w.shops[1].logoUrl, LEGACY1);
});

test("--delete-public-copies requires apply and no remaining public refs; removes only verified copies", async () => {
  const w = fakeWorld();
  await assert.rejects(run(w, { deletePublicCopies: true }), /needs --apply/);
  await run(w, { apply: true });
  const r = await run(w, { apply: true, deletePublicCopies: true });
  assert.equal(r.removedCopies, 2);
  assert.deepEqual([...w.buckets.get("accounting")!.objects.keys()].sort(), [...PRIV].sort());
});
