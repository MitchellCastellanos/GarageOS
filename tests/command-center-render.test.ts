// Sales Command Center rendering (server-rendered with fixtures: no browser, no network, no Twilio): floating softphone modes, the outcome form
// inside the phone, the conversation tablist, the call guide and the prospect header, in EN and FR.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import "./helpers/action-harness";

const { FloatingSoftphone } = await import("../src/components/sales-calling/FloatingSoftphone");
const { CallGuide, GUIDE_STAGES } = await import("../src/components/sales-calling/CallGuide");
const { WorkspaceTabs, TabPanel } = await import("../src/components/sales-calling/WorkspaceTabs");
const { ProspectHeader } = await import("../src/components/sales-calling/ProspectHeader");
const { NextProspect } = await import("../src/components/sales-calling/NextProspect");
const { DispositionPanel } = await import("../src/components/sales-calling/DispositionPanel");
const { HistoryList, buildHistory } = await import("../src/components/sales-calling/HistoryList");
const { deriveLocks } = await import("../src/components/sales-calling/softphone-model");
const { callingCopy } = await import("../src/lib/admin-locale/sales-calling");
type Profile = import("../src/lib/voice/workspace-types").WorkspaceProfile;
type Mode = import("../src/components/sales-calling/softphone-model").DisplayMode;
type Phase = import("../src/components/sales-calling/softphone-model").PhonePhase;

const profile: Profile = {
  id: "p1", name: "Garage Tremblay", phone: "+1 514 555 0100", address: "1 Rue Test", city: "Laval", province: "QC", postalCode: "H7A 1A1", website: "https://example.test/", mapsUrl: "https://www.google.com/maps/search/?api=1&query=x",
  industry: "GENERAL_REPAIR", repairFit: "VERIFIED_REPAIR", shopSize: "SMALL", locationCount: 1, language: "FR", languageSuggested: "FR", currentSoftware: "Paper", notes: null, tags: [],
  stage: "CONTACTED", opportunityId: "o1", assignedSeller: "Alex", doNotContact: false,
  window: { open: true, localTime: "10:15", zone: "America/Toronto", reason: "OPEN" },
  contacts: [{ id: "c1", name: "Marie", title: "Owner", email: "marie@example.test", phone: null, isPrimary: true, isDecisionMaker: true, language: "FR", doNotContact: false, emailStatus: "valid" }],
  activities: [{ id: "a1", type: "DEMO", outcome: null, subject: null, body: null, occurredAt: "2026-10-18T14:00:00Z" }],
  tasks: [{ id: "t1", title: "Call back Marie", type: "CALL", dueAt: "2026-10-22T13:00:00Z", status: "OPEN" }],
  emails: [{ id: "e1", kind: "EMAIL_OUT", at: "2026-10-19T14:00:00Z", status: "SENT", subject: "Demo GarageOS" }],
  meetings: [], calls: [{ id: "k1", requestedAt: "2026-10-17T14:00:00Z", state: "COMPLETED", durationSec: 42, disposition: "CALL_BACK" }],
  needs: [], needDefinitions: [], lastDiscovery: { at: "2026-10-18T14:00:00Z", software: "Paper", painPoints: [], objections: ["NO_TIME"] },
};

const lockInput = { hasProspect: true, gateOpen: true, doNotContact: false, heldProvince: false, hasPhone: true };
function phone(locale: "en" | "fr", mode: Mode, phase: Phase, opts: { pending?: boolean; outcome?: ReactNode; nav?: ReactNode; hold?: { held?: boolean; busy?: boolean; enabled?: boolean } } = {}) {
  const c = callingCopy(locale);
  const locks = deriveLocks({ ...lockInput, phase, dispoPending: !!opts.pending });
  return renderToStaticMarkup(createElement(FloatingSoftphone, {
    c, mode, onMode: () => undefined, dockedLeftOfDrawer: false, phase, muted: false, seconds: 75, label: profile.name, number: profile.phone, locks,
    callBlockedText: locks.callReason ? c.ws.phone[locks.callReason] : null, error: null, notice: null, today: { placed: 3, cap: 80 },
    mics: [{ deviceId: "m1", label: "Headset" }], micId: "", onPickMic: () => undefined, onCall: () => undefined, onHangUp: () => undefined, onToggleMute: () => undefined, onDismiss: null,
    outcome: opts.outcome ?? null, saved: null, nav: opts.nav ?? null,
    hold: { held: opts.hold?.held ?? false, busy: opts.hold?.busy ?? false, enabled: opts.hold?.enabled ?? true, reason: opts.hold?.enabled === false ? c.ws.phoneUi.holdOff : null, onToggle: () => undefined },
  }));
}
const visible = (html: string) => html.replace(/<div class="hidden">[\s\S]*$/, ""); // the expanded body is the last block; "hidden" in other modes
const button = (html: string, text: string) => (html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${text}(?:(?!</button>).)*</button>`)) ?? [""])[0];

test("expanded phone: Call, microphone selector, number, daily counter and navigation slot", () => {
  const html = phone("en", "expanded", "idle", { nav: createElement("p", null, "NAV-SLOT") });
  assert.ok(button(html, "<span>Call</span>"), "call button");
  assert.doesNotMatch(button(html, "<span>Call</span>"), /disabled=""/, "call enabled");
  assert.ok(html.includes("Microphone") && html.includes("Headset"));
  assert.ok(html.includes("+1 514 555 0100"));
  assert.ok(html.includes("Calls in the last 24 h: 3 / 80"));
  assert.ok(html.includes("NAV-SLOT"));
  assert.ok(html.includes('aria-label="Softphone"'));
  assert.ok(html.includes("Compact phone") && html.includes("Minimize phone"));
});

test("compact phone during a call: name, status + timer, Mute and Hang up, expand/minimize", () => {
  const html = visible(phone("en", "compact", "connected"));
  assert.ok(html.includes("Garage Tremblay") && html.includes("Connected") && html.includes("01:15"));
  assert.ok(html.includes("<span>Mute</span>") && html.includes("<span>Hang up</span>"));
  assert.ok(html.includes("Expand phone") && html.includes("Minimize phone"));
  assert.ok(!html.includes("<span>Call</span>"));
});

test("minimized phone: small bar with name, timer, expand button; Hang up stays reachable during a call", () => {
  const html = visible(phone("en", "minimized", "connected"));
  assert.ok(html.includes("Garage Tremblay") && html.includes("01:15") && html.includes("Expand phone"));
  assert.ok(html.includes("<span>Hang up</span>"));
  assert.ok(!html.includes("<span>Mute</span>") && !html.includes("Microphone"));
});

test("minimized phone shows the pending-outcome warning", () => {
  for (const loc of ["en", "fr"] as const) {
    const html = visible(phone(loc, "minimized", "ended", { pending: true }));
    assert.ok(html.includes(callingCopy(loc).ws.phoneUi.outcomeRequired), loc);
  }
});

test("no Transfer / Conference / Recording control or copy in the softphone (EN and FR) — Hold is the only extra control", () => {
  for (const mode of ["expanded", "compact", "minimized"] as const) {
    for (const phase of ["idle", "connected", "ended"] as const) {
      assert.doesNotMatch(phone("en", mode, phase, { pending: phase === "ended" }), /\b(transfer|conference|record(ing)?)\b/i, `${mode}/${phase}`);
      assert.doesNotMatch(phone("fr", mode, phase, { pending: phase === "ended" }), /\b(transf[ée]r|conf[ée]rence|enregistrement d)/i, `fr ${mode}/${phase}`);
    }
  }
});

test("hold: a real Hold/Resume control only while connected and not minimized; held state is announced; disabled with its reason when unavailable; never confused with Mute", () => {
  for (const mode of ["expanded", "compact"] as const) {
    const live = phone("en", mode, "connected");
    assert.match(live, />Hold</); assert.match(live, />Mute</);
    assert.match(phone("en", mode, "connected", { hold: { held: true } }), />Resume</);
    assert.match(phone("en", mode, "connected", { hold: { held: true } }), /On hold/);
    assert.match(phone("fr", mode, "connected", { hold: { held: true } }), /Reprendre/);
    assert.match(phone("en", mode, "connected", { hold: { enabled: false } }), /disabled=""[^>]*aria-pressed="false"[^>]*>(?:(?!<\/button>)[\s\S])*Hold/);
    assert.doesNotMatch(phone("en", mode, "idle"), />Hold</, "no hold control without a live call");
  }
  assert.doesNotMatch(phone("en", "minimized", "connected"), />Hold</);
  assert.match(phone("en", "expanded", "connected", { hold: { enabled: false } }), /Hold is not enabled yet/);
});

test("pending outcome: the disposition form renders INSIDE the phone, Call and Next prospect are disabled", () => {
  const c = callingCopy("en");
  const outcome = createElement(DispositionPanel, { c, dispo: { sessionId: "s1", prospectId: "p1", name: "Garage Tremblay", settling: false }, liveNotes: "Asked for demo", flags: { demoSent: true, meetingScheduled: false }, preset: null, onSaved: () => undefined });
  const nav = createElement(NextProspect, { c, locale: "en", profile, meta: null, empty: null, loading: false, disabledReason: c.ws.next.blockedDispo, onNext: () => undefined, shownCount: 1, onBack: null, onForward: null });
  const html = phone("en", "expanded", "ended", { pending: true, outcome, nav });
  const aside = html.slice(html.indexOf("<aside"), html.lastIndexOf("</aside>"));
  assert.ok(aside.includes('id="dispo-title"'), "outcome form inside the phone");
  for (const o of Object.values(c.disposition.outcomes)) assert.ok(aside.includes(o), o);
  assert.ok(aside.includes(c.ws.phoneUi.outcomeBanner));
  assert.ok(aside.includes("Asked for demo"), "live notes prefill");
  assert.match(button(aside, "<span>Call</span>"), /disabled=""/);
  assert.match(button(aside, "Next prospect →"), /disabled=""/);
  assert.ok(aside.includes(c.ws.next.blockedDispo));
  // Minimized keeps the form mounted (hidden) so nothing typed is lost.
  const min = phone("en", "minimized", "ended", { pending: true, outcome, nav });
  assert.ok(min.includes('id="dispo-title"') && min.includes('<div class="hidden">'));
});

test("conversation tablist: roles, aria-selected and roving tabindex; panels stay mounted", () => {
  const tabs = [{ id: "guide", label: "Call guide" }, { id: "notes", label: "Notes" }, { id: "discovery", label: "Discovery" }, { id: "history", label: "History" }];
  const html = renderToStaticMarkup(createElement("div", null,
    createElement(WorkspaceTabs, { label: "Conversation workspace", idPrefix: "convo", tabs, active: "notes", onChange: () => undefined }),
    ...tabs.map((t) => createElement(TabPanel, { key: t.id, idPrefix: "convo", id: t.id, active: t.id === "notes" }, `PANEL-${t.id}`))));
  assert.equal((html.match(/role="tablist"/g) ?? []).length, 1);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 4);
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.equal((html.match(/tabindex="-1"/g) ?? []).length, 3);
  assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 4);
  for (const t of tabs) assert.ok(html.includes(`PANEL-${t.id}`), t.id);
  assert.ok(html.includes('aria-controls="convo-panel-notes"') && html.includes('aria-labelledby="convo-tab-notes"'));
});

test("call guide: five stages in EN and FR, a Copy button per phrase, language toggle, discovery highlights", () => {
  for (const loc of ["en", "fr"] as const) {
    const c = callingCopy(loc);
    const html = renderToStaticMarkup(createElement(CallGuide, { c, locale: loc, prospectLanguage: null, software: "Paper", objections: ["NO_TIME"] }));
    assert.equal(GUIDE_STAGES.length, 5);
    for (const s of GUIDE_STAGES) assert.ok(html.includes(c.ws.guide.stages[s]), `${loc} ${s}`);
    const phrases = GUIDE_STAGES.reduce((n, s) => n + Object.keys(c.ws.guide.content[s].items).length, 0);
    assert.equal((html.match(new RegExp(`>${c.ws.guide.copy}<`, "g")) ?? []).length, phrases, `${loc} copy buttons`);
    assert.ok(html.includes(c.ws.guide.content.opening.items.intro.text));
    assert.ok(html.includes(c.ws.guide.mentioned) && html.includes("Paper"));
    assert.ok(html.includes('aria-pressed="true"') && html.includes('role="group"'));
  }
  // The prospect's preferred language drives the wording even with an English UI.
  const html = renderToStaticMarkup(createElement(CallGuide, { c: callingCopy("en"), locale: "en", prospectLanguage: "FR", software: null, objections: [] }));
  assert.ok(html.includes(callingCopy("fr").ws.guide.content.opening.items.intro.text));
  assert.ok(html.includes(callingCopy("en").ws.guide.stages.opening));
});

test("prospect header: local time, calling-window badge, stage, language, qualification and contact indicators (EN/FR)", () => {
  for (const loc of ["en", "fr"] as const) {
    const c = callingCopy(loc);
    const html = renderToStaticMarkup(createElement(ProspectHeader, { c, locale: loc, profile, warning: null }));
    assert.ok(html.includes("Garage Tremblay") && html.includes("Laval, QC"));
    assert.ok(html.includes("10:15"), "local time");
    assert.ok(html.includes(c.ws.profile.window.open), "window badge");
    assert.ok(html.includes(loc === "fr" ? "Contacté" : "Contacted"), "stage");
    assert.ok(html.includes(c.ws.profile.repairFits.VERIFIED_REPAIR));
    assert.ok(html.includes(c.ws.header.dmKnown) && html.includes(c.ws.header.emailKnown) && html.includes(c.ws.header.basisValid));
  }
  const locked = renderToStaticMarkup(createElement(ProspectHeader, { c: callingCopy("en"), locale: "en", profile: null, warning: createElement("p", null, "Calling locked: test") }));
  assert.ok(locked.includes("Calling locked: test") && locked.includes(callingCopy("en").ws.header.none));
});

test("history is built only from the profile, newest first, with demos labelled", () => {
  const c = callingCopy("en");
  const items = buildHistory(profile, c, "en");
  assert.deepEqual(items.map((i) => i.kind), ["TASK", "EMAIL", "DEMO", "CALL"]);
  const html = renderToStaticMarkup(createElement(HistoryList, { c, locale: "en", timezone: "America/Toronto", profile }));
  assert.ok(html.includes("Demo GarageOS") && html.includes("Call back Marie") && html.includes(c.disposition.outcomes.CALL_BACK));
});

test("EN and FR copy keep the same keys for every command-center string", () => {
  const keys = (o: unknown, p = ""): string[] => (o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => keys(v, `${p}${k}.`)) : [p]);
  assert.deepEqual(keys(callingCopy("fr").ws).sort(), keys(callingCopy("en").ws).sort());
});
