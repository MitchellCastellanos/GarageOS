"use client";

import { cancelTask, completeTask, reopenTask } from "@/actions/sales-activities";
import { btnDanger, btnSecondary } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export function TaskActions({ locale, taskId, status }: { locale: "en" | "fr"; taskId: string; status: string }) {
  const { t, pending, error, run } = useCrmAction(locale);
  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {status === "OPEN" ? (<>
          <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => completeTask(taskId))}>{t.tasks.complete}</button>
          <button type="button" className={btnDanger} disabled={pending} onClick={() => { if (window.confirm(t.tasks.cancelConfirm)) run(() => cancelTask(taskId)); }}>{t.tasks.cancel}</button>
        </>) : <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => reopenTask(taskId))}>{t.tasks.reopen}</button>}
      </div>
      <FormMessage error={error} />
    </div>
  );
}
