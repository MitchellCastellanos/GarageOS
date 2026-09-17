"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Trash2, FileSpreadsheet } from "lucide-react";
import { deleteInspection, createQuoteFromInspection } from "@/actions/inspections";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { INSPECTIONS_DICT } from "@/lib/admin-locale/inspections";

interface InspectionActionsProps {
  inspectionId: string;
  findingsCount: number;
}

export function InspectionActions({ inspectionId, findingsCount }: InspectionActionsProps) {
  const locale = useAdminLocale();
  const t = INSPECTIONS_DICT[locale];
  const [deletePending, startDelete] = useTransition();
  const [quotePending, startQuote] = useTransition();

  function handleDelete() {
    if (!confirm(t.actions.confirmDelete)) return;
    startDelete(async () => {
      const result = await deleteInspection(inspectionId);
      if (result?.error) toast.error(result.error);
    });
  }

  function handleCreateQuote() {
    if (!confirm(t.actions.confirmCreateQuote)) return;
    startQuote(async () => {
      const result = await createQuoteFromInspection(inspectionId);
      if (result?.error) toast.error(result.error);
    });
  }

  const isAnyPending = deletePending || quotePending;

  return (
    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
      {findingsCount > 0 && (
        <button
          type="button"
          disabled={isAnyPending}
          onClick={handleCreateQuote}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {quotePending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
          {t.detail.createQuote}
        </button>
      )}
      <button
        type="button"
        disabled={isAnyPending}
        onClick={handleDelete}
        className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
      >
        {deletePending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        {t.actions.delete}
      </button>
    </div>
  );
}
