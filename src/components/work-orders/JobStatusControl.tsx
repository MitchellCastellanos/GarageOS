"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { JobStatus } from "@prisma/client";
import { Loader2, CheckCircle2 } from "lucide-react";
import { updateJobStatus } from "@/actions/work-orders";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { WORK_ORDERS_DICT } from "@/lib/admin-locale/work-orders";

const JOB_STATUS_ORDER: JobStatus[] = [
  "CHECKED_IN",
  "WAITING_APPROVAL",
  "WAITING_PARTS",
  "IN_SERVICE",
  "READY_FOR_PICKUP",
  "COMPLETED",
];

const JOB_STATUS_BADGE: Record<JobStatus, string> = {
  CHECKED_IN: "bg-slate-100 text-slate-600",
  WAITING_APPROVAL: "bg-amber-100 text-amber-700",
  WAITING_PARTS: "bg-amber-100 text-amber-700",
  IN_SERVICE: "bg-indigo-100 text-indigo-700",
  READY_FOR_PICKUP: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-teal-100 text-teal-700",
};

interface JobStatusControlProps {
  workOrderId: string;
  jobStatus: JobStatus;
  readyForPickupNotifiedAt: Date | null;
}

export function JobStatusControl({ workOrderId, jobStatus, readyForPickupNotifiedAt }: JobStatusControlProps) {
  const router = useRouter();
  const locale = useAdminLocale();
  const t = WORK_ORDERS_DICT[locale];
  const [isPending, startTransition] = useTransition();

  function handleChange(value: JobStatus) {
    startTransition(async () => {
      const result = await updateJobStatus(workOrderId, value);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      if (result?.notified?.email) toast.success(t.jobStatusControl.notifyEmailSent);
      if (result?.notified?.sms) toast.success(t.jobStatusControl.notifySmsSent);
      if (result?.notified && !result.notified.email && !result.notified.sms) {
        toast.warning(t.jobStatusControl.notifyNoContact);
      }
      if (!result?.notified) toast.success(t.jobStatusControl.updated);
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          {t.jobStatusControl.title}
        </p>
        {readyForPickupNotifiedAt && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t.jobStatusControl.notifiedBadge}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <select
          value={jobStatus}
          disabled={isPending}
          onChange={(e) => handleChange(e.target.value as JobStatus)}
          className={`px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium disabled:opacity-50 ${JOB_STATUS_BADGE[jobStatus]}`}
        >
          {JOB_STATUS_ORDER.map((status) => (
            <option key={status} value={status} className="bg-white text-slate-900">
              {t.jobStatus[status]}
            </option>
          ))}
        </select>
        {isPending && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
      </div>
    </div>
  );
}
