import assert from "node:assert/strict";
import test from "node:test";
import { INBOUND_MAX_BODY_BYTES, deriveInboundId, inboundPayloadSchema, senderAuthentication, signInbound, verifyInbound } from "../src/domain/sales-comms/inbound-auth";
import { KEPT_HEADERS, buildPayload, sign } from "../cloudflare/sales-inbound-worker/src/lib";
import { computeSetupState } from "../src/domain/sales-comms/sender-setup";
import { buildReplyTo, extractReplyKey } from "../src/domain/sales-comms/tokens";

const SECRET = "s".repeat(40);
const now = Date.now();
const ts = String(Math.floor(now / 1000));
const body = JSON.stringify({ hello: "world" });

test("the Worker's WebCrypto signature equals the server's (same bytes, same format)", async () => {
  assert.equal(await sign(SECRET, ts, body), signInbound(SECRET, ts, body));
  assert.match(signInbound(SECRET, ts, body), /^v1=[0-9a-f]{64}$/);
});

test("verification fails CLOSED and rejects tampering, replay, wrong secret and malformed headers", () => {
  const good = signInbound(SECRET, ts, body);
  const v = (o: Partial<Parameters<typeof verifyInbound>[0]>) => verifyInbound({ secret: SECRET, timestamp: ts, signature: good, rawBody: body, nowMs: now, ...o });
  assert.deepEqual(v({}), { ok: true });
  assert.deepEqual(v({ secret: undefined }), { ok: false, reason: "NO_SECRET" });
  assert.deepEqual(v({ secret: "short" }), { ok: false, reason: "NO_SECRET" }, "a weak secret is never accepted");
  assert.deepEqual(v({ signature: null }), { ok: false, reason: "MISSING" });
  assert.deepEqual(v({ timestamp: "abc" }), { ok: false, reason: "MISSING" });
  assert.deepEqual(v({ rawBody: body + " " }), { ok: false, reason: "BAD_SIGNATURE" }, "body tampering");
  assert.deepEqual(v({ signature: signInbound("t".repeat(40), ts, body) }), { ok: false, reason: "BAD_SIGNATURE" }, "wrong secret");
  assert.deepEqual(v({ signature: good.slice(0, -2) + "00" }), { ok: false, reason: "BAD_SIGNATURE" });
  assert.deepEqual(v({ signature: "v1=" }), { ok: false, reason: "BAD_SIGNATURE" });
  assert.deepEqual(v({ nowMs: now + 301_000 }), { ok: false, reason: "STALE" }, "old signed request replayed later");
  assert.deepEqual(v({ nowMs: now - 301_000 }), { ok: false, reason: "STALE" }, "far-future timestamp");
  assert.deepEqual(v({ timestamp: String(Number(ts) + 1), }), { ok: false, reason: "BAD_SIGNATURE" }, "timestamp is part of the signature");
  // A signature made for the Resend/Svix format can never validate here.
  assert.deepEqual(v({ signature: "v1,Zm9v" }), { ok: false, reason: "BAD_SIGNATURE" });
});

const base = { envelopeFrom: "owner@hotmail.com", envelopeTo: "replies+abc@garage-os.ca", from: "Owner <owner@hotmail.com>", to: ["replies+abc@garage-os.ca"], subject: "Re: Hello", headers: {}, rawSize: 1200 };

test("payload schema is strict and bounded", () => {
  assert.ok(inboundPayloadSchema.safeParse(base).success);
  assert.equal(inboundPayloadSchema.safeParse({ ...base, extra: 1 }).success, false, "unknown keys rejected");
  assert.equal(inboundPayloadSchema.safeParse({ ...base, text: "x".repeat(200_001) }).success, false);
  assert.equal(inboundPayloadSchema.safeParse({ ...base, to: Array(51).fill("a@b.co") }).success, false);
  assert.equal(inboundPayloadSchema.safeParse({ ...base, rawSize: 30_000_000 }).success, false);
  assert.equal(inboundPayloadSchema.safeParse({ ...base, headers: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`h${i}`, "v"])) }).success, false);
  assert.equal(inboundPayloadSchema.safeParse({ ...base, envelopeTo: "" }).success, false);
  assert.ok(INBOUND_MAX_BODY_BYTES <= 1_048_576);
});

test("dedupe ids are deterministic, namespaced away from Resend ids, and distinguish different messages", () => {
  const a = inboundPayloadSchema.parse({ ...base, messageId: "<abc@mail.hotmail.com>" });
  assert.equal(deriveInboundId(a), deriveInboundId(inboundPayloadSchema.parse({ ...base, messageId: "<ABC@mail.hotmail.com>" })), "Message-ID is case-insensitive");
  assert.match(deriveInboundId(a), /^cf:[0-9a-f]{40}$/);
  assert.notEqual(deriveInboundId(a), deriveInboundId(inboundPayloadSchema.parse({ ...base, messageId: "<other@mail.hotmail.com>" })));
  assert.notEqual(deriveInboundId(a), deriveInboundId(inboundPayloadSchema.parse({ ...base, messageId: "<abc@mail.hotmail.com>", envelopeFrom: "x@y.co" })), "same Message-ID from another sender is a different message");
  const noId1 = deriveInboundId(inboundPayloadSchema.parse({ ...base, text: "one" })), noId2 = deriveInboundId(inboundPayloadSchema.parse({ ...base, text: "two" }));
  assert.notEqual(noId1, noId2, "without a Message-ID the content decides");
});

test("sender authentication: DMARC fail (or SPF+DKIM fail) is not trusted; missing headers do not block", () => {
  assert.equal(senderAuthentication({ "authentication-results": "mx.cloudflare.net; dkim=pass; spf=pass; dmarc=pass" }).trusted, true);
  assert.equal(senderAuthentication({ "authentication-results": "x; spf=pass; dkim=fail; dmarc=fail" }).trusted, false);
  assert.equal(senderAuthentication({ "authentication-results": "x; spf=fail; dkim=fail" }).trusted, false);
  assert.equal(senderAuthentication({ "authentication-results": "x; spf=fail; dkim=pass" }).trusted, true);
  assert.equal(senderAuthentication({}).trusted, true);
});

test("Worker payload builder: header whitelist, caps, attachment metadata only", () => {
  const h = new Map<string, string>([["in-reply-to", "<m1@garage-os.ca>"], ["references", "<m1@garage-os.ca>"], ["cookie", "secret"], ["authorization", "Bearer x"], ["authentication-results", "x; dmarc=pass"]]);
  const p = buildPayload(
    { from: "owner@hotmail.com", to: "replies+k@garage-os.ca", rawSize: 5000, headers: { get: (n) => h.get(n) ?? null } },
    { from: { address: "owner@hotmail.com", name: 'Own"er <x>' }, to: [{ address: "replies+k@garage-os.ca" }], subject: "s".repeat(2000), text: "t".repeat(300_000), attachments: [{ filename: "a.pdf", mimeType: "application/pdf", content: new Uint8Array(10) }] },
  );
  assert.ok(Object.keys(p.headers).every((k) => (KEPT_HEADERS as readonly string[]).includes(k)));
  assert.ok(!("cookie" in p.headers) && !("authorization" in p.headers));
  assert.equal(p.subject.length, 998); assert.equal(p.text!.length, 200_000);
  assert.deepEqual(p.attachments, [{ filename: "a.pdf", contentType: "application/pdf", size: 10 }]);
  assert.doesNotMatch(p.from, /[<>"]\s*x>/);
  assert.ok(inboundPayloadSchema.safeParse(p).success, "what the Worker builds always satisfies the server schema");
});

test("reply address: shared mailbox + key round-trips through extractReplyKey (plus-addressing)", () => {
  const to = buildReplyTo("replies", "garage-os.ca", "0123456789abcdef01234567");
  assert.equal(to, "replies+0123456789abcdef01234567@garage-os.ca");
  assert.equal(extractReplyKey(to), "0123456789abcdef01234567");
});

test("setup state: Cloudflare mode needs the Worker secret instead of Resend receiving; Resend webhook no longer gates receiving", () => {
  const input = {
    providerKeyConfigured: true, providerSideEffectsEnabled: true, webhookSecretConfigured: false, unsubscribeSecretConfigured: true,
    settings: { sendingEnabled: true, approvedDomains: ["garage-os.ca"], inboundDomain: "garage-os.ca", mailingAddress: "1 Rue Test", inboundProvider: "CLOUDFLARE" as const },
    identity: { fromEmail: "a@garage-os.ca", status: "ACTIVE" as const, replyToEmail: null, inboundVerifiedAt: null, staffActive: true },
    fromDomain: { found: true, status: "verified", sendingEnabled: true, receivingEnabled: false }, inboundDomainFact: null, lookupError: null,
  };
  const off = computeSetupState({ ...input, inboundSecretConfigured: false });
  assert.equal(off.canSend, true); assert.equal(off.canReceive, false);
  assert.ok(off.steps.some((s) => s.key === "inbound_worker" && !s.ok)); assert.ok(!off.steps.some((s) => s.key === "inbound_receiving"));
  const on = computeSetupState({ ...input, inboundSecretConfigured: true });
  assert.equal(on.canReceive, true); assert.equal(on.headline, "READY");
  assert.equal(on.roundTripVerified, false, "still only a REAL reply proves the path");
  const resend = computeSetupState({ ...input, settings: { ...input.settings, inboundProvider: "RESEND" }, inboundSecretConfigured: true });
  assert.equal(resend.canReceive, false, "Resend mode is unchanged: needs webhook secret + provider receiving");
});
