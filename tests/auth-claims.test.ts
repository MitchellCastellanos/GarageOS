/* eslint-disable @typescript-eslint/no-explicit-any -- JWT / Prisma fixtures are loosely typed on purpose */
// Las autorizaciones del JWT (userId / shopId / role / impersonation) jamás se heredan de los claims: una firma
// válida solo prueba que alguien con el secreto emitió el token (otro entorno que lo comparta, una sesión anterior
// a un cambio de rol, un usuario ya borrado). Se derivan SIEMPRE de la DB de ESTE entorno; si el usuario no se
// puede validar aquí, no sobrevive ningún claim privilegiado y la sesión se destruye (falla cerrado).
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { patchDb } from "./helpers/db-mock";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00";
process.env.NEXTAUTH_SECRET = process.env.AUTH_SECRET;
process.env.AUTH_TRUST_HOST = "true";

const { authConfig, handlers } = await import("../src/lib/auth");
const jwtCb = authConfig.callbacks!.jwt! as (p: any) => Promise<any>;
const sessionCb = authConfig.callbacks!.session! as (p: any) => Promise<any>;

type DbUser = { id: string; shopId: string | null; role: string };
/** users: por id y por email (la consulta real es findUnique con uno u otro). */
function users(t: Parameters<typeof patchDb>[0], rows: (DbUser & { email?: string })[]) {
  const calls: any[] = [];
  patchDb(t, "user", "findUnique", (async ({ where }: any) => {
    calls.push(where);
    const r = rows.find((u) => (where.id ? u.id === where.id : u.email === where.email));
    return r ? { id: r.id, shopId: r.shopId, role: r.role } : null;
  }) as never);
  return calls;
}

const claims = (over: Record<string, unknown> = {}) => ({ name: "N", email: "n@example.test", userId: "u1", shopId: "shopA", role: "OWNER", ...over });
const FUTURE = Date.now() + 3_600_000;

test("Sales demo claims are revalidated against lifecycle, actor and Shop on every JWT request", async (t) => {
  users(t, [{ id: "root", shopId: null, role: "SUPER_ADMIN" }]);
  let demo: any = { id: "demo", shopId: "shopA", status: "ACTIVE", currentPlan: "PRO", expiresAt: new Date(FUTURE) };
  patchDb(t, "salesDemo", "findUnique", async () => demo);
  const impersonation = { salesDemoId: "demo", shopId: "shopA", shopName: "A", startedByUserId: "root", startedByName: "Sales", expiresAt: FUTURE };
  const run = (over = {}) => jwtCb({ token: claims({ userId: "root", impersonation: { ...impersonation, ...over } }) });
  assert.equal((await run()).impersonation.salesDemoId, "demo");
  assert.equal((await run({ shopId: "shopB" })).impersonation, undefined);
  assert.equal((await run({ startedByUserId: "owner" })).impersonation, undefined);
  for (const status of ["CONVERTED", "EXPIRED"]) {
    demo.status = status;
    const token = await run(); assert.equal(token.impersonation, undefined); assert.equal(token.role, "SUPER_ADMIN");
  }
  for (const status of ["ACTIVATION_SENT", "AWAITING_PAYMENT"]) { demo.status = status; assert.equal((await run()).impersonation.salesDemoId, "demo"); }
  demo.status = "ACTIVE"; demo.expiresAt = new Date(0);
  assert.equal((await run()).impersonation, undefined);
  demo = null; assert.equal((await run()).impersonation, undefined);
});

// ── Usuario no validable en este entorno ─────────────────────────────────────

test("signed token whose user does not exist in THIS environment's DB loses everything (session destroyed)", async (t) => {
  users(t, []); // p. ej. token emitido en otro entorno con el mismo NEXTAUTH_SECRET
  assert.equal(await jwtCb({ token: claims({ userId: "user-from-preview", role: "SUPER_ADMIN", shopId: "preview-shop" }) }), null);
});

test("stale SUPER_ADMIN claims cannot survive: unknown user → null; known user without the role → DB role wins", async (t) => {
  users(t, []);
  assert.equal(await jwtCb({ token: claims({ role: "SUPER_ADMIN", shopId: undefined }) }), null);

  users(t, [{ id: "u1", shopId: "shopA", role: "MECHANIC" }]);
  const token = await jwtCb({ token: claims({ role: "SUPER_ADMIN" }) });
  assert.equal(token.role, "MECHANIC", "privilege is whatever the DB says today");
  assert.notEqual(token.role, "SUPER_ADMIN");
});

test("a deleted user's still-valid cookie is rejected", async (t) => {
  users(t, [{ id: "u1", shopId: "shopA", role: "OWNER" }]);
  assert.ok(await jwtCb({ token: claims() }));
  users(t, []); // el usuario se borra después
  assert.equal(await jwtCb({ token: claims() }), null);
});

test("a token with no application identity at all (forged / empty claims) is rejected, not treated as anonymous-but-privileged", async (t) => {
  users(t, [{ id: "u1", shopId: "shopA", role: "OWNER" }]);
  assert.equal(await jwtCb({ token: { name: "x", email: "x@example.test", role: "SUPER_ADMIN", shopId: "shopA" } }), null, "no userId");
  assert.equal(await jwtCb({ token: { ...claims(), userId: "" } }), null, "empty userId");
  assert.equal(await jwtCb({ token: { ...claims(), userId: { $ne: null } } }), null, "non-string userId");
});

// ── Cambios en la DB se reflejan en cada request ─────────────────────────────

test("role changed in the DB is reflected on the next request", async (t) => {
  users(t, [{ id: "u1", shopId: "shopA", role: "OWNER" }]);
  assert.equal((await jwtCb({ token: claims({ role: "MECHANIC" }) })).role, "OWNER", "promotion");
  users(t, [{ id: "u1", shopId: "shopA", role: "VIEWER" }]);
  assert.equal((await jwtCb({ token: claims({ role: "OWNER" }) })).role, "VIEWER", "demotion");
});

test("shop changed (switchActiveShop / moved user) is reflected; a stale shopId never survives, even when the DB shopId is null", async (t) => {
  patchDb(t, "platformSalesStaff", "findUnique", async () => null);
  users(t, [{ id: "u1", shopId: "shopB", role: "OWNER" }]);
  assert.equal((await jwtCb({ token: claims({ shopId: "shopA" }) })).shopId, "shopB");
  users(t, [{ id: "u1", shopId: null, role: "OWNER" }]);
  assert.equal((await jwtCb({ token: claims({ shopId: "shopA" }) })).shopId, undefined, "no shop in the DB → no shop in the token");
});

test("claims supplied at sign-in by the provider/authorize() are ignored — the DB row decides", async (t) => {
  users(t, [{ id: "u1", shopId: "shopA", role: "MECHANIC", email: "n@example.test" }]);
  const token = await jwtCb({
    token: { name: "N", email: "n@example.test" },
    user: { id: "spoof", email: "n@example.test", role: "SUPER_ADMIN", shopId: "shopZ" },
  });
  assert.deepEqual([token.userId, token.role, token.shopId], ["u1", "MECHANIC", "shopA"]);
});

// ── Flujos legítimos preservados ─────────────────────────────────────────────

test("legitimate sign-in (credentials or returning Google user) resolves by email and works", async (t) => {
  const calls = users(t, [{ id: "u1", shopId: "shopA", role: "OWNER", email: "n@example.test" }]);
  const token = await jwtCb({ token: { name: "N", email: "n@example.test" }, user: { email: "n@example.test" } });
  assert.deepEqual([token.userId, token.shopId, token.role], ["u1", "shopA", "OWNER"]);
  assert.deepEqual(calls[0], { email: "n@example.test" });
  // Siguientes requests: por userId.
  const next = await jwtCb({ token });
  assert.deepEqual([next.userId, next.role], ["u1", "OWNER"]);
  assert.deepEqual(calls[1], { id: "u1" });
});

test("first-time Google signup: signIn creates Shop+OWNER, then jwt resolves the brand-new user by email", async (t) => {
  let created: any = null;
  patchDb(t, "user", "findUnique", (async ({ where }: any) => (created && where.email === created.email ? { id: created.id, shopId: created.shopId, role: created.role } : null)) as never);
  const tx = {
    shop: { create: async () => ({ id: "shop-new", name: "Taller de G" }) },
    user: { create: async ({ data }: any) => ((created = { id: "u-new", ...data }), created) },
    subscription: { create: async () => ({}) },
  };
  const { db } = await import("../src/lib/db");
  const original = db.$transaction;
  (db as any).$transaction = async (cb: any) => cb(tx);
  t.after(() => {
    (db as any).$transaction = original;
  });
  t.mock.method(console, "error", () => {});

  assert.equal(await authConfig.callbacks!.signIn!({ user: { email: "g@example.test", name: "G" }, account: { provider: "google" } } as never), true);
  const token = await jwtCb({ token: { email: "g@example.test" }, user: { email: "g@example.test", name: "G" } });
  assert.deepEqual([token.userId, token.shopId, token.role], ["u-new", "shop-new", "OWNER"]);
});

test("a sign-in for an email with no user row (e.g. signIn creation failed) yields no session", async (t) => {
  users(t, []);
  assert.equal(await jwtCb({ token: { email: "ghost@example.test" }, user: { email: "ghost@example.test" } }), null);
});

// ── Impersonación ────────────────────────────────────────────────────────────

const IMP = { shopId: "shopA", shopName: "A", expiresAt: FUTURE };

test("impersonation: only a SUPER_ADMIN present in the DB can start it; everyone else's update is ignored", async (t) => {
  users(t, [{ id: "root", shopId: null, role: "SUPER_ADMIN" }]);
  const ok = await jwtCb({ token: claims({ userId: "root", role: "SUPER_ADMIN", shopId: undefined }), trigger: "update", session: { impersonation: IMP } });
  assert.deepEqual(ok.impersonation, IMP);

  users(t, [{ id: "u1", shopId: "shopA", role: "OWNER" }]);
  const denied = await jwtCb({ token: claims(), trigger: "update", session: { impersonation: { ...IMP, shopId: "shopOther" } } });
  assert.equal(denied.impersonation, undefined, "an OWNER cannot 'login as' another shop");
});

test("a leftover/forged `impersonation` claim is dropped when the real user is not (or no longer) a SUPER_ADMIN", async (t) => {
  users(t, [{ id: "u1", shopId: "shopA", role: "OWNER" }]);
  const token = await jwtCb({ token: claims({ role: "SUPER_ADMIN", impersonation: IMP }) });
  assert.equal(token.impersonation, undefined);
  assert.equal(token.role, "OWNER");
  // Un SUPER_ADMIN vigente conserva su impersonación válida y se le limpia la vencida.
  users(t, [{ id: "root", shopId: null, role: "SUPER_ADMIN" }]);
  assert.deepEqual((await jwtCb({ token: claims({ userId: "root", role: "SUPER_ADMIN", impersonation: IMP }) })).impersonation, IMP);
  assert.equal((await jwtCb({ token: claims({ userId: "root", role: "SUPER_ADMIN", impersonation: { ...IMP, expiresAt: Date.now() - 1 } }) })).impersonation, undefined);
});

test("session callback exposes the DB-derived claims (and impersonation as OWNER of the target shop, for SUPER_ADMIN only)", async () => {
  const s = await sessionCb({ session: { user: {} }, token: { userId: "u1", shopId: "shopA", role: "OWNER" } });
  assert.deepEqual([s.user.id, s.user.shopId, s.user.role], ["u1", "shopA", "OWNER"]);
  const imp = await sessionCb({ session: { user: {} }, token: { userId: "root", role: "SUPER_ADMIN", impersonation: IMP } });
  assert.deepEqual([imp.user.shopId, imp.user.role], ["shopA", "OWNER"]);
});

// ── Extremo a extremo: Auth.js real, cookie firmada de verdad ────────────────

test("END TO END: a correctly SIGNED session cookie for a user that does not exist here yields NO session", async (t) => {
  const { encode } = await import("next-auth/jwt");
  users(t, []);
  const salt = "authjs.session-token";
  const cookie = await encode({ token: { sub: "x", ...claims({ userId: "ghost", role: "SUPER_ADMIN" }) } as any, secret: process.env.AUTH_SECRET!, salt });
  const res = await handlers.GET(new Request("http://localhost:3000/api/auth/session", { headers: { cookie: `${salt}=${cookie}` } }) as never);
  assert.equal(res.status, 200);
  assert.equal(await res.json(), null, "valid signature is not authorization");
});

test("END TO END: the same signed cookie for an existing user yields a session whose role comes from the DB", async (t) => {
  const { encode } = await import("next-auth/jwt");
  users(t, [{ id: "u1", shopId: "shopA", role: "MECHANIC" }]);
  const salt = "authjs.session-token";
  const cookie = await encode({ token: { sub: "x", ...claims({ userId: "u1", role: "SUPER_ADMIN" }) } as any, secret: process.env.AUTH_SECRET!, salt });
  const res = await handlers.GET(new Request("http://localhost:3000/api/auth/session", { headers: { cookie: `${salt}=${cookie}` } }) as never);
  const body: any = await res.json();
  assert.equal(body.user.role, "MECHANIC");
  assert.equal(body.user.id, "u1");
  assert.equal(body.user.shopId, "shopA");
});
