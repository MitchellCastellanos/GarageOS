"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reconcileCall, type CallingPageData } from "@/actions/sales-calling";
import { getEmailContext, getNextProspect, getProspectProfile } from "@/actions/sales-workspace";
import { callingCopy } from "@/lib/admin-locale/sales-calling";
import type { EmailComposeContext, WorkspaceProfile } from "@/lib/voice/workspace-types";
import { PLATFORM } from "@/lib/routes";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { useSoftphone, clock } from "./useSoftphone";
import { CallPanel, CallScript, LiveNotes } from "./CallPanel";
import { NextProspect, type NextEmpty, type NextMeta } from "./NextProspect";
import { ProspectPanel } from "./ProspectPanel";
import { DispositionPanel, type CallFlags, type DispoPreset } from "./DispositionPanel";
import { DiscoveryPanel } from "./DiscoveryPanel";
import { EmailCapture } from "./EmailCapture";
import { ActionsPanel } from "./ActionsPanel";
import { EmailDrawer, type EmailDrawerHandle, type InsertKind } from "./EmailDrawer";
import { clearNotes, ToastView, useLiveNotes, wsError, type Toast } from "./shared";

type Tab = "call" | "prospect" | "actions";
const NO_FLAGS: CallFlags = { demoSent: false, meetingScheduled: false };

/**
 * Sales Calling Workspace. This component owns the ONE softphone (useSoftphone) and is never unmounted while the seller switches tabs, panels or the
 * email drawer: panels are hidden with CSS, never conditionally unmounted, so a live call survives every UI change. Loading a prospect never dials.
 */
export function CallingWorkspace({ data, locale }: { data: CallingPageData; locale: "en" | "fr" }) {
  const c = callingCopy(locale);
  const router = useRouter();
  const { gates } = data;
  const pd = data.pendingDisposition;
  const sp = useSoftphone(c, pd ? { sessionId: pd.sessionId, prospectId: pd.prospectId, name: pd.prospectName, settling: false } : null);
  const [profile, setProfile] = useState<WorkspaceProfile | null>(data.resumeProfile);
  const [meta, setMeta] = useState<NextMeta>(null);
  const [empty, setEmpty] = useState<NextEmpty>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const [shown, setShown] = useState<string[]>(data.resumeProfile ? [data.resumeProfile.id] : []);
  const [emailDirty, setEmailDirty] = useState(false);
  const [flags, setFlags] = useState<CallFlags>(NO_FLAGS);
  const [preset, setPreset] = useState<DispoPreset>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>("call");
  const [demoLinks, setDemoLinks] = useState<EmailComposeContext["demoLinks"] | null>(null);
  const [openCallShown, setOpenCallShown] = useState(!!data.openCall);
  const [testNumber, setTestNumber] = useState(data.testNumbers[0]?.value ?? "");
  const [reconciling, startReconcile] = useTransition();
  const drawer = useRef<EmailDrawerHandle>(null);
  const notes = useLiveNotes(profile?.id ?? null);
  const notesDirty = notes.trim().length > 0;

  // A pending outcome discovered on a server refresh (e.g. after "Check and close") is restored, with its prospect (render-time adjustment, no effect).
  const [seenPending, setSeenPending] = useState(pd?.sessionId ?? null);
  if ((pd?.sessionId ?? null) !== seenPending) {
    setSeenPending(pd?.sessionId ?? null);
    if (pd && !sp.dispo && !sp.callActive) {
      sp.setDispo({ sessionId: pd.sessionId, prospectId: pd.prospectId, name: pd.prospectName, settling: false });
      if (data.resumeProfile && data.resumeProfile.id !== profile?.id) setProfile(data.resumeProfile);
    }
  }
  // When a call ends and needs an outcome, bring the Call section forward on small screens.
  const dispoId = sp.dispo?.sessionId ?? null;
  const [seenDispo, setSeenDispo] = useState(dispoId);
  if (dispoId !== seenDispo) {
    setSeenDispo(dispoId);
    if (dispoId) { setTab("call"); setSaved(false); }
  }

  // Unsaved work: a live call, live notes, an unsent email draft or an outcome still to record.
  const warn = sp.isLive || notesDirty || emailDirty || !!sp.dispo;
  useEffect(() => {
    if (!warn) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [warn]);

  // The real public demo URLs come only from the server's email context (no anchors are invented).
  const profileId = profile?.id ?? null;
  useEffect(() => {
    if (!data.can.email || demoLinks || !profileId) return;
    let alive = true;
    getEmailContext(profileId).then((r) => { if (alive && r.ok) setDemoLinks(r.context.demoLinks); }).catch(() => undefined);
    return () => { alive = false; };
  }, [data.can.email, demoLinks, profileId]);

  function reloadProfile(id = profile?.id) {
    if (!id) return;
    getProspectProfile(id).then((r) => {
      if (r.ok) setProfile((cur) => (cur && cur.id === r.profile.id ? r.profile : cur));
      else setToast({ kind: "error", text: wsError(c, locale, r.code) });
    }).catch(() => setToast({ kind: "error", text: c.unexpected }));
  }

  async function loadNext() {
    if (sp.callActive || sp.dispo || loadingNext) return;
    if ((notesDirty || emailDirty) && !window.confirm(c.ws.next.confirmReplace)) return;
    setLoadingNext(true); setToast(null);
    try {
      const r = await getNextProspect({ lastProvince: profile?.province ?? null, excludeIds: shown.slice(-50) });
      if (!r.ok) { setToast({ kind: "error", text: wsError(c, locale, r.code) }); if (r.code === "DISPOSITION_PENDING") router.refresh(); return; }
      if (!r.found) { setEmpty({ reason: r.reason, nextWindow: r.nextWindow }); setMeta(null); return; }
      setProfile(r.profile);
      setMeta({ source: r.source, province: r.province, provincePool: r.provincePool });
      setEmpty(null);
      setShown((s) => [...s.filter((x) => x !== r.profile.id), r.profile.id]);
      setFlags(NO_FLAGS); setPreset(null); setEmailDirty(false); setSaved(false);
      if (!sp.callActive && !sp.dispo && (sp.phase === "ended" || sp.phase === "failed" || sp.error)) sp.reset();
    } catch {
      setToast({ kind: "error", text: c.unexpected });
    } finally {
      setLoadingNext(false);
    }
  }

  function onDispoSaved() {
    const pid = sp.dispo?.prospectId ?? null;
    if (pid) clearNotes(pid);
    sp.reset();
    setFlags(NO_FLAGS); setPreset(null); setSaved(true);
    if (pid) reloadProfile(pid);
  }

  function reconcileOpen() {
    const open = data.openCall;
    if (!open) return;
    startReconcile(async () => {
      try { await reconcileCall(open.sessionId); sp.setNotice(c.softphone.reconciled); setOpenCallShown(false); router.refresh(); } catch { sp.setError(c.unexpected); }
    });
  }

  const openEmail = (insert: InsertKind | null, contactId?: string) => drawer.current?.open({ insert, contactId: contactId ?? null });

  const held = !!profile?.province && gates.heldProvinces.includes(profile.province.toUpperCase());
  const w = c.ws.phone;
  const callBlockedReason = !profile ? w.noProspect : sp.dispo ? w.pending : !gates.commercialCallingOpen ? w.gate : profile.doNotContact ? w.dnc : held ? w.held : !profile.phone ? w.noPhone : !profile.window.open ? w.window : null;
  const nextBlocked = sp.callActive ? c.ws.next.blockedLive : sp.dispo ? c.ws.next.blockedDispo : null;
  const gateLines = [!gates.enabled && c.gates.disabled, gates.enabled && !gates.provisioned && c.gates.notProvisioned, !gates.dnclRegistered && c.gates.dncl, !gates.liveCallingAuthorized && c.gates.notAuthorized].filter((x): x is string => !!x);
  const testGateOpen = gates.enabled && gates.provisioned;
  const show = (t: Tab) => (tab === t ? "" : "hidden lg:block");
  const tabs: [Tab, string][] = [["call", c.ws.tabs.call], ["prospect", c.ws.tabs.prospect], ["actions", c.ws.tabs.actions]];

  return (
    <div className="min-w-0 space-y-4">
      {!gates.commercialCallingOpen && (
        <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">{c.gates.lockedTitle}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">{gateLines.map((l) => <li key={l}>{l}</li>)}</ul>
          {data.isSuperAdmin && <Link href={PLATFORM.salesVoiceSettings} className="mt-2 inline-flex min-h-11 items-center font-medium text-blue-700 underline">{c.gates.settingsLink}</Link>}
        </div>
      )}
      {data.openCall && openCallShown && !sp.callActive && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-300 bg-sky-50 p-4 text-sm text-sky-900">
          <p>{c.softphone.openCall.replace("{state}", data.openCall.state)}</p>
          <button type="button" className={btnSecondary} disabled={reconciling} onClick={reconcileOpen}>{c.softphone.reconcile}</button>
        </div>
      )}

      {/* Small screens: one section at a time (all stay mounted). The live call stays reachable from every section. */}
      <nav aria-label={c.ws.tabs.label} className="sticky top-0 z-30 -mx-1 space-y-2 bg-slate-50/95 px-1 py-2 backdrop-blur lg:hidden">
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={tab === k} aria-controls={`ws-${k}`} onClick={() => setTab(k)}
              className={`min-h-11 rounded-lg px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 ${tab === k ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
              {label}{k === "call" && sp.dispo ? <span className="ml-1" aria-label={c.ws.tabs.outcomeDue}>!</span> : null}
            </button>
          ))}
        </div>
        {sp.isLive && tab !== "call" && (
          <div role="status" className="flex items-center justify-between gap-2 rounded-xl bg-emerald-700 px-3 py-1.5 text-sm text-white">
            <span>● {w.inCall} {clock(sp.seconds)}</span>
            <button type="button" className="inline-flex min-h-11 items-center rounded-lg bg-red-600 px-3 font-semibold hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-white" onClick={sp.hangUp}>{w.hangUpShort}</button>
          </div>
        )}
      </nav>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)_minmax(0,17rem)] lg:items-start xl:grid-cols-[minmax(0,23rem)_minmax(0,1fr)_minmax(0,20rem)] 2xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)_minmax(0,22rem)]">
        <div id="ws-prospect" className={`min-w-0 ${show("prospect")}`}>
          <ProspectPanel key={profile?.id ?? "none"} profile={profile} c={c} locale={locale} timezone={data.timezone} canEdit={data.can.editProspects} onChanged={() => reloadProfile()} notify={setToast} />
        </div>

        <div id="ws-call" className={`min-w-0 space-y-4 ${show("call")}`}>
          <CallPanel c={c} sp={sp} profile={profile} callBlockedReason={callBlockedReason} today={data.today}
            onCall={() => { if (profile && !callBlockedReason) { setSaved(false); void sp.start({ kind: "PROSPECT", id: profile.id, name: profile.name }); } }} />
          {sp.dispo && <DispositionPanel key={sp.dispo.sessionId} c={c} dispo={sp.dispo} liveNotes={sp.dispo.prospectId === profile?.id ? notes : ""} flags={flags} preset={preset} onSaved={onDispoSaved} />}
          {saved && !sp.dispo && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-medium">✓ {c.disposition.savedNext}</p>
              <button type="button" className={btnPrimary} disabled={loadingNext} onClick={() => void loadNext()}>{c.disposition.nextProspect} →</button>
            </div>
          )}
          <NextProspect c={c} locale={locale} profile={profile} meta={meta} empty={empty} loading={loadingNext} disabledReason={nextBlocked} onNext={() => void loadNext()} shownCount={shown.length} />
          <LiveNotes c={c} prospectId={profile?.id ?? null} notes={notes} />
          <CallScript c={c} />
          {profile && <DiscoveryPanel key={`d-${profile.id}`} c={c} locale={locale} profile={profile} sessionId={sp.sessionId} canEdit={data.can.editProspects} notify={setToast} onSaved={() => reloadProfile()} />}
          {profile && !profile.doNotContact && (
            <EmailCapture key={`e-${profile.id}`} c={c} locale={locale} profile={profile} sessionId={sp.sessionId} canEdit={data.can.editProspects} canEmail={data.can.email}
              onCaptured={() => { reloadProfile(); drawer.current?.refresh(); }} onOpenEmail={(id) => openEmail(null, id)} />
          )}
          {data.isSuperAdmin && (
            <section className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="test-title">
              <div><h2 id="test-title" className="text-base font-semibold text-slate-900">{c.test.title}</h2><p className="mt-1 text-sm text-slate-600">{c.test.hint}</p></div>
              {!testGateOpen ? <p className="text-sm text-amber-800">{c.test.needsGates}</p> : data.testNumbers.length === 0 ? <p className="text-sm text-slate-600">{c.test.none}</p> : (
                <div className="flex flex-wrap items-end gap-2">
                  <label className={`${labelCls} min-w-48 flex-1`}>{c.test.number}
                    <select className={inputCls} value={testNumber} onChange={(e) => setTestNumber(e.target.value)}>
                      {data.testNumbers.map((n) => <option key={n.value} value={n.value}>{n.masked}</option>)}
                    </select>
                  </label>
                  <button type="button" className={btnSecondary} disabled={sp.locked || !testNumber} onClick={() => void sp.start({ kind: "TEST", number: testNumber })}>{c.test.call}</button>
                </div>
              )}
            </section>
          )}
        </div>

        <div id="ws-actions" className={`min-w-0 ${show("actions")}`}>
          <ActionsPanel c={c} locale={locale} profile={profile} can={data.can} demoLinks={demoLinks} timezone={data.timezone} notify={setToast}
            onEmail={(k) => openEmail(k)} onChanged={() => reloadProfile()}
            onInterested={() => setPreset({ outcome: "INTERESTED", nonce: (preset?.nonce ?? 0) + 1 })}
            onDnc={(note) => setPreset({ outcome: "DO_NOT_CALL", note, nonce: (preset?.nonce ?? 0) + 1 })}
            onMeeting={() => setFlags((f) => ({ ...f, meetingScheduled: true }))} />
        </div>
      </div>

      {profile && data.can.email && (
        <EmailDrawer key={profile.id} ref={drawer} c={c} locale={locale} prospectId={profile.id} prospectName={profile.name} sp={sp}
          onDirtyChange={setEmailDirty} onDemoSent={() => setFlags((f) => ({ ...f, demoSent: true }))} notify={setToast} />
      )}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 sm:left-auto sm:w-96">
        {toast && <div className="pointer-events-auto shadow-lg"><ToastView toast={toast} onClose={() => setToast(null)} closeLabel={c.ws.toastClose} /></div>}
      </div>
    </div>
  );
}
