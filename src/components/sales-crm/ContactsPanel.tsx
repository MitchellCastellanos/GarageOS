"use client";

import { useState } from "react";
import { addContact, archiveContact, updateContact } from "@/actions/sales-prospects";
import { Badge, LanguageBadge, btnDanger, btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export interface ContactRow {
  id: string; name: string; title: string | null; email: string | null; phone: string | null; isPrimary: boolean; isDecisionMaker: boolean;
  preferredLanguage: string | null; doNotContact: boolean;
}

function ContactForm({ locale, contact, prospectId, onDone }: { locale: "en" | "fr"; contact?: ContactRow; prospectId: string; onDone: () => void }) {
  const { t, pending, error, run } = useCrmAction(locale);
  return (
    <form className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"
      action={(form) => run(() => (contact ? updateContact(contact.id, form) : addContact(prospectId, form)), onDone)}>
      <label className={labelCls}>{t.common.name} *<input className={inputCls} name="name" required maxLength={100} defaultValue={contact?.name ?? ""} disabled={pending} /></label>
      <label className={labelCls}>{t.common.title}<input className={inputCls} name="title" maxLength={100} defaultValue={contact?.title ?? ""} disabled={pending} /></label>
      <label className={labelCls}>{t.common.email}<input className={inputCls} name="email" type="email" maxLength={254} defaultValue={contact?.email ?? ""} disabled={pending} /></label>
      <label className={labelCls}>{t.common.phone}<input className={inputCls} name="phone" type="tel" maxLength={30} defaultValue={contact?.phone ?? ""} disabled={pending} /></label>
      <label className={labelCls}>{t.contacts.langOverride}
        <select className={inputCls} name="preferredLanguage" defaultValue={contact?.preferredLanguage ?? ""} disabled={pending}>
          <option value="">{t.contacts.inherit}</option><option value="FR">{t.languages.FR}</option><option value="EN">{t.languages.EN}</option>
        </select>
      </label>
      <div className="flex flex-col justify-end gap-2 text-sm">
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="isPrimary" defaultChecked={contact?.isPrimary} className="h-4 w-4" disabled={pending} /> {t.contacts.makePrimary}</label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="isDecisionMaker" defaultChecked={contact?.isDecisionMaker} className="h-4 w-4" disabled={pending} /> {t.contacts.makeDecisionMaker}</label>
      </div>
      <div className="sm:col-span-2"><FormMessage error={error} /></div>
      <div className="flex gap-2 sm:col-span-2">
        <button className={btnPrimary} disabled={pending}>{pending ? t.common.saving : t.common.save}</button>
        <button type="button" className={btnSecondary} onClick={onDone} disabled={pending}>{t.common.cancel}</button>
      </div>
    </form>
  );
}

export function ContactsPanel({ locale, prospectId, contacts, prospectLanguage, canEdit }: {
  locale: "en" | "fr"; prospectId: string; contacts: ContactRow[]; prospectLanguage: string; canEdit: boolean;
}) {
  const { t, pending, error, run } = useCrmAction(locale);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  return (
    <div className="space-y-3">
      {contacts.length === 0 && editing !== "new" && <p className="text-sm text-slate-500">{t.states.emptyContacts}</p>}
      <ul className="space-y-3">
        {contacts.map((c) => (
          <li key={c.id} className="rounded-lg border border-slate-200 p-3">
            {editing === c.id ? <ContactForm locale={locale} contact={c} prospectId={prospectId} onDone={() => setEditing(null)} /> : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="break-words font-medium text-slate-900">{c.name}{c.title ? <span className="font-normal text-slate-500"> · {c.title}</span> : null}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {c.isPrimary && <Badge tone="bg-blue-100 text-blue-800">{t.contacts.primary}</Badge>}
                    {c.isDecisionMaker && <Badge tone="bg-emerald-100 text-emerald-800">{t.contacts.decisionMaker}</Badge>}
                    <LanguageBadge language={c.preferredLanguage ?? prospectLanguage} t={t} />
                    {c.preferredLanguage && <Badge>{t.contacts.langOverride}</Badge>}
                    {c.doNotContact && <Badge tone="bg-red-100 text-red-800">{t.prospects.detail.doNotContactBanner}</Badge>}
                  </div>
                  <p className="break-all text-sm text-slate-600">{[c.email, c.phone].filter(Boolean).join(" · ") || t.common.none}</p>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <button type="button" className={btnSecondary} onClick={() => setEditing(c.id)}>{t.common.edit}</button>
                    <button type="button" className={btnDanger} disabled={pending}
                      onClick={() => { if (window.confirm(t.contacts.archiveConfirm)) run(() => archiveContact(c.id)); }}>{t.contacts.archive}</button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <FormMessage error={error} />
      {canEdit && (editing === "new"
        ? <ContactForm locale={locale} prospectId={prospectId} onDone={() => setEditing(null)} />
        : <button type="button" className={btnSecondary} onClick={() => setEditing("new")}>{t.contacts.add}</button>)}
    </div>
  );
}
