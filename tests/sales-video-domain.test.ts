// Pure rules of the sales-video feature: stable URLs, who is NOT a viewer, what counts as "watched", event plausibility,
// and the email block that carries the video (a linked thumbnail, never the MP4).
import assert from "node:assert/strict";
import test from "node:test";
import { render } from "@react-email/render";
import React from "react";
import {
  CLIENT_EVENT_TYPES, WatchTracker, decideClientEvent, extractWatchLinks, furthestProgress, isClientEventType, isLikelyBot, isPrefetchRequest,
  linkIsUsable, watchPath, watchUrl, VIDEO_TOKEN_RE, VIEW_KEY_RE, type PriorEvent,
} from "../src/domain/sales-video";
import { SalesEmail } from "../src/emails/SalesEmail";

const APP = "https://www.garage-os.ca";
const TOKEN = "A".repeat(43);

test("stable, language-specific URLs", () => {
  assert.equal(watchPath("EN"), "/watch/en");
  assert.equal(watchPath("FR"), "/watch/fr");
  assert.equal(watchPath("FR", "teaser"), "/watch/fr/teaser");
  assert.equal(watchUrl(`${APP}/`, "EN", "commercial", TOKEN), `${APP}/watch/en?t=${TOKEN}`);
  assert.equal(watchUrl(APP, "FR", "teaser"), `${APP}/watch/fr/teaser`);
});

test("extractWatchLinks finds attributed links in an email body, in order, once each", () => {
  const body = `Bonjour,\nVoici : ${APP}/watch/fr?t=${TOKEN}\nEt l'aperçu ${APP}/watch/en/teaser?t=${"B".repeat(43)}\nRappel ${APP}/watch/fr?t=${TOKEN}\n${APP}/watch/de?t=${TOKEN} ${APP}/watch/en`;
  const f = extractWatchLinks(body, APP);
  assert.deepEqual(f.map((x) => [x.lang, x.kind]), [["FR", "commercial"], ["EN", "teaser"]]);
  assert.equal(f[0].token, TOKEN);
  assert.equal(extractWatchLinks(`${APP}/watch/en?t=short`, APP).length, 0, "a short/forged token is not a link");
  assert.equal(extractWatchLinks(`https://evil.example/watch/en?t=${TOKEN}`, APP).length, 0, "only our own origin");
});

test("tokens and view keys have a strict shape", () => {
  assert.ok(VIDEO_TOKEN_RE.test(TOKEN));
  assert.ok(!VIDEO_TOKEN_RE.test("short") && !VIDEO_TOKEN_RE.test(`${TOKEN}!`) && !VIDEO_TOKEN_RE.test(""));
  assert.ok(VIEW_KEY_RE.test("abcDEF123456_-xy"));
  assert.ok(!VIEW_KEY_RE.test("a b") && !VIEW_KEY_RE.test("x"));
});

test("mail scanners, link previewers and prefetchers are not viewers", () => {
  for (const ua of ["", "x", "Mozilla/5.0 (compatible; Proofpoint)", "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 HeadlessChrome/120", "Slackbot-LinkExpanding 1.0", "WhatsApp/2.23", "Microsoft Office SafeLinks Protection", "curl/8.1.2", "python-requests/2.31", "Mozilla/5.0 (compatible; Googlebot/2.1)", "facebookexternalhit/1.1", "Barracuda Sentinel"]) assert.equal(isLikelyBot(ua), true, ua);
  for (const ua of ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0"]) assert.equal(isLikelyBot(ua), false, ua);
  assert.equal(isPrefetchRequest(new Headers({ "sec-purpose": "prefetch;prerender" })), true);
  assert.equal(isPrefetchRequest(new Headers({ purpose: "prefetch" })), true);
  assert.equal(isPrefetchRequest(new Headers({ "x-moz": "prefetch" })), true);
  assert.equal(isPrefetchRequest(new Headers({ accept: "text/html" })), false);
});

test("the client may only report playback events; CTA events are server-side", () => {
  assert.deepEqual([...CLIENT_EVENT_TYPES], ["PAGE_VIEW", "PLAY", "PROGRESS_25", "PROGRESS_50", "PROGRESS_75", "COMPLETE"]);
  assert.equal(isClientEventType("CTA_DEMO"), false);
  assert.equal(isClientEventType("PLAY"), true);
});

// ── WatchTracker: only continuous playback counts ────────────────────────────────────────────────────────────────
function playThrough(t: WatchTracker, from: number, to: number, step = 0.25) { const out: string[] = []; for (let x = from; x <= to; x += step) out.push(...t.onTime(x).events); return out; }

test("normal playback emits PLAY then 25/50/75 then COMPLETE once each", () => {
  const t = new WatchTracker(60);
  const ev = [...t.onPlay().events, ...playThrough(t, 0, 60), ...t.onEnded().events];
  assert.deepEqual(ev, ["PLAY", "PROGRESS_25", "PROGRESS_50", "PROGRESS_75", "COMPLETE"]);
  assert.deepEqual(t.onPlay().events, [], "PLAY is only reported once");
  assert.deepEqual(t.onEnded().events, [], "COMPLETE only once");
});

test("dragging the bar to the end does not count as watching", () => {
  const t = new WatchTracker(60);
  t.onPlay(); t.onTime(0.5); t.onTime(1);
  t.onSeek(); t.onTime(59);            // jump to the end
  const rest = [...t.onTime(59.5).events, ...t.onTime(60).events, ...t.onEnded().events];
  assert.deepEqual(rest, [], "no milestone and no COMPLETE from a skip");
  assert.ok(t.watchedSeconds < 3);
});

test("pausing and seeking back does not double count; time updates without PLAY count for nothing", () => {
  const cold = new WatchTracker(15);
  assert.deepEqual(playThrough(cold, 0, 15), [], "no PLAY, no milestones (autoplay-less pages cannot fake watching)");
  const t = new WatchTracker(15);
  t.onPlay(); playThrough(t, 0, 4); t.onPause(); t.onSeek(); t.onTime(0); // rewatch from 0
  const again = playThrough(t, 0.25, 4);
  assert.ok(t.watchedSeconds > 7 && t.watchedSeconds < 9, `rewatching adds real time only (${t.watchedSeconds})`);
  assert.ok(!again.includes("COMPLETE"));
});

test("ended before 90% watched is not COMPLETE", () => {
  const t = new WatchTracker(60);
  t.onPlay(); playThrough(t, 0, 40);
  assert.deepEqual(t.onEnded().events, []);
});

// ── Server plausibility ───────────────────────────────────────────────────────────────────────────────────────────
const at = (s: number) => new Date(Date.UTC(2026, 9, 11, 12, 0, s));
const prior = (type: PriorEvent["type"], view: string, secs: number): PriorEvent => ({ type, firstAt: at(secs), lastAt: at(secs), lastViewKey: view });

test("a milestone needs a PLAY from the same page view and enough real time", () => {
  const base = { videoSeconds: 60 };
  assert.deepEqual(decideClientEvent({ ...base, type: "PROGRESS_25", viewKey: "v1", now: at(30), prior: [] }), { accept: false, reason: "NEEDS_PLAY" });
  assert.deepEqual(decideClientEvent({ ...base, type: "PROGRESS_25", viewKey: "v2", now: at(30), prior: [prior("PLAY", "v1", 0)] }), { accept: false, reason: "NEEDS_PLAY" });
  assert.deepEqual(decideClientEvent({ ...base, type: "PROGRESS_75", viewKey: "v1", now: at(3), prior: [prior("PLAY", "v1", 0)] }), { accept: false, reason: "TOO_FAST" }, "75% 3 s after play is forged");
  assert.deepEqual(decideClientEvent({ ...base, type: "COMPLETE", viewKey: "v1", now: at(20), prior: [prior("PLAY", "v1", 0)] }), { accept: false, reason: "TOO_FAST" });
  assert.equal(decideClientEvent({ ...base, type: "PROGRESS_25", viewKey: "v1", now: at(14), prior: [prior("PLAY", "v1", 0)] }).accept, true);
  assert.equal(decideClientEvent({ ...base, type: "COMPLETE", viewKey: "v1", now: at(55), prior: [prior("PLAY", "v1", 0)] }).accept, true);
});

test("duplicates and floods are dropped; a new page view of the same link counts as a new view", () => {
  const base = { videoSeconds: 15 };
  assert.deepEqual(decideClientEvent({ ...base, type: "PLAY", viewKey: "v1", now: at(1), prior: [prior("PLAY", "v1", 0)] }), { accept: false, reason: "DUPLICATE" });
  assert.deepEqual(decideClientEvent({ ...base, type: "PAGE_VIEW", viewKey: "v2", now: at(1), prior: [prior("PAGE_VIEW", "v1", 0)] }), { accept: false, reason: "FLOOD" });
  assert.deepEqual(decideClientEvent({ ...base, type: "PAGE_VIEW", viewKey: "v2", now: at(60), prior: [prior("PAGE_VIEW", "v1", 0)] }), { accept: true, countsAsNewView: true });
  assert.deepEqual(decideClientEvent({ ...base, type: "PAGE_VIEW", viewKey: "v1", now: at(60), prior: [] }), { accept: true, countsAsNewView: true });
  // @ts-expect-error unknown type
  assert.deepEqual(decideClientEvent({ ...base, type: "CTA_DEMO", viewKey: "v1", now: at(60), prior: [] }), { accept: false, reason: "UNKNOWN_TYPE" });
});

test("link expiry and revocation", () => {
  const now = at(0);
  assert.equal(linkIsUsable({ expiresAt: new Date(now.getTime() + 1000), revokedAt: null }, now), true);
  assert.equal(linkIsUsable({ expiresAt: new Date(now.getTime() - 1), revokedAt: null }, now), false);
  assert.equal(linkIsUsable({ expiresAt: new Date(now.getTime() + 1000), revokedAt: now }, now), false);
});

test("furthest progress never calls an opened page a view", () => {
  assert.equal(furthestProgress([]), "none");
  assert.equal(furthestProgress(["PAGE_VIEW"]), "viewed");
  assert.equal(furthestProgress(["PAGE_VIEW", "PLAY"]), "played");
  assert.equal(furthestProgress(["PLAY", "PROGRESS_25", "PROGRESS_50"]), "50");
  assert.equal(furthestProgress(["PLAY", "PROGRESS_75", "COMPLETE", "CTA_DEMO"]), "complete");
});

// ── The email block ───────────────────────────────────────────────────────────────────────────────────────────────
test("email: the video is a clickable approved thumbnail linking to the video page; no MP4, no <video>, no attachments", async () => {
  const url = `${APP}/watch/fr?t=${TOKEN}`;
  const html = await render(React.createElement(SalesEmail, {
    lang: "fr", preview: "Bonjour", bodyHtml: `<p>Voici la vidéo : ${url}</p>`, signatureHtml: "<table><tr><td>Sig</td></tr></table>", footerLines: ["GarageOS"], unsubscribe: { url: `${APP}/sales/unsubscribe/x`, label: "Se désabonner" },
    video: { url, title: "GarageOS en 60 secondes", thumbnailUrl: `${APP}/video/email-fr.jpg`, label: "Regarder la vidéo de 60 secondes" },
  }));
  assert.match(html, new RegExp(`<a[^>]+href="${url.replace(/[.?]/g, "\\$&")}"[^>]*><img[^>]+src="${APP}/video/email-fr.jpg"`), "thumbnail inside a link to the landing page");
  assert.match(html, /alt="GarageOS en 60 secondes"/);
  assert.match(html, /width="480"/);
  assert.match(html, /Regarder la vidéo de 60 secondes/);
  assert.doesNotMatch(html, /\.mp4|<video|<source|data:video|multipart/i);
  assert.match(html, /Se désabonner/, "the unsubscribe link and footer stay");
  assert.match(html, /Sig/, "the seller signature stays");
});

test("rate limiter: a burst is cut, the window resets, buckets are per key", async () => {
  const { allow } = await import("../src/lib/video-rate-limit");
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(allow("k1", 5, 60_000, t0 + i), true);
  assert.equal(allow("k1", 5, 60_000, t0 + 10), false, "6th request inside the window");
  assert.equal(allow("k2", 5, 60_000, t0 + 10), true, "another client is unaffected");
  assert.equal(allow("k1", 5, 60_000, t0 + 60_001), true, "window reset");
});
