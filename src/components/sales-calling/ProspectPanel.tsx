"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { saveDecisionMaker } from "@/actions/sales-workspace";
import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import { crmCopy } from "@/lib/admin-locale/sales-crm";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import type { WorkspaceContact, WorkspaceProfile } from "@/lib/voice/workspace-types";
import { Badge, btnPrimary, btnSecondary, inputCls, labelCls, StageBadge } from "@/components/sales-crm/ui";
import { fill, fmtDateTime, wsError, type Locale, type Toast } from "./shared";

const OBJ = (c: CallingCopy) => c.ws.discovery.objectionCodes as Record<string, string>;

function Block({ title, children, empty, emptyText }: { title: string; children?: ReactNode; empty: boolean; emptyText: string }) {
  return (
    <div className="min-w-0 border-t border-slate-100 pt-3">
      <h3 className="mb-1.5 text-sm font-semibold text-slate-800">{title}</h3>
      {empty ? <p className="text-sm text-slate-500">{emptyText}</p> : children}
    </div>
  );
}

export function ProspectPanel({ profile, c, locale, timezone, canEdit, onChanged, notify }: {
  profile: WorkspaceProfile | null; c: CallingCopy; locale: Locale; timezone: string; canEdit: boolean; onChanged: () => void; notify: (t: Toast) => void;
}) {
  const p = c.ws.profile;
  const crm = crmCopy(locale);
  const comms = commsCopy(locale);
  const [editing, setEditing] = useState<string | "new" | null>(null);

  if (!profile) {
    return (
      <section aria-labelledby="profile-title" className="min-w-0 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
        <h2 id="profile-title" className="font-medium text-slate-800">{p.empty}</h2>
        <p className="mt-1 text-sm text-slate-500">{p.emptyHint}</p>
      </section>
    );
  }
  const w = profile.window;
  const defLabel = (id: string) => { const d = profile.needDefinitions.find((x) => x.id === id); return d ? (locale === "fr" ? d.labelFr : d.labelEn) : null; };
  const place = [profile.address, profile.city, profile.province, profile.postalCode].filter(Boolean).join(", ");
  const lang = (l: string) => crm.languages[l] ?? l;
  const none = p.none;

  return (
    <section aria-labelledby="profile-title" className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{p.title}</p>
          <h2 id="profile-title" className="break-words text-lg font-semibold text-slate-900">{profile.name}</h2>
        </div>
        <button type="button" className={`${btnSecondary} shrink-0 px-3`} onClick={onChanged} title={p.refresh} aria-label={p.refresh}>↻</button>
      </div>

      {profile.doNotContact && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">⛔ {p.dnc}</p>}

      <div className={`rounded-lg border px-3 py-2 text-sm ${w.open ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
        <p className="font-semibold"><span aria-hidden="true">{w.open ? "● " : "○ "}</span>{w.open ? p.window.open : p.window.closed}</p>
        <p>{p.window.reasons[w.reason] ?? w.reason}</p>
        {w.localTime && <p>{fill(p.window.localTime, { time: w.localTime })}{w.zone ? ` · ${fill(p.window.zone, { zone: w.zone })}` : ""}</p>}
        <p className="mt-1 text-xs opacity-80">{p.window.hoursNotRecorded}</p>
      </div>

      <dl className="grid gap-x-3 gap-y-1.5 text-sm [grid-template-columns:minmax(0,auto)_minmax(0,1fr)]">
        <dt className="text-slate-500">{p.phone}</dt><dd className="break-words font-medium text-slate-900">{profile.phone ?? p.notRecorded}</dd>
        <dt className="text-slate-500">{p.address}</dt><dd className="break-words text-slate-900">{place || p.notRecorded}</dd>
        <dt className="text-slate-500">{p.website}</dt>
        <dd className="min-w-0 break-all">{profile.website ? <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">{profile.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a> : <span className="text-slate-500">{p.notRecorded}</span>}</dd>
        {profile.mapsUrl && (<><dt className="text-slate-500">{p.maps}</dt><dd><a href={profile.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">{p.maps} ↗</a></dd></>)}
        <dt className="text-slate-500">{p.category}</dt><dd className="text-slate-900">{profile.industry ? crm.industries[profile.industry] ?? profile.industry : p.notRecorded}</dd>
        <dt className="text-slate-500">{p.repairFit}</dt><dd className="text-slate-900">{profile.repairFit ? p.repairFits[profile.repairFit] : p.notRecorded}</dd>
        {profile.shopSize && (<><dt className="text-slate-500">{p.shopSize}</dt><dd className="text-slate-900">{crm.shopSizes[profile.shopSize] ?? profile.shopSize}</dd></>)}
        {profile.locationCount > 1 && (<><dt className="text-slate-500">{p.locations}</dt><dd className="text-slate-900">{profile.locationCount}</dd></>)}
        <dt className="text-slate-500">{p.language}</dt>
        <dd className="text-slate-900">{lang(profile.language)}{profile.language === "UNKNOWN" && profile.languageSuggested !== "UNKNOWN" ? <span className="block text-xs text-slate-500">{fill(p.suggested, { lang: lang(profile.languageSuggested) })}</span> : null}</dd>
        <dt className="text-slate-500">{p.stage}</dt><dd>{profile.stage ? <StageBadge stage={profile.stage} t={crm} /> : <span className="text-slate-500">{p.noStage}</span>}</dd>
        <dt className="text-slate-500">{p.seller}</dt><dd className="text-slate-900">{profile.assignedSeller ?? p.unassigned}</dd>
      </dl>

      <Block title={p.contacts} empty={false} emptyText={none}>
        {profile.contacts.length === 0 && editing !== "new" && <p className="text-sm text-slate-500">{none}</p>}
        <ul className="space-y-2">
          {profile.contacts.map((ct) => (
            <li key={ct.id} className="rounded-lg border border-slate-200 p-2.5">
              {editing === ct.id ? (
                <ContactForm c={c} locale={locale} prospectId={profile.id} contact={ct} onDone={(ok) => { setEditing(null); if (ok) { notify({ kind: "ok", text: p.saved }); onChanged(); } }} notify={notify} />
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <p className="break-words font-medium text-slate-900">{ct.name}{ct.title ? <span className="font-normal text-slate-600"> · {ct.title}</span> : null}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {ct.isDecisionMaker && <Badge tone="bg-violet-100 text-violet-800">★ {p.decisionMaker}</Badge>}
                      {ct.isPrimary && <Badge>{p.primary}</Badge>}
                      {ct.language && <Badge tone="bg-blue-50 text-blue-800">{ct.language}</Badge>}
                      {ct.doNotContact && <Badge tone="bg-red-100 text-red-800">⛔ {p.contactDnc}</Badge>}
                    </div>
                    {ct.email ? (
                      <p className="mt-1 break-all text-slate-700">{ct.email} <Badge tone={ct.emailStatus === "valid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{ct.emailStatus === "valid" ? `✓ ${p.emailValid}` : `! ${p.emailNone}`}</Badge></p>
                    ) : <p className="mt-1 text-slate-500">{p.noEmail}</p>}
                    {ct.phone && <p className="break-words text-slate-700">{ct.phone}</p>}
                  </div>
                  {canEdit && <button type="button" className={`${btnSecondary} shrink-0 px-3`} onClick={() => setEditing(ct.id)} aria-label={fill(p.editContact, { name: ct.name })}>{p.edit}</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (editing === "new"
          ? <div className="mt-2 rounded-lg border border-slate-200 p-2.5"><ContactForm c={c} locale={locale} prospectId={profile.id} contact={null} onDone={(ok) => { setEditing(null); if (ok) { notify({ kind: "ok", text: p.saved }); onChanged(); } }} notify={notify} /></div>
          : <button type="button" className={`${btnSecondary} mt-2 w-full`} onClick={() => setEditing("new")}>+ {p.addContact}</button>)}
      </Block>

      {profile.lastDiscovery && (
        <Block title={p.sections.discovery} empty={false} emptyText={none}>
          <p className="text-xs text-slate-500">{fmtDateTime(profile.lastDiscovery.at, locale, timezone)}</p>
          <dl className="mt-1 space-y-1 text-sm">
            <div><dt className="inline text-slate-500">{p.software}: </dt><dd className="inline text-slate-900">{profile.lastDiscovery.software ?? p.notRecorded}</dd></div>
            <div><dt className="inline text-slate-500">{p.painPoints}: </dt><dd className="inline text-slate-900">{profile.lastDiscovery.painPoints.map((id) => defLabel(id)).filter(Boolean).join(", ") || none}</dd></div>
            <div><dt className="inline text-slate-500">{p.objections}: </dt><dd className="inline text-slate-900">{profile.lastDiscovery.objections.map((o) => OBJ(c)[o] ?? o).join(", ") || none}</dd></div>
          </dl>
        </Block>
      )}

      <Block title={p.sections.calls} empty={profile.calls.length === 0} emptyText={none}>
        <ul className="space-y-1 text-sm">
          {profile.calls.map((x) => (
            <li key={x.id} className="flex flex-wrap justify-between gap-x-2">
              <span className="text-slate-700">{fmtDateTime(x.requestedAt, locale, timezone)}</span>
              <span className="text-slate-900">{x.disposition ? (c.disposition.outcomes as Record<string, string>)[x.disposition] ?? x.disposition : `${p.callStates[x.state] ?? x.state} · ${p.noOutcome}`}{x.durationSec ? ` · ${fill(p.seconds, { n: x.durationSec })}` : ""}</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block title={p.sections.tasks} empty={profile.tasks.length === 0} emptyText={none}>
        <ul className="space-y-1 text-sm">
          {profile.tasks.map((x) => <li key={x.id} className="break-words"><span className="font-medium text-slate-900">{x.title}</span> <span className="text-slate-600">· {crm.taskTypes[x.type] ?? x.type} · {p.due} {fmtDateTime(x.dueAt, locale, timezone)}</span></li>)}
        </ul>
      </Block>

      <Block title={p.sections.meetings} empty={profile.meetings.length === 0} emptyText={none}>
        <ul className="space-y-1 text-sm">
          {profile.meetings.map((m) => <li key={m.id} className="break-words text-slate-800">{fmtDateTime(m.startsAt, locale, timezone)} · {comms.calendar.types[m.type] ?? m.type} · {comms.calendar.statuses[m.status] ?? m.status}{m.outcome ? ` · ${comms.calendar.outcomes[m.outcome] ?? m.outcome}` : ""}</li>)}
        </ul>
      </Block>

      <Block title={p.sections.emails} empty={profile.emails.length === 0} emptyText={none}>
        <ul className="space-y-1 text-sm">
          {profile.emails.map((e) => <li key={e.id} className="break-words text-slate-800"><span className="text-slate-500">{fmtDateTime(e.at, locale, timezone)} · {p.emailKinds[e.kind] ?? e.kind}{e.status ? ` · ${comms.status[e.status] ?? e.status}` : ""}</span><br />{e.subject ?? comms.inbox.noSubject}</li>)}
        </ul>
      </Block>

      <Block title={p.sections.activities} empty={profile.activities.length === 0} emptyText={none}>
        <ul className="space-y-1.5 text-sm">
          {profile.activities.map((a) => (
            <li key={a.id} className="break-words">
              <span className="text-slate-500">{fmtDateTime(a.occurredAt, locale, timezone)} · </span>
              <span className="font-medium text-slate-900">{crm.activityTypes[a.type] ?? a.type}</span>{a.outcome ? <span className="text-slate-700"> · {crm.outcomes[a.outcome] ?? a.outcome}</span> : null}
              {a.subject && <span className="text-slate-700"> · {a.subject}</span>}
              {a.body && <span className="mt-0.5 block whitespace-pre-line text-slate-600">{a.body}</span>}
            </li>
          ))}
        </ul>
      </Block>

      <Block title={p.sections.needs} empty={profile.needs.length === 0} emptyText={none}>
        <ul className="flex flex-wrap gap-1">
          {profile.needs.map((n) => <li key={n.definitionId}><Badge>{defLabel(n.definitionId) ?? n.definitionId} · {crm.severities[n.severity] ?? n.severity} · {crm.bases[n.basis] ?? n.basis}</Badge></li>)}
        </ul>
      </Block>

      <Block title={p.sections.notes} empty={!profile.notes} emptyText={none}><p className="whitespace-pre-line break-words text-sm text-slate-800">{profile.notes}</p></Block>
      <Block title={p.sections.tags} empty={profile.tags.length === 0} emptyText={none}>
        <ul className="flex flex-wrap gap-1">{profile.tags.map((t) => <li key={t}><Badge>{t}</Badge></li>)}</ul>
      </Block>
    </section>
  );
}

function ContactForm({ c, locale, prospectId, contact, onDone, notify }: { c: CallingCopy; locale: Locale; prospectId: string; contact: WorkspaceContact | null; onDone: (saved: boolean) => void; notify: (t: Toast) => void }) {
  const f = c.ws.profile.form;
  const p = c.ws.profile;
  const [v, setV] = useState({ name: contact?.name ?? "", title: contact?.title ?? "", email: contact?.email ?? "", phone: contact?.phone ?? "", dm: contact?.isDecisionMaker ?? false, language: (contact?.language ?? "") as "" | "FR" | "EN" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const uid = contact?.id ?? "new";
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) return setError(wsError(c, locale, "INVALID"));
    setError(null);
    start(async () => {
      try {
        const r = await saveDecisionMaker({ prospectId, contactId: contact?.id ?? null, name: v.name, title: v.title, email: v.email, phone: v.phone, isDecisionMaker: v.dm, language: v.language });
        if (!r.ok) { setError(wsError(c, locale, r.error)); return; }
        onDone(true);
      } catch {
        setError(c.unexpected); notify({ kind: "error", text: c.unexpected });
      }
    });
  }
  return (
    <form onSubmit={submit} className="grid gap-2" aria-label={contact ? fill(p.editContact, { name: contact.name }) : p.addContact}>
      <label className={labelCls}>{f.name}<input className={inputCls} value={v.name} required maxLength={100} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
      <label className={labelCls}>{f.title}<input className={inputCls} value={v.title} maxLength={100} onChange={(e) => setV({ ...v, title: e.target.value })} /></label>
      <label className={labelCls}>{f.email}<input className={inputCls} type="email" inputMode="email" autoComplete="off" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} aria-describedby={contact?.email ? `email-change-${uid}` : undefined} /></label>
      {contact?.email && <p id={`email-change-${uid}`} className="text-xs text-slate-500">{f.emailChange}</p>}
      <label className={labelCls}>{f.phone}<input className={inputCls} type="tel" value={v.phone} maxLength={40} onChange={(e) => setV({ ...v, phone: e.target.value })} /></label>
      <label className={labelCls}>{f.language}
        <select className={inputCls} value={v.language} onChange={(e) => setV({ ...v, language: e.target.value as "" | "FR" | "EN" })}>
          <option value="">{f.languageNone}</option><option value="FR">{crmCopy(locale).languages.FR}</option><option value="EN">{crmCopy(locale).languages.EN}</option>
        </select>
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700"><input type="checkbox" className="size-4" checked={v.dm} onChange={(e) => setV({ ...v, dm: e.target.checked })} />{f.dm}</label>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={pending}>{pending ? p.saving : p.save}</button>
        <button type="button" className={btnSecondary} disabled={pending} onClick={() => onDone(false)}>{p.cancel}</button>
      </div>
    </form>
  );
}
