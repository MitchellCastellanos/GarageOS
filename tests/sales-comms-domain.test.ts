import assert from "node:assert/strict";
import test from "node:test";
import {
  HeaderInjectionError, assertSafeHeaderValue, cleanSubject, formatMailbox, isAutomatedMessage, isValidEmail, looksLikeOptOut,
  normalizeSubject, parseAddress, parseMessageIdList, parseRecipientList, replySubject,
} from "../src/domain/sales-comms/email";
import { buildReplyTo, extractReplyKey, newReplyKey, randomToken, signUnsubscribeToken, verifyUnsubscribeToken } from "../src/domain/sales-comms/tokens";
import { htmlToText, stripQuotedReply, textToHtml } from "../src/domain/sales-comms/html";
import { validateAttachment, sanitizeFilename } from "../src/domain/sales-comms/attachments";
import { buildIcs, foldLine } from "../src/domain/sales-comms/ics";
import { addBusinessDays, isBusinessDay, nextSendInstant, quebecHolidays } from "../src/domain/sales-comms/business-days";
import { generateSlots, isSlotOffered, parseWeeklyHours, type SlotInput } from "../src/domain/sales-comms/availability";
import { evaluateSendingBasis, evaluateSendPolicy, type SendPolicyInput } from "../src/domain/sales-comms/casl";
import { BUILTIN_TEMPLATES, KNOWN_VARIABLES, TEMPLATE_KEYS, builtinTemplate, extractVariables, renderTemplate, unknownVariables } from "../src/domain/sales-comms/templates";
import { DEFAULT_SEQUENCE, decideStop, scheduleStep, type StopContext } from "../src/domain/sales-comms/sequences";
import { matchThread } from "../src/domain/sales-comms/threading";
import { computeSetupState, type SetupInput } from "../src/domain/sales-comms/sender-setup";
import { canModifyMeeting, formatMeetingWhen, isValidTimezone, meetingEmailKey, reminderPlan } from "../src/domain/sales-comms/meetings";
import { resolveEffectiveLanguage } from "../src/domain/sales-crm/language";
import { capabilitiesFor } from "../src/domain/sales-crm/access";

// ── Email safety ─────────────────────────────────────────────────────────────────────────────
test("header injection: CR/LF/NUL/U+2028 in any header value, subject or mailbox name is rejected or stripped", () => {
  for (const bad of ["a\r\nBcc: x@y.z", "a\nb", "a\u0000b", "a b"]) assert.throws(() => assertSafeHeaderValue(bad), HeaderInjectionError);
  assert.throws(() => cleanSubject("Hi\r\nBcc: evil@x.com"), HeaderInjectionError);
  assert.equal(cleanSubject("  Hello\t\tworld  "), "Hello world");
  assert.equal(formatMailbox('Eve "<evil@x.com>"\\', "a@b.ca"), '"Eve evil@x.com" <a@b.ca>');
  assert.throws(() => formatMailbox("n", "a@b.ca\r\nBcc: x@y.z"), HeaderInjectionError);
  assert.throws(() => formatMailbox("n", "not-an-email"));
});

test("addresses: validation, parsing and recipient lists", () => {
  assert.ok(isValidEmail("alexandre@garage-os.ca"));
  for (const bad of ["a@b", "a b@c.ca", "@c.ca", "a@@c.ca", "a@c\n.ca", "x".repeat(300) + "@c.ca"]) assert.equal(isValidEmail(bad), false, bad);
  assert.deepEqual(parseAddress('"Jean Roy" <JEAN@Garage.ca>'), { email: "jean@garage.ca", name: "Jean Roy" });
  assert.equal(parseAddress("nope"), null);
  const r = parseRecipientList("a@b.ca, A@B.ca; bad, c@d.ca\n e@f.ca");
  assert.deepEqual(r.valid, ["a@b.ca", "c@d.ca", "e@f.ca"]);
  assert.deepEqual(r.invalid, ["bad"]);
});

test("subjects and message ids: reply prefixes normalise in EN/FR; References parse", () => {
  assert.equal(normalizeSubject("RE: Re : TR: Réf : Hello  World"), "hello world");
  assert.equal(replySubject("Hello"), "Re: Hello");
  assert.equal(replySubject("RE: Hello"), "RE: Hello");
  assert.deepEqual(parseMessageIdList("<a@x> <b@y>\n <a@x>"), ["<a@x>", "<b@y>"]);
});

test("automated mail (out of office, bounces, lists) is detected and opt-out phrases recognised in EN/FR", () => {
  assert.ok(isAutomatedMessage({ "Auto-Submitted": "auto-replied" }, "Re: hi"));
  assert.ok(isAutomatedMessage({ Precedence: "bulk" }, "x"));
  assert.ok(isAutomatedMessage(null, "Réponse automatique : absent"));
  assert.ok(isAutomatedMessage(null, "x", "MAILER-DAEMON@mail.com"));
  assert.equal(isAutomatedMessage({ "Auto-Submitted": "no" }, "Re: hi", "jean@garage.ca"), false);
  assert.ok(looksLikeOptOut("Please unsubscribe me"));
  assert.ok(looksLikeOptOut("Ne me contactez plus svp"));
  assert.ok(looksLikeOptOut("Désabonnez-moi"));
  assert.equal(looksLikeOptOut("Sounds good, Tuesday works"), false);
});

// ── Tokens ───────────────────────────────────────────────────────────────────────────────────
test("tokens: random, URL safe, reply keys round-trip through plus addresses; unsubscribe tokens are tamper-proof", () => {
  assert.notEqual(randomToken(), randomToken());
  assert.match(randomToken(), /^[A-Za-z0-9_-]{43}$/);
  const key = newReplyKey();
  const to = buildReplyTo("Alexandre", "Sales.Garage-OS.ca", key);
  assert.equal(to, `alexandre+${key}@sales.garage-os.ca`);
  assert.equal(extractReplyKey(to), key);
  assert.equal(extractReplyKey(to.toUpperCase()), key);
  assert.equal(extractReplyKey("alexandre@sales.garage-os.ca"), null);
  assert.equal(extractReplyKey("a+zzzz@x.ca"), null);
  const t = signUnsubscribeToken("secret-secret-secret", "msg123456789");
  assert.equal(verifyUnsubscribeToken("secret-secret-secret", t), "msg123456789");
  assert.equal(verifyUnsubscribeToken("other-secret-other", t), null);
  assert.equal(verifyUnsubscribeToken("secret-secret-secret", t.replace("msg123456789", "msg123456780")), null);
  assert.equal(verifyUnsubscribeToken("", t), null);
  assert.throws(() => signUnsubscribeToken("", "x"));
});

// ── HTML ─────────────────────────────────────────────────────────────────────────────────────
test("textToHtml escapes everything, only auto-links http(s) and never emits javascript:/script", () => {
  const html = textToHtml('Hi <script>alert(1)</script> & "x"\n\nSee https://garage-os.ca/a?b=1&c=2. javascript:alert(1) <img onerror=x>');
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes('<a href="https://garage-os.ca/a?b=1&amp;c=2"'));
  assert.ok(!/href="javascript/i.test(html));
  assert.equal((html.match(/<p /g) ?? []).length, 2);
});

test("inbound HTML is flattened to text (scripts/styles dropped) and quoted history stripped", () => {
  const t = htmlToText('<style>p{}</style><p>Hello&nbsp;<b>Jean</b></p><script>alert(1)</script><p>Tue works &amp; ok</p>');
  assert.equal(t, "Hello Jean\nTue works & ok");
  assert.equal(stripQuotedReply("Sounds good.\n\nOn Tue, Mar 3, 2026 at 2:00 PM Alex <a@b.ca> wrote:\n> hi"), "Sounds good.");
  assert.equal(stripQuotedReply("Parfait.\n\nLe mar. 3 mars 2026 à 14:00, Alex <a@b.ca> a écrit :\n> salut"), "Parfait.");
});

// ── Attachments ──────────────────────────────────────────────────────────────────────────────
test("attachments: allowlist, magic bytes, size caps, filename sanitising", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2]);
  assert.deepEqual(validateAttachment({ filename: "../../etc/Quote.PDF", mimeType: "application/pdf", bytes: pdf }), { ok: true, filename: "Quote.PDF", mimeType: "application/pdf" });
  assert.deepEqual(validateAttachment({ filename: "a.pdf", mimeType: "application/pdf", bytes: new Uint8Array([1, 2, 3]) }), { ok: false, code: "CONTENT_MISMATCH" });
  assert.deepEqual(validateAttachment({ filename: "a.html", mimeType: "text/html", bytes: pdf }), { ok: false, code: "TYPE_NOT_ALLOWED" });
  assert.deepEqual(validateAttachment({ filename: "a.exe", mimeType: "application/pdf", bytes: pdf }), { ok: false, code: "TYPE_NOT_ALLOWED" });
  assert.deepEqual(validateAttachment({ filename: "a.pdf", mimeType: "application/pdf", bytes: new Uint8Array(0) }), { ok: false, code: "EMPTY" });
  assert.deepEqual(validateAttachment({ filename: "a.pdf", mimeType: "application/pdf", bytes: new Uint8Array(5 * 1024 * 1024 + 1) }), { ok: false, code: "TOO_LARGE" });
  assert.equal(sanitizeFilename('..\\x"y<z>.png'), "xyz.png");
});

// ── ICS ──────────────────────────────────────────────────────────────────────────────────────
test("ICS: CRLF, UTC times, escaped text, SEQUENCE and CANCEL semantics, 75-octet folding", () => {
  const ics = buildIcs({
    uid: "m1@garage-os.ca", sequence: 2, method: "REQUEST", startsAt: new Date("2026-03-10T18:00:00Z"), endsAt: new Date("2026-03-10T18:30:00Z"),
    summary: "GarageOS demo; Jean, Roy", description: "Line1\nLine2", organizer: { name: "Alex", email: "alex@garage-os.ca" }, attendee: { name: "Jean", email: "jean@garage.ca" },
    now: new Date("2026-03-01T12:00:00Z"),
  });
  assert.ok(ics.includes("\r\nDTSTART:20260310T180000Z\r\n"));
  assert.ok(ics.includes("SEQUENCE:2\r\n"));
  assert.ok(ics.includes("SUMMARY:GarageOS demo\; Jean\\, Roy\r\n"));
  assert.ok(ics.includes("DESCRIPTION:Line1\\nLine2\r\n"));
  assert.ok(ics.includes("METHOD:REQUEST") && ics.includes("STATUS:CONFIRMED"));
  assert.ok(!/[^\r]\n/.test(ics));
  const cancel = buildIcs({ uid: "m1@garage-os.ca", sequence: 3, method: "CANCEL", startsAt: new Date(), endsAt: new Date(Date.now() + 1800000), summary: "x", organizer: { name: "A", email: "a@b.ca" }, attendee: { name: "J", email: "j@b.ca" } });
  assert.ok(cancel.includes("METHOD:CANCEL") && cancel.includes("STATUS:CANCELLED"));
  const folded = foldLine("X:" + "é".repeat(80));
  for (const l of folded.split("\r\n")) assert.ok(new TextEncoder().encode(l).length <= 76, "folded line too long");
  assert.equal(folded.replace(/\r\n /g, ""), "X:" + "é".repeat(80));
});

// ── Business days / holidays ─────────────────────────────────────────────────────────────────
test("Québec holidays 2026 and business-day arithmetic", () => {
  const h = quebecHolidays(2026);
  for (const d of ["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-18", "2026-06-24", "2026-07-01", "2026-09-07", "2026-10-12", "2026-12-25"]) assert.ok(h.has(d), d);
  assert.equal(isBusinessDay("2026-03-07", "America/Toronto"), false); // Saturday
  assert.equal(isBusinessDay("2026-04-03", "America/Toronto"), false); // Good Friday
  assert.equal(addBusinessDays("2026-03-06", 1, "America/Toronto"), "2026-03-09"); // Fri +1 ⇒ Mon
  assert.equal(addBusinessDays("2026-04-02", 1, "America/Toronto"), "2026-04-07"); // Thu +1 skips Good Friday + Easter Monday
  assert.equal(addBusinessDays("2026-03-07", 0, "America/Toronto"), "2026-03-09"); // Saturday + 0 ⇒ Monday
});

test("nextSendInstant keeps the sender window and business days (local time, DST aware)", () => {
  const win = { startHour: 8, endHour: 17, businessDaysOnly: true };
  const tz = "America/Toronto";
  // Inside window: unchanged.
  const inside = new Date("2026-03-10T16:00:00Z"); // Tue 12:00 EDT
  assert.equal(nextSendInstant(inside, tz, win).toISOString(), inside.toISOString());
  // Before window on a business day → 08:00 EDT same day (12:00Z).
  assert.equal(nextSendInstant(new Date("2026-03-10T09:00:00Z"), tz, win).toISOString(), "2026-03-10T12:00:00.000Z");
  // After window Friday → Monday 08:00 local.
  assert.equal(nextSendInstant(new Date("2026-03-06T23:00:00Z"), tz, win).toISOString(), "2026-03-09T12:00:00.000Z");
  // Friday night just before the spring-forward weekend: Monday 08:00 is EDT (12:00Z), not EST.
  assert.equal(nextSendInstant(new Date("2026-03-06T23:00:00Z"), tz, win).toISOString().slice(11, 13), "12");
  // Saturday midday → Monday.
  assert.equal(nextSendInstant(new Date("2026-03-07T17:00:00Z"), tz, win).toISOString(), "2026-03-09T12:00:00.000Z");
});

// ── Availability / DST ───────────────────────────────────────────────────────────────────────
const TZ = "America/Toronto"; // Montréal shares this zone's rules
const baseSlot = (over: Partial<SlotInput> = {}): SlotInput => ({
  weekly: { mon: [["09:00", "12:00"]], tue: [["09:00", "12:00"]], sat: [["09:00", "10:00"]], sun: [["09:00", "10:00"]] },
  timezone: TZ, exceptions: [], busy: [], durationMinutes: 30, bufferMinutes: 10, stepMinutes: 30, now: new Date("2026-03-01T00:00:00Z"),
  minNoticeMinutes: 60, maxAdvanceDays: 60, fromDate: "2026-03-09", toDate: "2026-03-09", ...over,
});

test("weekly hours validation", () => {
  assert.deepEqual(parseWeeklyHours({ mon: [["09:00", "17:00"]] }), { mon: [["09:00", "17:00"]] });
  assert.equal(parseWeeklyHours({ mon: [["17:00", "09:00"]] }), null);
  assert.equal(parseWeeklyHours({ mon: [["09:00", "12:00"], ["11:00", "13:00"]] }), null);
  assert.equal(parseWeeklyHours({ funday: [["09:00", "10:00"]] }), null);
  assert.equal(parseWeeklyHours({ mon: [["9:00", "10:00"]] }), null);
});

test("slots: working hours in the seller timezone → UTC instants (Monday 09:00 EDT = 13:00Z)", () => {
  const slots = generateSlots(baseSlot());
  assert.deepEqual(slots.map((s) => s.toISOString()), ["2026-03-09T13:00:00.000Z", "2026-03-09T13:30:00.000Z", "2026-03-09T14:00:00.000Z", "2026-03-09T14:30:00.000Z", "2026-03-09T15:00:00.000Z", "2026-03-09T15:30:00.000Z"]);
});

test("DST: spring-forward Sunday 2026-03-08 (EST→EDT) and fall-back Sunday 2026-11-01 keep wall-clock hours and correct UTC offsets", () => {
  const spring = generateSlots(baseSlot({ fromDate: "2026-03-08", toDate: "2026-03-08", now: new Date("2026-03-01T00:00:00Z") }));
  assert.equal(spring[0].toISOString(), "2026-03-08T13:00:00.000Z"); // 09:00 EDT (UTC-4) — NOT 14:00Z
  const beforeSpring = generateSlots(baseSlot({ fromDate: "2026-03-07", toDate: "2026-03-07" }));
  assert.equal(beforeSpring[0].toISOString(), "2026-03-07T14:00:00.000Z"); // Saturday 09:00 EST (UTC-5)
  const fall = generateSlots(baseSlot({ fromDate: "2026-11-01", toDate: "2026-11-01", now: new Date("2026-10-01T00:00:00Z") }));
  assert.equal(fall[0].toISOString(), "2026-11-01T14:00:00.000Z"); // 09:00 EST (UTC-5) after fall-back
  const beforeFall = generateSlots(baseSlot({ fromDate: "2026-10-31", toDate: "2026-10-31", weekly: { sat: [["09:00", "10:00"]] }, now: new Date("2026-10-01T00:00:00Z") }));
  assert.equal(beforeFall[0].toISOString(), "2026-10-31T13:00:00.000Z"); // 09:00 EDT (UTC-4)
  // A window across the change has the true elapsed length: 00:00–06:00 local on fall-back day is 7 real hours.
  const longNight = generateSlots(baseSlot({ weekly: { sun: [["00:00", "06:00"]] }, durationMinutes: 60, bufferMinutes: 0, stepMinutes: 60, fromDate: "2026-11-01", toDate: "2026-11-01", now: new Date("2026-10-01T00:00:00Z") }));
  assert.equal(longNight.length, 7);
  const shortNight = generateSlots(baseSlot({ weekly: { sun: [["00:00", "06:00"]] }, durationMinutes: 60, bufferMinutes: 0, stepMinutes: 60, fromDate: "2026-03-08", toDate: "2026-03-08" }));
  assert.equal(shortNight.length, 5); // 23-hour day: only 5 real hours between 00:00 and 06:00
});

test("slots: buffers, existing meetings, days off, extra hours, minimum notice and horizon", () => {
  const busy = [{ startsAt: new Date("2026-03-09T14:00:00Z"), endsAt: new Date("2026-03-09T14:30:00Z") }];
  const withBusy = generateSlots(baseSlot({ busy })).map((s) => s.toISOString().slice(11, 16));
  // 14:00–14:30 booked, 10 min buffer each side ⇒ 13:30 (ends 14:00, inside buffer), 14:00, 14:30 (starts inside trailing buffer) unavailable.
  assert.deepEqual(withBusy, ["13:00", "15:00", "15:30"]);
  const off = generateSlots(baseSlot({ exceptions: [{ kind: "OFF", startsAt: new Date("2026-03-09T00:00:00Z"), endsAt: new Date("2026-03-10T00:00:00Z") }] }));
  assert.equal(off.length, 0);
  const extra = generateSlots(baseSlot({ weekly: {}, exceptions: [{ kind: "EXTRA", startsAt: new Date("2026-03-09T20:00:00Z"), endsAt: new Date("2026-03-09T21:00:00Z") }] }));
  assert.deepEqual(extra.map((s) => s.toISOString().slice(11, 16)), ["20:00", "20:30"]);
  const notice = generateSlots(baseSlot({ now: new Date("2026-03-09T13:20:00Z"), minNoticeMinutes: 60 }));
  assert.equal(notice[0].toISOString(), "2026-03-09T14:30:00.000Z");
  assert.equal(generateSlots(baseSlot({ now: new Date("2026-03-09T00:00:00Z"), maxAdvanceDays: 0 })).length, 0);
});

test("isSlotOffered rejects forged starts (off-grid, outside hours, inside a buffer)", () => {
  const { fromDate: _f, toDate: _t, ...input } = baseSlot({ busy: [{ startsAt: new Date("2026-03-09T14:00:00Z"), endsAt: new Date("2026-03-09T14:30:00Z") }] });
  void _f; void _t;
  assert.ok(isSlotOffered(new Date("2026-03-09T13:00:00Z"), input));
  assert.equal(isSlotOffered(new Date("2026-03-09T13:07:00Z"), input), false);
  assert.equal(isSlotOffered(new Date("2026-03-09T22:00:00Z"), input), false);
  assert.equal(isSlotOffered(new Date("2026-03-09T14:30:00Z"), input), false);
});

// ── CASL / send policy ───────────────────────────────────────────────────────────────────────
const NOW = new Date("2026-03-10T12:00:00Z");
const basisRow = (over = {}) => ({ kind: "IMPLIED_PUBLISHED_ADDRESS" as const, evidence: "Address published on shop website contact page", recordedAt: new Date("2026-02-01"), expiresAt: null, revokedAt: null, reviewStatus: "APPROVED" as const, ...over });

test("sending basis: none/expired/revoked/under-documented never authorise; newest row wins", () => {
  assert.deepEqual(evaluateSendingBasis([], NOW), { valid: false, reason: "NONE" });
  assert.deepEqual(evaluateSendingBasis([basisRow({ expiresAt: new Date("2026-03-01") })], NOW), { valid: false, reason: "EXPIRED" });
  assert.deepEqual(evaluateSendingBasis([basisRow({ revokedAt: new Date("2026-03-02") })], NOW), { valid: false, reason: "REVOKED" });
  assert.deepEqual(evaluateSendingBasis([basisRow({ evidence: "yes" })], NOW), { valid: false, reason: "WEAK_EVIDENCE" });
  assert.equal(evaluateSendingBasis([basisRow(), basisRow({ recordedAt: new Date("2026-03-05"), revokedAt: new Date("2026-03-06") })], NOW).valid, false);
  assert.equal(evaluateSendingBasis([basisRow()], NOW).valid, true);
});

test("sending basis review gate: address-based bases need APPROVED; legacy/pending/rejected/absent status never authorise; other kinds keep their behaviour", () => {
  for (const reviewStatus of ["PENDING_REVIEW", "LEGACY_UNREVIEWED", "REJECTED", "NOT_REQUIRED", undefined] as const) {
    assert.equal(evaluateSendingBasis([basisRow({ reviewStatus })], NOW).valid, false, `published address with ${reviewStatus}`);
    assert.equal(evaluateSendingBasis([basisRow({ kind: "IMPLIED_DISCLOSED_ADDRESS", reviewStatus })], NOW).valid, false, `disclosed address with ${reviewStatus}`);
  }
  assert.deepEqual(evaluateSendingBasis([basisRow({ reviewStatus: "PENDING_REVIEW" })], NOW), { valid: false, reason: "PENDING_REVIEW" });
  assert.deepEqual(evaluateSendingBasis([basisRow({ reviewStatus: "LEGACY_UNREVIEWED" })], NOW), { valid: false, reason: "UNREVIEWED" });
  assert.deepEqual(evaluateSendingBasis([basisRow({ reviewStatus: "REJECTED" })], NOW), { valid: false, reason: "REJECTED_EVIDENCE" });
  // Existing behaviour for self-attested kinds that need no second review is unchanged (legacy rows included) …
  for (const kind of ["EXPRESS_CONSENT", "IMPLIED_EXISTING_RELATIONSHIP", "EXEMPT"] as const) {
    assert.equal(evaluateSendingBasis([basisRow({ kind, reviewStatus: "LEGACY_UNREVIEWED" })], NOW).valid, true, kind);
    assert.equal(evaluateSendingBasis([basisRow({ kind })], NOW).valid, true, kind);
    assert.equal(evaluateSendingBasis([basisRow({ kind, reviewStatus: "REJECTED" })], NOW).valid, false, kind);
  }
  // … and a newer pending row shadows an older approved one (newest decides).
  assert.equal(evaluateSendingBasis([basisRow(), basisRow({ recordedAt: new Date("2026-03-05"), reviewStatus: "PENDING_REVIEW" })], NOW).valid, false);
});

const policy = (over: Partial<SendPolicyInput> = {}): SendPolicyInput => ({
  category: "COMMERCIAL", settingsSendingEnabled: true, identityActive: true, staffActive: true, fromDomainApproved: true,
  recipients: [{ email: "jean@garage.ca", valid: true, suppression: null }], prospect: { doNotContact: false, archived: false }, contact: { doNotContact: false },
  basis: { valid: true, kind: "IMPLIED_PUBLISHED_ADDRESS", expiresAt: null }, languageResolved: true, sentToday: 0, dailyLimit: 30, commercialFooterConfigured: true, ...over,
});

test("send policy: every commercial precondition blocks with a precise code", () => {
  assert.deepEqual(evaluateSendPolicy(policy()), { allowed: true });
  const cases: [Partial<SendPolicyInput>, string][] = [
    [{ settingsSendingEnabled: false }, "SENDING_DISABLED"], [{ staffActive: false }, "STAFF_INACTIVE"], [{ identityActive: false }, "IDENTITY_INACTIVE"],
    [{ fromDomainApproved: false }, "DOMAIN_NOT_APPROVED"], [{ recipients: [] }, "NO_RECIPIENT"],
    [{ recipients: [{ email: "x", valid: false, suppression: null }] }, "INVALID_RECIPIENT"],
    [{ recipients: [{ email: "j@g.ca", valid: true, suppression: "UNSUBSCRIBE" }] }, "SUPPRESSED"],
    [{ recipients: [{ email: "j@g.ca", valid: true, suppression: "HARD_BOUNCE" }] }, "BOUNCED_ADDRESS"],
    [{ prospect: { doNotContact: true, archived: false } }, "PROSPECT_DNC"], [{ prospect: { doNotContact: false, archived: true } }, "PROSPECT_ARCHIVED"],
    [{ contact: { doNotContact: true } }, "CONTACT_DNC"], [{ basis: null }, "NO_VALID_BASIS"], [{ basis: { valid: false, reason: "EXPIRED" } }, "NO_VALID_BASIS"],
    [{ languageResolved: false }, "LANGUAGE_REQUIRED"], [{ sentToday: 30 }, "DAILY_LIMIT"], [{ commercialFooterConfigured: false }, "NO_UNSUBSCRIBE_CONFIG"],
  ];
  for (const [over, code] of cases) assert.equal((evaluateSendPolicy(policy(over)) as { code?: string }).code, code, code);
});

test("send policy: transactional meeting mail ignores an unsubscribe but never a hard bounce; replies need no basis but respect DNC", () => {
  const unsub = [{ email: "j@g.ca", valid: true, suppression: "UNSUBSCRIBE" as const }];
  assert.equal(evaluateSendPolicy(policy({ category: "TRANSACTIONAL", recipients: unsub, basis: null })).allowed, true);
  assert.equal(evaluateSendPolicy(policy({ category: "TRANSACTIONAL", recipients: [{ email: "j@g.ca", valid: true, suppression: "COMPLAINT" }] })).allowed, false);
  assert.equal(evaluateSendPolicy(policy({ category: "REPLY", basis: null })).allowed, true);
  assert.equal(evaluateSendPolicy(policy({ category: "REPLY", recipients: unsub })).allowed, false);
  assert.equal(evaluateSendPolicy(policy({ category: "REPLY", contact: { doNotContact: true } })).allowed, false);
  assert.equal(evaluateSendPolicy(policy({ category: "TRANSACTIONAL", settingsSendingEnabled: false })).allowed, false);
});

// ── Templates & language ─────────────────────────────────────────────────────────────────────
test("every template key exists in English and Canadian French, with identical variable sets and only known variables", () => {
  for (const key of TEMPLATE_KEYS) {
    const en = builtinTemplate(key, "EN"), fr = builtinTemplate(key, "FR");
    assert.ok(en && fr, key);
    assert.deepEqual(new Set(extractVariables(en.subject + en.body)), new Set(extractVariables(fr.subject + fr.body)), `${key} variable parity`);
    assert.deepEqual(unknownVariables(en.subject + en.body + fr.subject + fr.body), [], key);
    assert.notEqual(en.body, fr.body);
  }
  assert.equal(BUILTIN_TEMPLATES.length, TEMPLATE_KEYS.length * 2);
  assert.ok(KNOWN_VARIABLES.length > 5);
});

test("template rendering: variables are filled; a missing required value is reported so the send is blocked", () => {
  const t = builtinTemplate("INTRODUCTION", "FR")!;
  const ok = renderTemplate(t.subject, t.body, { greeting: "Bonjour Jean,", "prospect.name": "Garage Roy", "seller.name": "Alexandre", "booking.link": "https://x.ca/sales/book/abc" });
  assert.deepEqual(ok.missing, []);
  assert.ok(ok.body.startsWith("Bonjour Jean,") && ok.body.includes("https://x.ca/sales/book/abc") && !ok.body.includes("{{"));
  const bad = renderTemplate(t.subject, t.body, { greeting: "Bonjour,", "prospect.name": "Garage Roy", "seller.name": "A" });
  assert.deepEqual(bad.missing, ["booking.link"]);
  const subj = renderTemplate("Hi {{prospect.name}}", "x", { "prospect.name": "A\r\nBcc: x@y.z" });
  assert.ok(!/[\r\n]/.test(subj.subject));
});

test("language resolution priority is explicit override > contact > prospect > UNKNOWN (needs a human)", () => {
  assert.equal(resolveEffectiveLanguage({ override: "EN", contact: "FR", prospect: "FR" }).language, "EN");
  assert.equal(resolveEffectiveLanguage({ contact: "FR", prospect: "EN" }).language, "FR");
  assert.equal(resolveEffectiveLanguage({ contact: null, prospect: "EN" }).source, "prospect");
  const u = resolveEffectiveLanguage({ contact: null, prospect: "UNKNOWN" });
  assert.deepEqual([u.language, u.needsHumanDecision], ["UNKNOWN", true]);
});

// ── Sequences ────────────────────────────────────────────────────────────────────────────────
test("default sequence = day 1/4/9/16 (offsets 0/3/8/15 business days) scheduled inside the seller's window", () => {
  assert.deepEqual(DEFAULT_SEQUENCE.steps.map((s) => s.dayOffset), [0, 3, 8, 15]);
  const win = { startHour: 8, endHour: 17, businessDaysOnly: true };
  const enrolled = new Date("2026-03-10T15:00:00Z"); // Tue 11:00 EDT
  const when = DEFAULT_SEQUENCE.steps.map((s) => scheduleStep({ enrolledAt: enrolled, dayOffset: s.dayOffset, tz: TZ, window: win }).toISOString());
  assert.deepEqual(when, ["2026-03-10T15:00:00.000Z", "2026-03-13T12:00:00.000Z", "2026-03-20T12:00:00.000Z", "2026-03-31T12:00:00.000Z"]);
  // Enrolled Friday 16:30 local: step 0 still today (inside window); +3 business days = Wednesday.
  const fri = new Date("2026-03-06T21:30:00Z");
  assert.equal(scheduleStep({ enrolledAt: fri, dayOffset: 3, tz: TZ, window: win }).toISOString(), "2026-03-11T12:00:00.000Z");
});

test("stop decisions: DNC, bounce, opt-out, conversion, closed deals, inactive staff/identity, lapsed basis, archived sequence", () => {
  const ok: StopContext = { prospectDnc: false, prospectArchived: false, contactDnc: false, contactArchived: false, suppressed: null, opportunityStage: "CONTACTED", staffActive: true, identityActive: true, basisValid: true, sequenceArchived: false };
  assert.equal(decideStop(ok), null);
  const table: [Partial<StopContext>, string][] = [
    [{ prospectDnc: true }, "DO_NOT_CONTACT"], [{ contactDnc: true }, "DO_NOT_CONTACT"], [{ opportunityStage: "DO_NOT_CONTACT" }, "DO_NOT_CONTACT"],
    [{ suppressed: "HARD_BOUNCE" }, "BOUNCED"], [{ suppressed: "UNSUBSCRIBE" }, "OPTED_OUT"], [{ opportunityStage: "WON" }, "CONVERTED"],
    [{ opportunityStage: "LOST" }, "OPPORTUNITY_CLOSED"], [{ prospectArchived: true }, "PROSPECT_ARCHIVED"], [{ staffActive: false }, "STAFF_INACTIVE"],
    [{ identityActive: false }, "IDENTITY_INACTIVE"], [{ basisValid: false }, "NO_VALID_BASIS"], [{ sequenceArchived: true }, "SEQUENCE_ARCHIVED"],
  ];
  for (const [over, reason] of table) assert.equal(decideStop({ ...ok, ...over }), reason, reason);
});

// ── Threading ────────────────────────────────────────────────────────────────────────────────
test("thread matching: reply key beats Message-ID beats subject; subject never crosses identity or counterparty", () => {
  const cand = [{ id: "t1", identityId: "i1", counterpartyEmail: "jean@garage.ca", subject: "Hello there", lastMessageAt: new Date("2026-03-08"), status: "OPEN" as const }];
  const base = { replyKeyThreadId: null, referencedMessageThreadIds: [], identityId: "i1", fromEmail: "Jean@Garage.ca", subject: "RE: hello there", candidates: cand, now: NOW };
  assert.deepEqual(matchThread({ ...base, replyKeyThreadId: "tk", referencedMessageThreadIds: ["tm"] }), { kind: "reply_key", threadId: "tk" });
  assert.deepEqual(matchThread({ ...base, referencedMessageThreadIds: ["tm"] }), { kind: "message_id", threadId: "tm" });
  assert.deepEqual(matchThread(base), { kind: "subject", threadId: "t1" });
  assert.deepEqual(matchThread({ ...base, identityId: "i2" }), { kind: "new" });
  assert.deepEqual(matchThread({ ...base, fromEmail: "other@garage.ca" }), { kind: "new" });
  assert.deepEqual(matchThread({ ...base, subject: "Different" }), { kind: "new" });
  assert.deepEqual(matchThread({ ...base, now: new Date("2026-06-01") }), { kind: "new" });
  assert.deepEqual(matchThread({ ...base, candidates: [{ ...cand[0], status: "SPAM" }] }), { kind: "new" });
});

// ── Sender setup ─────────────────────────────────────────────────────────────────────────────
const fullSetup = (over: Partial<SetupInput> = {}): SetupInput => ({
  providerKeyConfigured: true, providerSideEffectsEnabled: true, webhookSecretConfigured: true, unsubscribeSecretConfigured: true,
  settings: { sendingEnabled: true, approvedDomains: ["sales.garage-os.ca"], inboundDomain: "sales.garage-os.ca", mailingAddress: "1 rue Exemple, Montréal QC" },
  identity: { fromEmail: "alexandre@sales.garage-os.ca", status: "ACTIVE", replyToEmail: null, inboundVerifiedAt: null, staffActive: true },
  fromDomain: { found: true, status: "verified", sendingEnabled: true, receivingEnabled: true },
  inboundDomainFact: { found: true, status: "verified", sendingEnabled: true, receivingEnabled: true }, lookupError: null, ...over,
});

test("sender setup state: ready only when the PROVIDER confirms the domain; round trip is a separate, unforgeable proof", () => {
  const s = computeSetupState(fullSetup());
  assert.equal(s.canSend, true); assert.equal(s.canReceive, true); assert.equal(s.roundTripVerified, false); assert.equal(s.headline, "READY");
  assert.equal(computeSetupState(fullSetup({ identity: { ...fullSetup().identity!, inboundVerifiedAt: new Date() } })).roundTripVerified, true);
  assert.equal(computeSetupState(fullSetup({ fromDomain: { found: true, status: "pending", sendingEnabled: true, receivingEnabled: false } })).canSend, false);
  assert.equal(computeSetupState(fullSetup({ fromDomain: null, lookupError: "no key" })).canSend, false);
  assert.equal(computeSetupState(fullSetup({ settings: { ...fullSetup().settings, approvedDomains: [] } })).canSend, false);
  assert.equal(computeSetupState(fullSetup({ providerSideEffectsEnabled: false })).canSend, false);
  assert.equal(computeSetupState(fullSetup({ settings: { ...fullSetup().settings, sendingEnabled: false } })).canSend, false);
  assert.equal(computeSetupState(fullSetup({ settings: { ...fullSetup().settings, mailingAddress: " " } })).canSend, false);
  const sendOnly = computeSetupState(fullSetup({ inboundDomainFact: { found: true, status: "pending", sendingEnabled: true, receivingEnabled: false } }));
  assert.equal(sendOnly.headline, "SEND_ONLY"); assert.equal(sendOnly.canReceive, false); assert.equal(sendOnly.roundTripVerified, false);
  assert.equal(computeSetupState(fullSetup({ identity: { ...fullSetup().identity!, status: "DISABLED" } })).headline, "BLOCKED");
});

// ── Meetings ─────────────────────────────────────────────────────────────────────────────────
test("reminders: planned relative to the start, skipped when already past, keyed by revision", () => {
  const start = new Date("2026-03-12T15:00:00Z");
  assert.deepEqual(reminderPlan(start, new Date("2026-03-01T00:00:00Z")).map((p) => [p.kind, p.at.toISOString()]), [["reminder_24h", "2026-03-11T15:00:00.000Z"], ["reminder_1h", "2026-03-12T14:00:00.000Z"]]);
  assert.deepEqual(reminderPlan(start, new Date("2026-03-12T10:00:00Z")).map((p) => p.kind), ["reminder_1h"]);
  assert.deepEqual(reminderPlan(start, new Date("2026-03-12T14:30:00Z")), []);
  assert.notEqual(meetingEmailKey("m1", 0, "reminder_1h"), meetingEmailKey("m1", 1, "reminder_1h"));
});

test("meeting formatting carries the zone label (EST vs EDT) in both languages; only future scheduled meetings are modifiable", () => {
  assert.match(formatMeetingWhen(new Date("2026-03-09T13:00:00Z"), TZ, "EN"), /EDT/);
  assert.match(formatMeetingWhen(new Date("2026-03-07T14:00:00Z"), TZ, "EN"), /EST/);
  assert.match(formatMeetingWhen(new Date("2026-03-09T13:00:00Z"), TZ, "FR"), /mars/);
  assert.ok(canModifyMeeting({ status: "SCHEDULED", startsAt: new Date("2026-03-12T15:00:00Z") }, new Date("2026-03-10T00:00:00Z")));
  assert.equal(canModifyMeeting({ status: "CANCELLED", startsAt: new Date("2026-03-12T15:00:00Z") }, new Date("2026-03-10T00:00:00Z")), false);
  assert.equal(canModifyMeeting({ status: "SCHEDULED", startsAt: new Date("2026-03-09T15:00:00Z") }, new Date("2026-03-10T00:00:00Z")), false);
  assert.ok(isValidTimezone("America/Toronto") && isValidTimezone("UTC") && !isValidTimezone("Mars/Base") && !isValidTimezone("x"));
});

test("capabilities: reps may enroll in approved sequences and manage their calendar, but not manage sequences/identities", () => {
  const rep = capabilitiesFor("SALES_REP");
  assert.ok(rep.has("send_sales_email") && rep.has("enroll_sequences") && rep.has("manage_calendar"));
  assert.ok(!rep.has("manage_sequences") && !rep.has("manage_sender_identities"));
  assert.ok(capabilitiesFor("SUPER_ADMIN").has("manage_sequences"));
});

// ── Copy parity (EN/FR) ──────────────────────────────────────────────────────────────────────
import { commsEn, commsFr } from "../src/lib/admin-locale/sales-comms";
function keyPaths(o: unknown, prefix = ""): string[] {
  if (o && typeof o === "object") return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}
test("every English string of the sales-comms copy has a French counterpart (and vice versa), none empty, placeholders preserved", () => {
  assert.deepEqual(keyPaths(commsFr).sort(), keyPaths(commsEn).sort());
  const flat = (o: unknown, p = ""): [string, string][] => (o && typeof o === "object" ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k)) : [[p, String(o)]]);
  const en = new Map(flat(commsEn)), fr = new Map(flat(commsFr));
  for (const [k, v] of en) {
    assert.ok(v.trim().length > 0 && (fr.get(k) ?? "").trim().length > 0, `empty copy at ${k}`);
    const ph = (s: string) => (s.match(/\{\{[^}]+\}\}/g) ?? []).filter((x) => (KNOWN_VARIABLES as readonly string[]).includes(x.slice(2, -2).trim())).sort().join(); // descriptive "{{placeholders}}" wording may be translated
    assert.equal(ph(fr.get(k)!), ph(v), `placeholders differ at ${k}`);
  }
  // Every error code the actions/libs can raise has a localized message in both languages.
  for (const code of ["SLOT_TAKEN", "NO_VALID_BASIS", "SUPPRESSED", "LANGUAGE_REQUIRED", "DAILY_LIMIT", "NO_SENDER_IDENTITY", "SETUP_DOMAIN_VERIFIED", "UNRESOLVED_PLACEHOLDER", "INVALID_SUBJECT"]) {
    assert.ok(commsEn.errors[code] && commsFr.errors[code], code);
  }
});
