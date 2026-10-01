// Disposable Wave 1 QA infrastructure. No production connections or provider credentials.
// Install optional QA packages outside the repository, then set GARAGEOS_QA_PACKAGES.
// npm install --prefix <temporary-directory> @electric-sql/pglite@0.5.8 @electric-sql/pglite-socket@0.2.11
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packages = process.env.GARAGEOS_QA_PACKAGES;
if (!packages) throw new Error("Set GARAGEOS_QA_PACKAGES to the temporary QA package directory.");
const qaRequire = createRequire(path.join(packages, "package.json"));
const { PGlite } = qaRequire("@electric-sql/pglite");
const { PGLiteSocketServer } = qaRequire("@electric-sql/pglite-socket");
const requireRepo = createRequire(path.join(repo, "package.json"));
const bcrypt = requireRepo("bcryptjs");
const database = await PGlite.create();
const migrations = readdirSync(path.join(repo, "prisma/migrations"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
for (const migration of migrations) await database.exec(readFileSync(path.join(repo, "prisma/migrations", migration, "migration.sql"), "utf8").replace(/^\uFEFF/, ""));
console.log(`[wave1-qa] Applied all ${migrations.length} migrations to disposable local database.`);

// Exercise actual foreign keys/uniqueness, including deleting a converted SalesDemo.
await database.query(`INSERT INTO garageos."Shop" (id,name) VALUES ('qa-shop','QA')`);
const hash = await bcrypt.hash("qa-password-local-only", 10);
await database.query(`INSERT INTO garageos."User" (id,name,email,"passwordHash",role,"emailVerified","preferredLocale") VALUES ('qa-sales','QA Sales','sales@example.test',$1,'SUPER_ADMIN',now(),'FR')`, [hash]);
await database.query(`INSERT INTO garageos."SalesDemo" (id,"shopId","createdByUserId","expiresAt","updatedAt",status) VALUES ('qa-converted','qa-shop','qa-sales',now()+interval '30 days',now(),'CONVERTED')`);
await assert.rejects(database.query(`DELETE FROM garageos."Shop" WHERE id='qa-shop'`), /foreign key/);
await assert.rejects(database.query(`INSERT INTO garageos."SalesDemo" (id,"shopId","createdByUserId","expiresAt","updatedAt") VALUES ('qa-duplicate','qa-shop','qa-sales',now(),now())`), /unique/);
await database.query(`DELETE FROM garageos."SalesDemo" WHERE id='qa-converted'`);
assert.equal((await database.query(`SELECT id FROM garageos."Shop" WHERE id='qa-shop'`)).rows.length, 1);
await database.query(`DELETE FROM garageos."Shop" WHERE id='qa-shop'`);
await database.query(`INSERT INTO garageos."Shop" (id,name) VALUES ('qa-normal-shop','Normal onboarding shop')`);
await database.query(`INSERT INTO garageos."Subscription" (id,"shopId",status,"updatedAt") VALUES ('qa-normal-sub','qa-normal-shop','AWAITING_PLAN',now())`);
await database.query(`INSERT INTO garageos."User" (id,name,email,"passwordHash",role,"shopId","emailVerified","preferredLocale") VALUES ('qa-owner','Normal Owner','owner@example.test',$1,'OWNER','qa-normal-shop',now(),'EN')`, [hash]);
console.log("[wave1-qa] Foreign keys, uniqueness and converted-Shop preservation passed.");

const pgServer = new PGLiteSocketServer({ db: database, port: 55440, host: "127.0.0.1", maxConnections: 100 });
await pgServer.start();
const images = new Map();
const storage = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:55441");
  if (url.pathname === "/storage/v1/bucket") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify([{ name: "public-assets", public: true }])); return; }
  if (req.method === "POST" && url.pathname.startsWith("/storage/v1/object/public-assets/")) {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const key = url.pathname.replace("/storage/v1/object/", ""); images.set(key, { buffer: Buffer.concat(chunks), type: req.headers["content-type"] });
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ Key: key })); return;
  }
  if (url.pathname.startsWith("/storage/v1/object/public/")) {
    const image = images.get(url.pathname.replace("/storage/v1/object/public/", ""));
    if (image) { res.setHeader("Content-Type", image.type); res.end(image.buffer); return; }
  }
  res.statusCode = 404; res.end();
});
await new Promise((resolve) => storage.listen(55441, "127.0.0.1", resolve));

// Explicit values override Next's .env.local. Only a local DB and fake storage are reachable.
const env = { ...process.env,
  DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55440/postgres", DIRECT_URL: "postgresql://postgres:postgres@127.0.0.1:55440/postgres",
  AUTH_SECRET: "wave1-disposable-local-qa-secret-000000000000", NEXTAUTH_SECRET: "wave1-disposable-local-qa-secret-000000000000",
  AUTH_TRUST_HOST: "true", AUTH_URL: "http://localhost:3100", NEXTAUTH_URL: "http://localhost:3100", NEXT_PUBLIC_APP_URL: "http://localhost:3100",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55441", SUPABASE_SERVICE_ROLE_KEY: "local-fake-storage-only",
  PROVIDER_SIDE_EFFECTS: "disabled", STRIPE_TEST_MUTATIONS: "disabled", RUN_DB_STEPS: "", VERCEL_ENV: "development",
  NEXT_PUBLIC_PUSHER_KEY: "", PUSHER_APP_ID: "", PUSHER_KEY: "", PUSHER_SECRET: "", TWILIO_FROM_NUMBER: "",
  STRIPE_SECRET_KEY: "", RESEND_API_KEY: "", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "",
  GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", TELEGRAM_BOT_TOKEN: "", PLATFORM_ADMIN_EMAIL: "", PLATFORM_ADMIN_PASSWORD: "",
  GARAGEOS_LOCAL_QA: "1",
};
const child = spawn(process.execPath, [path.join(repo, "node_modules/next/dist/bin/next"), "dev", "--webpack", "-p", "3100"], { cwd: repo, env, stdio: "inherit" });
child.on("exit", () => process.exit());
// Local-only introspection/control endpoint for browser QA; never shipped with the app.
const control = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "POST" && req.url === "/expire") {
    await database.query(`UPDATE garageos."SalesDemo" SET "expiresAt"=now()-interval '1 second'`);
    res.end(JSON.stringify({ ok: true })); return;
  }
  if (req.method === "POST" && req.url === "/english") {
    await database.query(`UPDATE garageos."User" SET "preferredLocale"='EN' WHERE id='qa-sales'`);
    res.end(JSON.stringify({ ok: true })); return;
  }
  const demos = (await database.query(`SELECT d.*,s.name,s."logoUrl",s."bookingCoverImageUrl",s."bookingShopImageUrl",s."onboardingCompletedAt",s."communicationsSuspendedAt",sub.plan,sub.status AS "subscriptionStatus",sub."stripeCustomerId",sub."stripeSubscriptionId" FROM garageos."SalesDemo" d JOIN garageos."Shop" s ON s.id=d."shopId" JOIN garageos."Subscription" sub ON sub."shopId"=s.id`)).rows;
  res.end(JSON.stringify({ demos, storedImages: images.size }));
});
await new Promise((resolve) => control.listen(55442, "127.0.0.1", resolve));
console.log("[wave1-qa] UI http://localhost:3100; control http://127.0.0.1:55442 (local only).");
async function shutdown() { child.kill(); control.close(); storage.close(); await pgServer.stop(); await database.close(); process.exit(); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
