"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createTask } from "@/actions/sales-activities";
import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import { crmCopy } from "@/lib/admin-locale/sales-crm";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { wsError, type Locale, type Toast } from "./shared";

const TYPES = ["FOLLOW_UP", "CALL", "EMAIL", "DEMO_PREP", "OTHER"] as const;
const LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;

export function TaskPanel({ c, locale, prospectId, defaultTitle, onDone, notify }: {
  c: CallingCopy; locale: Locale; prospectId: string; defaultTitle: string; onDone: (created: boolean) => void; notify: (t: Toast) => void;
}) {
  const t = c.ws.task;
  const crm = crmCopy(locale);
  const [v, setV] = useState({ title: defaultTitle, type: "FOLLOW_UP", priority: "MEDIUM", dueDate: "", dueTime: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!v.title.trim() || !v.dueDate) return setError(t.required);
    setError(null);
    const fd = new FormData();
    for (const [k, val] of Object.entries(v)) if (val) fd.set(k, val);
    start(async () => {
      try {
        const r = await createTask(prospectId, fd);
        if (!r.ok) { setError(wsError(c, locale, r.error)); return; }
        notify({ kind: "ok", text: t.created });
        onDone(true);
      } catch {
        setError(c.unexpected);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3" aria-labelledby="task-title">
      <h3 id="task-title" className="text-sm font-semibold text-slate-900">{t.title}</h3>
      <label className={labelCls}>{t.what}<input className={inputCls} required maxLength={150} value={v.title} onChange={(e) => set("title", e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className={labelCls}>{t.type}
          <select className={inputCls} value={v.type} onChange={(e) => set("type", e.target.value)}>{TYPES.map((x) => <option key={x} value={x}>{crm.taskTypes[x]}</option>)}</select>
        </label>
        <label className={labelCls}>{t.priority}
          <select className={inputCls} value={v.priority} onChange={(e) => set("priority", e.target.value)}>{LEVELS.map((x) => <option key={x} value={x}>{crm.levels[x]}</option>)}</select>
        </label>
        <label className={labelCls}>{t.date}<input type="date" className={inputCls} required value={v.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></label>
        <label className={labelCls}>{t.time}<input type="time" className={inputCls} value={v.dueTime} onChange={(e) => set("dueTime", e.target.value)} /></label>
      </div>
      <label className={labelCls}>{t.notes}<textarea className={`${inputCls} py-2`} rows={2} maxLength={2000} value={v.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={pending}>{pending ? t.saving : t.save}</button>
        <button type="button" className={btnSecondary} disabled={pending} onClick={() => onDone(false)}>{c.ws.profile.cancel}</button>
      </div>
    </form>
  );
}
