/* eslint-disable @typescript-eslint/no-explicit-any -- action results are loosely typed in assertions */
// Sales video attribution against a REAL PostgreSQL scratch database (all migrations applied). Skipped unless
// GARAGEOS_CRM_TEST_DB_URL points at a LOCAL database whose name contains replay|test|scratch:
//   GARAGEOS_CRM_TEST_DB_URL=postgresql://postgres:pg@127.0.0.1:5432/garageos_scratch_test npx tsx --test tests/sales-video-db.test.ts
import assert from "node:assert/strict";
import test from "node:test";

const URL_ = process.env.GARAGEOS_CRM_TEST_DB_URL;
let enabled = false;
try { if (URL_) { const u = new URL(URL_); enabled = ["localhost", "127.0.0.1"].includes(u.hostname) && /(replay|test|scratch)/i.test(u.pathname); } } catch { enabled = false; }

if (!enabled) {
  test("Sales video database suite (skipped: set GARAGEOS_CRM_TEST_DB_URL to a local scratch database)", { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = URL_!; process.env.DIRECT_URL = URL_!;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-00"; process.env.NEXTAUTH_SECRET = "test-secret-test-secret-test-secret-00";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";

  const { setSession } = await import("./helpers/action-harness");
  const { db } = await import("../src/lib/db");
  const inbox = await import("../src/actions/sales-inbox");
  const vid = await import("../src/lib/sales-video");
  const content = await import("../src/lib/sales-comms/content");
  const { loadEngagement } = await import("../src/lib/sales-crm/territory");
  const eventRoute = await import("../src/app/api/video/event/route");
  const ctaRoute = await import("../src/app/api/video/cta/route");

  const run = Date.now().toString(36);
  const HUMAN = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const BOT = "Mozilla/5.0 (compatible; Proofpoint URL Defense)";
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
  const as = (id: string | null) => setSession(id ? { user: { id, role: "VIEWER", shopId: null } } : null);
  const ids: Record<string, string> = {}; const staff: Record<string, string> = {}; const prospects: Record<string, string> = {};
  let ipN = 0;
  const post = async (body: unknown, ua = HUMAN) => eventRoute.POST(new Request("https://app.example.test/api/video/event", { method: "POST", body: JSON.stringify(body), headers: { "user-agent": ua, "x-forwarded-for": `10.9.${run.length}.${++ipN % 250}` } }));
  const cta = async (qs: string, ua = HUMAN) => ctaRoute.GET(new Request(`https://app.example.test/api/video/cta?${qs}`, { headers: { "user-agent": ua, "x-forwarded-for": `10.8.0.${++ipN % 250}` } }));
  const tokenOf = (url: string) => new URL(url).searchParams.get("t")!;
  const rows = (linkId: string) => db.crmVideoEvent.findMany({ where: { linkId } });
  const acts = (prospectId: string) => db.crmActivity.findMany({ where: { prospectId, type: "SYSTEM" }, orderBy: { occurredAt: "asc" } });

  async function makeStaff(name: string, role: "SALES_REP" | "SALES_MANAGER" = "SALES_REP", bookingEnabled = true) {
    const user = await db.user.create({ data: { name, email: `${name.toLowerCase()}-${run}@sales.test`, role: "VIEWER", shopId: null } });
    const s = await db.platformSalesStaff.create({ data: { userId: user.id, role, status: "ACTIVE", displayName: name, timezone: "America/Toronto", bookingEnabled, availability: { mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]], wed: [["09:00", "17:00"]], thu: [["09:00", "17:00"]], fri: [["09:00", "17:00"]] } } });
    staff[name] = s.id; ids[name] = user.id; return s;
  }
  async function makeProspect(name: string, ownerStaffId: string) {
    const p = await db.crmProspect.create({ data: { name: `${name} ${run}`, nameNormalized: `${name}-${run}`.toLowerCase(), assignedStaffId: ownerStaffId, preferredLanguage: "FR", createdByUserId: ids.root } });
    const email = `${name.toLowerCase()}-${run}@shop.test`;
    const c = await db.crmContact.create({ data: { prospectId: p.id, name: `Jean ${name}`, email, emailNormalized: email, isPrimary: true, preferredLanguage: "FR" } });
    prospects[name] = p.id; ids[`${name}Contact`] = c.id; return p;
  }
  const insert = async (who: string, prospect: string, kind = "commercial", language = "FR") => { as(ids[who]); return (await inbox.insertVideoLink(fd({ prospectId: prospects[prospect], contactId: ids[`${prospect}Contact`], kind, language }))) as any; };

  test("setup: super admin, two sellers, published videos", async () => {
    ids.root = (await db.user.create({ data: { name: "Root", email: `root-${run}@sales.test`, role: "SUPER_ADMIN" } })).id;
    await makeStaff("Alice"); await makeStaff("Bob"); await makeStaff("Nobooking", "SALES_REP", false);
    await makeProspect("Garage1", staff.Alice); await makeProspect("Garage2", staff.Bob); await makeProspect("Garage3", staff.Nobooking);
    for (const [key, language, secs] of [["commercial", "EN", 60], ["commercial", "FR", 60], ["teaser", "EN", 15]] as const) {
      await db.platformVideo.upsert({ where: { key_language: { key, language } }, create: { key, language, title: `GarageOS ${key} ${language} ${secs}`, url: `https://videos.garageos-test.ca/${key}-${language}.mp4`, thumbnailUrl: `https://app.example.test/video/thumb-${language.toLowerCase()}.jpg`, status: "PUBLISHED", publishedAt: new Date() }, update: { status: "PUBLISHED", title: `GarageOS ${key} ${language} ${secs}`, allowWebsite: true, allowOutreach: true, url: `https://videos.garageos-test.ca/${key}-${language}.mp4` } });
    }
    // teaser FR is deliberately NOT published
    await db.platformVideo.deleteMany({ where: { key: "teaser", language: "FR" } });
  });

  test("insert: a seller gets an opaque, re-used link for her OWN prospect only", async () => {
    const r = await insert("Alice", "Garage1");
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.match(r.url, /^https:\/\/app\.example\.test\/watch\/fr\?t=[A-Za-z0-9_-]{43}$/);
    assert.ok(!r.url.includes(prospects.Garage1) && !r.url.includes(`garage1-${run}`) && !/@/.test(r.url), "no ids, no email in the public URL");
    const again = await insert("Alice", "Garage1");
    assert.equal(again.url, r.url, "inserting twice re-uses the same link");
    assert.equal(await db.crmVideoLink.count({ where: { prospectId: prospects.Garage1 } }), 1);
    const teaser = await insert("Alice", "Garage1", "teaser", "EN");
    assert.match(teaser.url, /\/watch\/en\/teaser\?t=/);
    assert.equal(await db.crmVideoLink.count({ where: { prospectId: prospects.Garage1 } }), 2, "a different video/language is a different link");
    // tenant / ownership isolation
    const cross = await insert("Bob", "Garage1");
    assert.deepEqual([cross.ok, cross.error], [false, "NOT_FOUND"], "Bob cannot mint a link for Alice's prospect");
    const wrongContact: any = await (async () => { as(ids.Alice); return inbox.insertVideoLink(fd({ prospectId: prospects.Garage1, contactId: ids.Garage2Contact, kind: "commercial", language: "FR" })); })();
    assert.deepEqual([wrongContact.ok, wrongContact.error], [false, "NOT_FOUND"], "a contact of another prospect is refused");
    assert.equal(await db.crmVideoLink.count({ where: { prospectId: prospects.Garage2 } }), 0);
  });

  test("insert: only a PUBLISHED video, only for an authorised user", async () => {
    const none = await insert("Alice", "Garage1", "teaser", "FR");
    assert.deepEqual([none.ok, none.error], [false, "VIDEO_UNAVAILABLE"], "an unpublished video can never reach a prospect");
    await db.platformVideo.update({ where: { key_language: { key: "commercial", language: "EN" } }, data: { status: "DRAFT" } });
    assert.equal((await insert("Alice", "Garage1", "commercial", "EN")).error, "VIDEO_UNAVAILABLE");
    await db.platformVideo.update({ where: { key_language: { key: "commercial", language: "EN" } }, data: { status: "PUBLISHED" } });
    await db.platformVideo.update({ where: { key_language: { key: "commercial", language: "FR" } }, data: { allowOutreach: false } });
    assert.equal((await insert("Alice", "Garage1", "commercial", "FR")).error, "VIDEO_UNAVAILABLE", "outreach flag respected");
    await db.platformVideo.update({ where: { key_language: { key: "commercial", language: "FR" } }, data: { allowOutreach: true } });
    const owner = await db.user.create({ data: { name: "Owner", email: `owner-${run}@shop.test`, role: "OWNER" } });
    as(owner.id);
    await assert.rejects(() => inbox.insertVideoLink(fd({ prospectId: prospects.Garage1, contactId: "", kind: "commercial", language: "FR" })), /SALES_FORBIDDEN/, "a tenant owner is not sales staff");
    as(null);
    await assert.rejects(() => inbox.insertVideoLink(fd({ prospectId: prospects.Garage1, contactId: "", kind: "commercial", language: "FR" })), /SALES_FORBIDDEN/);
  });

  let token = ""; let linkId = "";
  test("resolution: opaque token, expiry, revocation, inactive seller", async () => {
    token = tokenOf((await insert("Alice", "Garage1")).url);
    const link = await vid.resolveVideoLink(token);
    assert.ok(link); linkId = link!.id;
    assert.equal(await vid.resolveVideoLink("short"), null);
    assert.equal(await vid.resolveVideoLink(`${token}x`.slice(0, 43).replace(/.$/, "Z")), null);
    await db.crmVideoLink.update({ where: { id: linkId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal(await vid.resolveVideoLink(token), null, "expired");
    await db.crmVideoLink.update({ where: { id: linkId }, data: { expiresAt: new Date(Date.now() + 86_400_000), revokedAt: new Date() } });
    assert.equal(await vid.resolveVideoLink(token), null, "revoked");
    await db.crmVideoLink.update({ where: { id: linkId }, data: { revokedAt: null } });
    await db.platformSalesStaff.update({ where: { id: staff.Alice }, data: { status: "INACTIVE" } });
    assert.equal(await vid.resolveVideoLink(token), null, "seller no longer active");
    await db.platformSalesStaff.update({ where: { id: staff.Alice }, data: { status: "ACTIVE" } });
    assert.ok(await vid.resolveVideoLink(token));
  });

  test("events: opening the link is not watching; bots and scanners record nothing", async () => {
    // A scanner/previewer, a prefetch and a malformed body: all 204, nothing written.
    assert.equal((await post({ t: token, v: "view-aaaaaaaaaaaa", e: "PLAY" }, BOT)).status, 204);
    const pre = await eventRoute.POST(new Request("https://app.example.test/api/video/event", { method: "POST", body: JSON.stringify({ t: token, v: "view-aaaaaaaaaaaa", e: "PAGE_VIEW" }), headers: { "user-agent": HUMAN, "sec-purpose": "prefetch" } }));
    assert.equal(pre.status, 204);
    assert.equal((await post("not json")).status, 204);
    assert.equal((await post({ t: "nope", v: "view-aaaaaaaaaaaa", e: "PAGE_VIEW" })).status, 204);
    assert.equal((await post({ t: token, v: "bad key!", e: "PAGE_VIEW" })).status, 204);
    assert.equal((await post({ t: token, v: "view-aaaaaaaaaaaa", e: "CTA_DEMO" })).status, 204, "the browser cannot report CTA events");
    assert.equal((await rows(linkId)).length, 0);
    assert.equal((await acts(prospects.Garage1)).length, 0);
    // A real page view: recorded once, one timeline entry; the same view again changes nothing.
    assert.equal((await post({ t: token, v: "view-aaaaaaaaaaaa", e: "PAGE_VIEW" })).status, 204);
    assert.equal((await post({ t: token, v: "view-aaaaaaaaaaaa", e: "PAGE_VIEW" })).status, 204);
    const r = await rows(linkId);
    assert.deepEqual(r.map((x) => [x.type, x.count]), [["PAGE_VIEW", 1]]);
    const a = await acts(prospects.Garage1);
    assert.equal(a.length, 1);
    assert.equal((a[0].metadata as any).event, "video_page_view");
    assert.equal(a[0].authorUserId, ids.Alice, "attributed to the seller who sent it");
    assert.equal(a[0].contactId, ids.Garage1Contact);
    // Opening the page is NOT a play: no PLAY row exists.
    assert.equal(r.some((x) => x.type === "PLAY"), false);
  });

  test("events: playback milestones need a real play and real time; skipped/forged progress is rejected", async () => {
    // A forged 75% with no PLAY
    await post({ t: token, v: "view-bbbbbbbbbbbb", e: "PROGRESS_75" });
    assert.equal((await rows(linkId)).some((x) => x.type === "PROGRESS_75"), false);
    await post({ t: token, v: "view-bbbbbbbbbbbb", e: "PLAY" });
    // Instant 75% / COMPLETE right after PLAY: too fast for a 60 s video.
    await post({ t: token, v: "view-bbbbbbbbbbbb", e: "PROGRESS_75" });
    await post({ t: token, v: "view-bbbbbbbbbbbb", e: "COMPLETE" });
    assert.deepEqual((await rows(linkId)).map((x) => x.type).sort(), ["PAGE_VIEW", "PLAY"]);
    // Time passes (we move the PLAY row back instead of sleeping): the milestones are now plausible.
    await db.crmVideoEvent.updateMany({ where: { linkId, type: "PLAY" }, data: { lastAt: new Date(Date.now() - 70_000), firstAt: new Date(Date.now() - 70_000) } });
    for (const e of ["PROGRESS_25", "PROGRESS_50", "PROGRESS_75", "COMPLETE"]) await post({ t: token, v: "view-bbbbbbbbbbbb", e });
    assert.deepEqual((await rows(linkId)).map((x) => x.type).sort(), ["COMPLETE", "PAGE_VIEW", "PLAY", "PROGRESS_25", "PROGRESS_50", "PROGRESS_75"]);
    // A milestone from a DIFFERENT page view than the PLAY is refused.
    await db.crmVideoEvent.deleteMany({ where: { linkId, type: "PROGRESS_50" } });
    await post({ t: token, v: "view-cccccccccccc", e: "PROGRESS_50" });
    assert.equal((await rows(linkId)).some((x) => x.type === "PROGRESS_50"), false);
    // Timeline: page view, play, 75 %, complete — 25/50 stay out of it.
    const events = (await acts(prospects.Garage1)).map((a) => (a.metadata as any).event);
    assert.deepEqual(events, ["video_page_view", "video_play", "video_progress_75", "video_complete"]);
    // A second page view of the same link counts as a second view but adds no new timeline entry.
    await db.crmVideoEvent.updateMany({ where: { linkId, type: "PAGE_VIEW" }, data: { lastAt: new Date(Date.now() - 60_000) } });
    await post({ t: token, v: "view-dddddddddddd", e: "PAGE_VIEW" });
    const pv = (await rows(linkId)).find((x) => x.type === "PAGE_VIEW")!;
    assert.equal(pv.count, 2);
    assert.equal((await acts(prospects.Garage1)).length, 4);
  });

  test("video events never count as a sales touch (territory rules unchanged)", async () => {
    const e = await loadEngagement(prospects.Garage1);
    assert.equal(e.touched, false);
  });

  test("CTA: humans are attributed and sent to the seller's own booking page; scanners are redirected unrecorded", async () => {
    const botRes = await cta(`cta=demo&t=${token}&lang=fr`, BOT);
    assert.equal(botRes.status, 302);
    assert.equal((await rows(linkId)).some((x) => x.type === "CTA_DEMO"), false);
    const res = await cta(`cta=demo&t=${token}&lang=fr`);
    assert.equal(res.status, 302);
    const loc = res.headers.get("location")!;
    assert.match(loc, /^https:\/\/app\.example\.test\/sales\/book\/[A-Za-z0-9_-]{32,64}\?lang=fr$/, "the EXISTING prospect booking flow");
    const bl = await db.crmBookingLink.findFirstOrThrow({ where: { prospectId: prospects.Garage1, staffId: staff.Alice, kind: "PROSPECT" } });
    assert.ok(loc.includes(bl.token));
    const ev = (await rows(linkId)).find((x) => x.type === "CTA_DEMO");
    assert.ok(ev);
    const a = (await acts(prospects.Garage1)).find((x) => (x.metadata as any).event === "video_cta_demo")!;
    assert.equal((a.metadata as any).afterWatching, true, "the demo CTA came after real playback");
    // trial CTA → existing get-started page; bad/expired token → public contact page; never an error, never an open redirect
    assert.equal((await cta(`cta=trial&t=${token}`)).headers.get("location"), "https://app.example.test/get-started");
    assert.equal((await cta(`cta=demo&t=garbage`)).headers.get("location"), "https://app.example.test/contact");
    assert.equal((await cta(`cta=demo`)).headers.get("location"), "https://app.example.test/contact");
    assert.equal((await cta(`cta=demo&t=${token}&to=https://evil.example`)).headers.get("location")!.startsWith("https://app.example.test/"), true);
  });

  test("CTA: a seller without online booking falls back to the public contact page", async () => {
    const t3 = tokenOf((await insert("Nobooking", "Garage3")).url);
    assert.equal((await cta(`cta=demo&t=${t3}`)).headers.get("location"), "https://app.example.test/contact");
  });

  test("do-not-contact prospects: nothing is recorded", async () => {
    const t3 = tokenOf((await insert("Nobooking", "Garage3")).url);
    const l3 = await db.crmVideoLink.findUniqueOrThrow({ where: { token: t3 } });
    const before = (await rows(l3.id)).length;
    await db.crmProspect.update({ where: { id: prospects.Garage3 }, data: { doNotContact: true } });
    await post({ t: t3, v: "view-eeeeeeeeeeee", e: "PAGE_VIEW" });
    assert.equal((await rows(l3.id)).length, before, "nothing new is recorded for a do-not-contact prospect");
    assert.equal((await cta(`cta=trial&t=${t3}`)).status, 302, "the visitor can still use the page and its buttons");
  });

  test("an unsubscribed (suppressed) address is not measured", async () => {
    const t2 = tokenOf((await insert("Bob", "Garage2")).url);
    const l2 = await db.crmVideoLink.findUniqueOrThrow({ where: { token: t2 } });
    const email = `garage2-${run}@shop.test`;
    await db.crmEmailSuppression.create({ data: { emailNormalized: email, reason: "UNSUBSCRIBE", source: "test" } });
    await post({ t: t2, v: "view-gggggggggggg", e: "PAGE_VIEW" });
    assert.equal((await rows(l2.id)).length, 0, "no event for a suppressed address");
    await db.crmEmailSuppression.updateMany({ where: { emailNormalized: email }, data: { liftedAt: new Date() } });
    await post({ t: t2, v: "view-gggggggggggg", e: "PAGE_VIEW" });
    assert.equal((await rows(l2.id)).length, 1, "measurement resumes only when the suppression is lifted");
  });

  test("a fake reaching the tracking endpoint never breaks it (always 204), and the per-link counter is capped", async () => {
    const l = await db.crmVideoEvent.findFirstOrThrow({ where: { linkId, type: "PAGE_VIEW" } });
    await db.crmVideoEvent.update({ where: { id: l.id }, data: { count: 500, lastAt: new Date(Date.now() - 60_000) } });
    assert.equal((await post({ t: token, v: "view-ffffffffffff", e: "PAGE_VIEW" })).status, 204);
    assert.equal((await db.crmVideoEvent.findUniqueOrThrow({ where: { id: l.id } })).count, 500);
  });

  test("message attribution and CRM summary", async () => {
    const messageId = `msg-${run}`;
    await vid.linkMessageToVideos(messageId, `Hello ${(await insert("Alice", "Garage1")).url} and more`);
    await vid.linkMessageToVideos(messageId, "no link here");
    assert.equal(await db.crmVideoLinkMessage.count({ where: { messageId } }), 1);
    const s = await vid.videoSummaryForProspect(prospects.Garage1);
    const commercialFr = s.find((x) => x.kind === "commercial" && x.language === "FR")!;
    assert.equal(commercialFr.progress, "complete");
    assert.equal(commercialFr.cta, true);
    assert.equal(s.filter((x) => x.kind === "commercial" && x.language === "FR").length, 1, "re-issued links are merged into one row");
    assert.equal(s.find((x) => x.kind === "teaser" && x.language === "EN")!.progress, "none", "sent, never opened");
    const s2 = await vid.videoSummaryForProspect(prospects.Garage2);
    assert.deepEqual(s2.map((x) => [x.kind, x.language, x.progress]), [["commercial", "FR", "viewed"]], "another prospect's summary only has its own link and progress (never Alice's completed view)");
  });

  test("email content: the tracked link becomes a linked approved thumbnail only when the video is published", async () => {
    const url = (await insert("Alice", "Garage1")).url;
    const input = { subject: "Aperçu", bodyText: `Bonjour,\n${url}\nMerci`, language: "FR" as const, commercial: true, unsubscribeUrl: "https://app.example.test/sales/unsubscribe/x",
      identity: { staffId: staff.Alice, fromName: "Alice T.", fromEmail: "alice@sales.test.ca", jobTitle: "Représentante", phone: null },
      settings: { legalName: "GarageOS Inc.", mailingAddress: "1 rue Exemple", contactEmail: null, contactPhone: null, websiteUrl: "https://www.garage-os.ca" } };
    const built = await content.buildContent(input);
    assert.match(built.html, /<a[^>]+href="[^"]*\/watch\/fr\?t=[^"]+"[^>]*><img[^>]+src="https:\/\/app\.example\.test\/video\/email-fr\.jpg"/);
    assert.match(built.html, /Regarder la vidéo de 60 secondes/);
    assert.equal((built.html.match(/\/watch\/fr\?t=/g) ?? []).length, 2, "only the thumbnail block carries the link (image + button); the bare URL line is not repeated above it");
    const inline = await content.buildContent({ ...input, bodyText: `Regardez ${url} quand vous voulez.` });
    assert.ok((inline.html.match(/\/watch\/fr\?t=/g) ?? []).length >= 3, "a URL inside a sentence stays");
    assert.match(built.html, /Alice T\./, "the seller's own signature");
    assert.match(built.html, /Se désabonner/);
    assert.doesNotMatch(built.html, /\.mp4|<video/i);
    assert.ok(built.text.includes(url), "plain-text part keeps the link");
    await db.platformVideo.update({ where: { key_language: { key: "commercial", language: "FR" } }, data: { status: "DRAFT" } });
    const unpublished = await content.buildContent(input);
    assert.doesNotMatch(unpublished.html, /email-fr\.jpg/, "no dead thumbnail when the video was unpublished after insertion");
    await db.platformVideo.update({ where: { key_language: { key: "commercial", language: "FR" } }, data: { status: "PUBLISHED" } });
  });

  test("template variable {{video.link}} resolves to the tracked link for the recipient (and stays empty when nothing is published)", async () => {
    const { withVideoVars } = await import("../src/lib/sales-comms/templates");
    const v = await withVideoVars({}, "FR", { staffId: staff.Alice, userId: ids.Alice, prospectId: prospects.Garage1, contactId: ids.Garage1Contact });
    assert.match(String(v["video.link"]), /\/watch\/fr\?t=/);
    assert.match(String(v["video.cta"]), /GarageOS commercial FR/);
    await db.platformVideo.updateMany({ where: { key: "commercial", language: "FR" }, data: { status: "DRAFT" } });
    const none = await withVideoVars({}, "FR", { staffId: staff.Alice, userId: ids.Alice, prospectId: prospects.Garage1, contactId: ids.Garage1Contact });
    assert.equal(none["video.link"], undefined);
    await db.platformVideo.updateMany({ where: { key: "commercial", language: "FR" }, data: { status: "PUBLISHED" } });
  });
}
