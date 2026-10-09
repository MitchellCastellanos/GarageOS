#!/usr/bin/env node
// One-off, credential-safe OUTBOUND check for sales email (no database, no app): verifies the sending domain at Resend and sends ONE
// clearly labelled test message, then polls its delivery status. Run it yourself where RESEND_API_KEY is available:
//
//   RESEND_API_KEY=re_xxx node scripts/sales-outbound-smoke.mjs \
//     --from "GarageOS Test <test@garage-os.ca>" --to mitchell.castellanos@hotmail.com [--reply-to replies+smoke@garage-os.ca] [--check-only]
//
// The key is read from the environment only and never printed. Exactly one recipient; no bulk. Not part of the app.
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
const key = process.env.RESEND_API_KEY;
if (!key) { console.error("RESEND_API_KEY is not set."); process.exit(2); }
const api = (path, init = {}) => fetch(`https://api.resend.com${path}`, { ...init, headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers ?? {}) } });

const dom = await api("/domains");
const dj = await dom.json().catch(() => ({}));
if (!dom.ok) { console.error(`Could not list domains (HTTP ${dom.status}): ${dj.message ?? "error"}`); process.exit(1); }
console.log("Resend domains:");
for (const d of dj.data ?? []) console.log(`  ${d.name}  status=${d.status}  sending=${d.capabilities?.sending ?? "?"}  receiving=${d.capabilities?.receiving ?? "?"}`);
if (process.argv.includes("--check-only")) process.exit(0);

const from = arg("from"), to = arg("to"), replyTo = arg("reply-to");
if (!from || !to || /[,;\s]/.test(to.trim())) { console.error('Usage: --from "Name <addr@verified-domain>" --to single@address [--reply-to addr]'); process.exit(2); }
const fromDomain = (/<([^>]+)>/.exec(from)?.[1] ?? from).split("@")[1]?.toLowerCase();
const known = (dj.data ?? []).find((d) => d.name.toLowerCase() === fromDomain);
if (!known || known.status !== "verified") { console.error(`Sender domain "${fromDomain}" is not verified in Resend. Nothing sent.`); process.exit(1); }

const stamp = new Date().toISOString();
const body = {
  from, to: [to.trim()], ...(replyTo ? { reply_to: replyTo } : {}),
  subject: `[GarageOS TEST] Sales outbound check ${stamp}`,
  text: `This is a clearly labelled TEST message from GarageOS (${stamp}).\nIt verifies that the sending domain, DKIM/SPF alignment and delivery work. No action is needed.\n\nIf you can see this, please also reply to it to test the reply path.`,
  html: `<p>This is a clearly labelled <b>TEST</b> message from GarageOS (${stamp}).</p><p>It verifies that the sending domain, DKIM/SPF alignment and delivery work. No action is needed.</p><p>If you can see this, please also <b>reply</b> to it to test the reply path.</p>`,
};
const sent = await api("/emails", { method: "POST", body: JSON.stringify(body), headers: { "idempotency-key": `smoke-${stamp}` } });
const sj = await sent.json().catch(() => ({}));
if (!sent.ok || !sj.id) { console.error(`Send failed (HTTP ${sent.status}): ${sj.name ?? ""} ${sj.message ?? ""}`); process.exit(1); }
console.log(`Accepted by Resend. Provider message id: ${sj.id}`);
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const g = await api(`/emails/${sj.id}`); const gj = await g.json().catch(() => ({}));
  console.log(`  status: ${gj.last_event ?? "unknown"}`);
  if (["delivered", "bounced", "complained", "delivery_delayed", "failed"].includes(gj.last_event)) break;
}
