"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import type { WorkOrderStatus } from "@prisma/client";
import {
  updateWorkOrderStatus,
  convertWorkOrderToInvoice,
  deleteWorkOrder,
} from "@/actions/work-orders";
import { adminPath } from "@/lib/routes";
import { Loader2, Trash2, ArrowRightLeft, Check, Play, Ban, FlagTriangleRight } from "lucide-react";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { WORK_ORDERS_DICT } from "@/lib/admin-locale/work-orders";

interface WorkOrderActionsProps {
  workOrderId: string;
  orderNumber: string;
  status: WorkOrderStatus;
  invoiceId?: string | null;
}

const VOIDABLE = new Set<WorkOrderStatus>(["OPEN", "AWAITING_APPROVAL", "APPROVED", "IN_PROGRESS"]);

export function WorkOrderActions({ workOrderId, orderNumber, status, invoiceId }: WorkOrderActionsProps) {
  const router = useRouter();
  const locale = useAdminLocale();
  const t = WORK_ORDERS_DICT[locale];
  const [statusPending, startStatus] = useTransition();
  const [convertPending, startConvert] = useTransition();
  const [deletePending, startDelete] = useTransition();

  const isAnyPending = statusPending || convertPending || deletePending;

  function handleStatusChange(toStatus: WorkOrderStatus) {
    startStatus(async () => {
      const result = await updateWorkOrderStatus(workOrderId, toStatus);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t.actions.statusUpdated);
      router.refresh();
    });
  }

  function handleConvert() {
    if (!confirm(t.actions.confirmConvert(orderNumber))) return;
    startConvert(async () => {
      const result = await convertWorkOrderToInvoice(workOrderId);
      if (result?.error) {
        toast.error(result.error);
      }
    });
  }

  function handleDelete() {
    if (!confirm(t.actions.confirmDelete(orderNumber))) return;
    startDelete(async () => {
      const result = await deleteWorkOrder(workOrderId);
      if (result?.error) toast.error(result.error);
    });
  }

  if (status === "INVOICED" && invoiceId) {
    return (
      <Link
        href={adminPath(`/invoices/${invoiceId}`)}
        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
      >
        <ArrowRightLeft className="w-4 h-4" />
        {t.actions.viewInvoice}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
      {status === "OPEN" && (
        <button
          type="button"
          disabled={isAnyPending}
          onClick={() => handleStatusChange("AWAITING_APPROVAL")}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          {statusPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlagTriangleRight className="w-4 h-4" />}
          {t.actions.markAwaitingApproval}
        </button>
      )}

      {status === "AWAITING_APPROVAL" && (
        <button
          type="button"
          disabled={isAnyPending}
          onClick={() => handleStatusChange("APPROVED")}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {statusPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {t.actions.approve}
        </button>
      )}

      {status === "APPROVED" && (
        <button
          type="button"
          disabled={isAnyPending}
          onClick={() => handleStatusChange("IN_PROGRESS")}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {statusPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {t.actions.start}
        </button>
      )}

      {status === "IN_PROGRESS" && (
        <>
          <button
            type="button"
            disabled={isAnyPending}
            onClick={() => handleStatusChange("AWAITING_APPROVAL")}
            className="flex items-center gap-1.5 px-3 py-2 border border-amber-200 text-amber-800 hover:bg-amber-50 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {statusPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlagTriangleRight className="w-3.5 h-3.5" />}
            {t.actions.reopenForApproval}
          </button>
          <button
            type="button"
            disabled={isAnyPending}
            onClick={() => handleStatusChange("COMPLETED")}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {statusPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t.actions.complete}
          </button>
        </>
      )}

      {status === "COMPLETED" && (
        <button
          type="button"
          disabled={isAnyPending}
          onClick={handleConvert}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {convertPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
          {t.actions.convertToInvoice}
        </button>
      )}

      {VOIDABLE.has(status) && (
        <button
          type="button"
          disabled={isAnyPending}
          onClick={() => handleStatusChange("CANCELLED")}
          className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          {statusPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
          {t.actions.cancel}
        </button>
      )}

      {!invoiceId && (
        <button
          type="button"
          disabled={isAnyPending}
          onClick={handleDelete}
          className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          {deletePending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          {t.actions.delete}
        </button>
      )}
    </div>
  );
}
