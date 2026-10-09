"use client";

import { useState } from "react";
import { enrollProspect, pauseEnrollmentAction, resumeEnrollmentAction, stopEnrollmentAction } from "@/actions/sales-sequences";
import { btnPrimary, btnSecondary, btnDanger, inputCls } from "@/components/sales-crm/ui";
import { Msg, useComms } from "@/components/sales-comms/useComms";

export function EnrollmentActions({ locale, id, status }: { locale: "en" | "fr"; id: string; status: string }) {
  const { t, pending, error, run } = useComms(locale);
  if (status !== "ACTIVE" && status !== "PAUSED") return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "ACTIVE" ? <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => pauseEnrollmentAction(id))}>{t.outreach.pauseEnrollment}</button>
        : <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => resumeEnrollmentAction(id))}>{t.outreach.resume}</button>}
      <button type="button" className={btnDanger} disabled={pending} onClick={() => run(() => stopEnrollmentAction(id))}>{t.outreach.stop}</button>
      <Msg error={error} />
    </div>
  );
}

export function EnrollForm({ locale, prospectId, contacts, sequences, defaultLanguageKnown }: { locale: "en" | "fr"; prospectId: string; contacts: { id: string; name: string }[]; sequences: { id: string; name: string }[]; defaultLanguageKnown: boolean }) {
  const { t, pending, error, notice, run } = useComms(locale);
  const [seq, setSeq] = useState(sequences[0]?.id ?? "");
  const [contact, setContact] = useState(contacts[0]?.id ?? "");
  const [lang, setLang] = useState("");
  if (sequences.length === 0) return <p className="text-sm text-slate-500">{t.outreach.noSequencesHint}</p>;
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(); fd.set("sequenceId", seq); fd.set("prospectId", prospectId); fd.set("contactId", contact); fd.set("languageOverride", lang); run(() => enrollProspect(fd), undefined, t.outreach.enrolled); }}>
      <select className={inputCls} value={seq} onChange={(e) => setSeq(e.target.value)} aria-label={t.outreach.chooseSequence}>{sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select className={inputCls} value={contact} onChange={(e) => setContact(e.target.value)} aria-label={t.outreach.pickContact}>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      {!defaultLanguageKnown && (
        <select className={inputCls} value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t.composer.language}>
          <option value="">{t.composer.languageNeeded}</option><option value="EN">{t.common.english}</option><option value="FR">{t.common.french}</option>
        </select>
      )}
      <Msg error={error} notice={notice} />
      <button className={btnPrimary} disabled={pending || !seq || !contact}>{t.outreach.enrollHere}</button>
    </form>
  );
}
