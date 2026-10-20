"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reconcileCall, type CallingPageData } from "@/actions/sales-calling";
import { getEmailContext, getNextProspect, getProspectProfile } from "@/actions/sales-workspace";
import { callingCopy } from "@/lib/admin-locale/sales-calling";
import type { EmailComposeContext, WorkspaceProfile } from "@/lib/voice/workspace-types";
import { PLATFORM } from "@/lib/routes";
import { btnPrimary, btnSecondary } from "@/components/sales-crm/ui";
import { useSoftphone } from "./useSoftphone";
import { deriveLocks, effectiveMode, type DisplayMode } from "./softphone-model";
import { FloatingSoftphone } from "./FloatingSoftphone";
import { NextProspect, type NextEmpty, type NextMeta } from "./NextProspect";
import { ProspectHeader } from "./ProspectHeader";
import { ProspectPanel } from "./ProspectPanel";
import { DispositionPanel, type CallFlags, type DispoPreset } from "./DispositionPanel";
import { DiscoveryPanel } from "./DiscoveryPanel";
import { EmailCapture } from "./EmailCapture";
import { ActionsPanel } from "./ActionsPanel";
import { TestCallPanel } from "./TestCallPanel";
import { CallGuide } from "./CallGuide";
import { LiveNotes } from "./LiveNotes";
import { HistoryList } from "./HistoryList";
import { TabPanel, WorkspaceTabs } from "./WorkspaceTabs";
import { OutOfHoursDialog } from "./OutOfHoursDialog";
import { EmailDrawer, type EmailDrawerHandle, type InsertKind } from "./EmailDrawer";
import { clearNotes, setPreferredMode, ToastView, useLiveNotes, usePreferredMode, wsError, type Toast } from "./shared";

type Section = "prospect" | "conversation" | "actions";
type Convo = "guide" | "notes" | "discovery" | "history";
const NO_FLAGS: CallFlags = { demoSent: false, meetingScheduled: false };
const PAD: Record<DisplayMode, string> = { expanded: "lg:pb-[30rem]", compact: "lg:pb-24", minimized: "lg:pb-20" };

/**
 * Sales Command Center. This component owns the ONE softphone (useSoftphone) and is never unmounted while the seller switches sections, tabs, phone
 * display modes or the email drawer: everything is hidden with CSS, never conditionally unmounted, so a live call survives every UI change. Loading a
 * prospect never dials.
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
  const [trail, setTrail] = useState<string[]>(data.resumeProfile ? [data.resumeProfile.id] : []);
  const [pos, setPos] = useState(data.resumeProfile ? 0 : -1);
  const [confirmOut, setConfirmOut] = useState(false);
  const [emailDirty, setEmailDirty] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [flags, setFlags] = useState<CallFlags>(NO_FLAGS);
  const [preset, setPreset] = useState<DispoPreset>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [saved, setSaved] = useState(false);
  const [section, setSection] = useState<Section>("conversation");
  const [convo, setConvo] = useState<Convo>("guide");
  const [sessionMode, setSessionMode] = useState<DisplayMode | null>(pd ? "expanded" : null);
  const [demoLinks, setDemoLinks] = useState<EmailComposeContext["demoLinks"] | null>(null);
  const [openCallShown, setOpenCallShown] = useState(!!data.openCall);
  const [testNumber, setTestNumber] = useState(data.testNumbers[0]?.value ?? "");
  const [reconciling, startReconcile] = useTransition();
  const drawer = useRef<EmailDrawerHandle>(null);
  const notes = useLiveNotes(profile?.id ?? null);
  const notesDirty = notes.trim().length > 0;
  const mode = effectiveMode(usePreferredMode(), sessionMode);

  // A pending outcome discovered on a server refresh (e.g. after "Check and close") is restored, with its prospect (render-time adjustment, no effect).
  const [seenPending, setSeenPending] = useState(pd?.sessionId ?? null);
  if ((pd?.sessionId ?? null) !== seenPending) {
    setSeenPending(pd?.sessionId ?? null);
    if (pd && !sp.dispo && !sp.callActive) {
      sp.setDispo({ sessionId: pd.sessionId, prospectId: pd.prospectId, name: pd.prospectName, settling: false });
      if (data.resumeProfile && data.resumeProfile.id !== profile?.id) setProfile(data.resumeProfile);
    }
  }
  // When a call ends and needs an outcome, the phone auto-expands to show the outcome form (the seller may minimize it again; fields are kept).
  const dispoId = sp.dispo?.sessionId ?? null;
  const [seenDispo, setSeenDispo] = useState(dispoId);
  if (dispoId !== seenDispo) {
    setSeenDispo(dispoId);
    if (dispoId) { setSessionMode("expanded"); setSaved(false); }
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

  function switched(p: WorkspaceProfile) {
    setProfile(p);
    setFlags(NO_FLAGS); setPreset(null); setEmailDirty(false); setDrawerOpen(false); setSaved(false);
    if (!sp.callActive && !sp.dispo && (sp.phase === "ended" || sp.phase === "failed" || sp.error)) sp.reset();
  }

  async function loadNext() {
    if (sp.callActive || sp.dispo || loadingNext) return;
    if ((notesDirty || emailDirty) && !window.confirm(c.ws.next.confirmReplace)) return;
    setLoadingNext(true); setToast(null);
    try {
      const r = await getNextProspect({ lastProvince: profile?.province ?? null, excludeIds: shown.slice(-50), includeClosed: true });
      if (!r.ok) { setToast({ kind: "error", text: wsError(c, locale, r.code) }); if (r.code === "DISPOSITION_PENDING") router.refresh(); return; }
      if (!r.found) { setEmpty({ reason: r.reason, nextWindow: r.nextWindow }); setMeta(null); return; }
      switched(r.profile);
      setMeta({ source: r.source, province: r.province, provincePool: r.provincePool, outsideHours: r.outsideHours });
      const t = [...trail.slice(0, pos + 1).filter((x) => x !== r.profile.id), r.profile.id];
      setTrail(t); setPos(t.length - 1);
      setEmpty(null);
      setShown((s) => [...s.filter((x) => x !== r.profile.id), r.profile.id]);
    } catch {
      setToast({ kind: "error", text: c.unexpected });
    } finally {
      setLoadingNext(false);
    }
  }

  /** Browse the prospects already opened (any hour): reads the profile only, never dials. */
  async function go(delta: -1 | 1) {
    const id = trail[pos + delta];
    if (!id || sp.callActive || sp.dispo || loadingNext) return;
    if ((notesDirty || emailDirty) && !window.confirm(c.ws.next.confirmReplace)) return;
    setLoadingNext(true); setToast(null);
    try {
      const r = await getProspectProfile(id);
      if (!r.ok) { setToast({ kind: "error", text: wsError(c, locale, r.code) }); return; }
      switched(r.profile); setMeta(null); setEmpty(null); setPos(pos + delta);
    } catch {
      setToast({ kind: "error", text: c.unexpected });
    } finally {
      setLoadingNext(false);
    }
  }

  function placeCall(confirmOutOfHours: boolean) {
    if (!profile) return;
    setConfirmOut(false); setSaved(false);
    void sp.start({ kind: "PROSPECT", id: profile.id, name: profile.name, confirmOutOfHours });
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
  const changeMode = (m: DisplayMode) => { setPreferredMode(m); setSessionMode(null); };

  const held = !!profile?.province && gates.heldProvinces.includes(profile.province.toUpperCase());
  const locks = deriveLocks({ phase: sp.phase, hasProspect: !!profile, dispoPending: !!sp.dispo, gateOpen: gates.commercialCallingOpen, doNotContact: !!profile?.doNotContact, heldProvince: held, hasPhone: !!profile?.phone });
  const callBlockedText = locks.callReason ? c.ws.phone[locks.callReason] : null;
  const nextBlocked = locks.nextReason ? c.ws.next[locks.nextReason] : null;
  const gateLines = [!gates.enabled && c.gates.disabled, gates.enabled && !gates.provisioned && c.gates.notProvisioned, !gates.dnclRegistered && c.gates.dncl, !gates.liveCallingAuthorized && c.gates.notAuthorized].filter((x): x is string => !!x);
  const warning = !gates.commercialCallingOpen ? (
    <p>{c.ws.header.locked} {gateLines.join(" · ")}{data.isSuperAdmin && <> · <Link href={PLATFORM.salesVoiceSettings} className="inline-flex min-h-6 items-center text-blue-700 underline">{c.gates.settingsLink}</Link></>}</p>
  ) : profile && held ? <p>{c.ws.phone.held}</p> : null;
  const showSection = (s: Section) => (section === s ? "" : "hidden lg:block");
  const isTestLabel = !!sp.session && sp.session !== profile?.name && sp.phase !== "idle";
  const sections: [Section, string][] = [["prospect", c.ws.tabs.prospect], ["conversation", c.ws.tabs.conversation], ["actions", c.ws.tabs.actions]];
  const convoTabs = [{ id: "guide", label: c.ws.convo.guide }, { id: "notes", label: c.ws.convo.notes, badge: notesDirty ? <span aria-hidden="true">•</span> : undefined }, { id: "discovery", label: c.ws.convo.discovery }, { id: "history", label: c.ws.convo.history }];

  return (
    <div className={`min-w-0 space-y-3 pb-28 ${PAD[mode]}`}>
      <ProspectHeader c={c} locale={locale} profile={profile} warning={warning} />
      {data.openCall && openCallShown && !sp.callActive && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <p>{c.softphone.openCall.replace("{state}", data.openCall.state)}</p>
          <button type="button" className={btnSecondary} disabled={reconciling} onClick={reconcileOpen}>{c.softphone.reconcile}</button>
        </div>
      )}

      {/* Below lg: one section at a time (all stay mounted); the softphone bar stays at the bottom of every section. */}
      <nav aria-label={c.ws.tabs.label} className="sticky top-0 z-30 -mx-1 bg-slate-50/95 px-1 py-1 backdrop-blur lg:hidden">
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {sections.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={section === k} aria-controls={`ws-${k}`} onClick={() => setSection(k)}
              className={`min-h-11 rounded-lg px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 ${section === k ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{label}</button>
          ))}
        </div>
      </nav>

      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,16rem)] lg:items-start xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_minmax(0,19rem)] 2xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)_minmax(0,21rem)]">
        <div id="ws-prospect" className={`min-w-0 ${showSection("prospect")}`}>
          <ProspectPanel key={profile?.id ?? "none"} profile={profile} c={c} locale={locale} timezone={data.timezone} canEdit={data.can.editProspects} onChanged={() => reloadProfile()} notify={setToast}
            onShowHistory={() => { setConvo("history"); setSection("conversation"); }} />
        </div>

        <section id="ws-conversation" aria-label={c.ws.convo.label} className={`min-w-0 space-y-3 ${showSection("conversation")}`}>
          <WorkspaceTabs label={c.ws.convo.label} idPrefix="convo" tabs={convoTabs} active={convo} onChange={(id) => setConvo(id as Convo)} />
          <TabPanel idPrefix="convo" id="guide" active={convo === "guide"} className="rounded-xl border border-slate-200 bg-white p-4">
            <CallGuide key={profile?.id ?? "none"} c={c} locale={locale} prospectLanguage={profile?.language ?? null} software={profile?.currentSoftware ?? profile?.lastDiscovery?.software ?? null} objections={profile?.lastDiscovery?.objections ?? []} />
          </TabPanel>
          <TabPanel idPrefix="convo" id="notes" active={convo === "notes"} className="rounded-xl border border-slate-200 bg-white p-4">
            <LiveNotes c={c} prospectId={profile?.id ?? null} notes={notes} />
          </TabPanel>
          <TabPanel idPrefix="convo" id="discovery" active={convo === "discovery"} className="space-y-3">
            {profile ? (
              <>
                <DiscoveryPanel key={`d-${profile.id}`} c={c} locale={locale} profile={profile} sessionId={sp.sessionId} canEdit={data.can.editProspects} notify={setToast} onSaved={() => reloadProfile()} />
                {!profile.doNotContact && (
                  <EmailCapture key={`e-${profile.id}`} c={c} locale={locale} profile={profile} sessionId={sp.sessionId} canEdit={data.can.editProspects} canEmail={data.can.email}
                    onCaptured={() => { reloadProfile(); drawer.current?.refresh(); }} onOpenEmail={(id) => openEmail(null, id)} />
                )}
              </>
            ) : <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{c.ws.phone.noProspect}</p>}
          </TabPanel>
          <TabPanel idPrefix="convo" id="history" active={convo === "history"} className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-base font-semibold text-slate-900">{c.ws.history.title}</h2>
            <HistoryList c={c} locale={locale} timezone={data.timezone} profile={profile} />
          </TabPanel>
        </section>

        <div id="ws-actions" className={`min-w-0 space-y-3 ${showSection("actions")}`}>
          <ActionsPanel c={c} locale={locale} profile={profile} can={data.can} demoLinks={demoLinks} timezone={data.timezone} notify={setToast}
            onEmail={(k) => openEmail(k)} onChanged={() => reloadProfile()}
            onInterested={() => setPreset({ outcome: "INTERESTED", nonce: (preset?.nonce ?? 0) + 1 })}
            onDnc={(note) => setPreset({ outcome: "DO_NOT_CALL", note, nonce: (preset?.nonce ?? 0) + 1 })}
            onMeeting={() => setFlags((f) => ({ ...f, meetingScheduled: true }))} />
          {data.isSuperAdmin && (
            <TestCallPanel c={c} gateOpen={gates.enabled && gates.provisioned} numbers={data.testNumbers} value={testNumber} onChange={setTestNumber} locked={sp.locked}
              onCall={() => void sp.start({ kind: "TEST", number: testNumber })} />
          )}
        </div>
      </div>

      {profile && data.can.email && (
        <EmailDrawer key={profile.id} ref={drawer} c={c} locale={locale} prospectId={profile.id} prospectName={profile.name} sp={sp} onOpenChange={setDrawerOpen}
          onDirtyChange={setEmailDirty} onDemoSent={() => setFlags((f) => ({ ...f, demoSent: true }))} notify={setToast} />
      )}

      <FloatingSoftphone
        c={c} mode={mode} onMode={changeMode} dockedLeftOfDrawer={drawerOpen}
        phase={sp.phase} muted={sp.muted} seconds={sp.seconds} label={sp.phase !== "idle" && sp.session ? sp.session : profile?.name ?? null}
        number={isTestLabel ? sp.session : profile?.phone ?? null} locks={locks} callBlockedText={callBlockedText}
        error={sp.error} notice={sp.notice} today={data.today}
        mics={sp.mics.map((m) => ({ deviceId: m.deviceId, label: m.label }))} micId={sp.micId} onPickMic={sp.pickMic}
        onCall={() => { if (!profile || locks.callLocked) return; if (!profile.window.open) setConfirmOut(true); else placeCall(false); }}
        hold={{ held: sp.hold === "HELD", busy: sp.holdBusy || sp.hold === "HOLDING" || sp.hold === "RESUMING", enabled: sp.holdAvail, reason: sp.holdAvail ? null : gates.holdEnabled ? c.ws.phoneUi.holdDirect : c.ws.phoneUi.holdOff, onToggle: () => void sp.toggleHold() }}
        onHangUp={sp.hangUp} onToggleMute={sp.toggleMute} onDismiss={(sp.phase === "failed" || sp.phase === "ended") && !sp.dispo ? sp.reset : null}
        outcome={sp.dispo ? <DispositionPanel key={sp.dispo.sessionId} c={c} dispo={sp.dispo} liveNotes={sp.dispo.prospectId === profile?.id ? notes : ""} flags={flags} preset={preset} onSaved={onDispoSaved} /> : null}
        saved={saved && !sp.dispo ? (
          <div role="status" className="space-y-2 rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 text-sm text-emerald-900">
            <p className="font-medium">✓ {c.disposition.savedNext}</p>
            <button type="button" className={`${btnPrimary} w-full`} disabled={loadingNext} onClick={() => void loadNext()}>{c.disposition.nextProspect} →</button>
          </div>
        ) : null}
        nav={<NextProspect c={c} locale={locale} profile={profile} meta={meta} empty={empty} loading={loadingNext} disabledReason={nextBlocked} onNext={() => void loadNext()} shownCount={shown.length}
          onBack={pos > 0 ? () => void go(-1) : null} onForward={pos >= 0 && pos < trail.length - 1 ? () => void go(1) : null} />}
      />

      {confirmOut && profile && <OutOfHoursDialog c={c} profile={profile} allowed={gates.allowOutOfHours} onCancel={() => setConfirmOut(false)} onConfirm={() => placeCall(true)} />}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 top-4 z-[55] sm:left-auto sm:w-96">
        {toast && <div className="pointer-events-auto shadow-lg"><ToastView toast={toast} onClose={() => setToast(null)} closeLabel={c.ws.toastClose} /></div>}
      </div>
    </div>
  );
}
