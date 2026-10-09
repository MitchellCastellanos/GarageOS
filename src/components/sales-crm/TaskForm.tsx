"use client";

import { useState } from "react";
import { createTask } from "@/actions/sales-activities";
import { btnPrimary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export function TaskForm({ locale, prospectId, staff, defaultStaffId, canPickAssignee }: {
  locale: "en" | "fr"; prospectId: string; staff: { id: string; name: string }[]; defaultStaffId: string | null; canPickAssignee: boolean;
}) {
  const { t, pending, error, notice, run } = useCrmAction(locale);
  const [key, setKey] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form key={key} className="grid gap-3 sm:grid-cols-2" action={(form) => run(() => createTask(prospectId, form), () => setKey((k) => k + 1), t.tasks.created)}>
      <label className={`${labelCls} sm:col-span-2`}>{t.tasks.titleField} *<input className={inputCls} name="title" required maxLength={150} disabled={pending} /></label>
      <label className={labelCls}>{t.tasks.type}
        <select className={inputCls} name="type" defaultValue="FOLLOW_UP" disabled={pending}>{Object.entries(t.taskTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label className={labelCls}>{t.tasks.priority}
        <select className={inputCls} name="priority" defaultValue="MEDIUM" disabled={pending}>{Object.entries(t.levels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label className={labelCls}>{t.tasks.dueDate} *<input className={inputCls} name="dueDate" type="date" required min={today} defaultValue={today} disabled={pending} /></label>
      <label className={labelCls}>{t.tasks.dueTime}<input className={inputCls} name="dueTime" type="time" defaultValue="09:00" disabled={pending} /></label>
      {canPickAssignee && (
        <label className={`${labelCls} sm:col-span-2`}>{t.tasks.assignee}
          <select className={inputCls} name="assignedStaffId" defaultValue={defaultStaffId ?? ""} disabled={pending}>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      <div className="sm:col-span-2"><FormMessage error={error} notice={notice} /></div>
      <div className="sm:col-span-2"><button className={btnPrimary} disabled={pending}>{pending ? t.common.saving : t.tasks.new}</button></div>
    </form>
  );
}
