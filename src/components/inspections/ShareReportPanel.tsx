"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { shareInspectionReport, unshareInspectionReport } from "@/actions/inspections";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { INSPECTIONS_ADVANCED_DICT } from "@/lib/admin-locale/inspections-advanced";
import { ADMIN } from "@/lib/routes";

interface Props {
  inspectionId: string;
  initialPath: string | null;
  canShare: boolean;
  origin: string;
}

export function ShareReportPanel({ inspectionId, initialPath, canShare, origin }: Props) {
  const t = INSPECTIONS_ADVANCED_DICT[useAdminLocale()].share;
  const [path, setPath] = useState(initialPath);
  const [pending, startTransition] = useTransition();

  if (!canShare && !path) {
    return (
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-slate-700">
        {t.locked}{" "}
        <Link href={`${ADMIN.settings}?tab=billing&plan=pro`} className="text-blue-600 font-medium hover:underline">Pro</Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-slate-400" />
        <h2 className="font-semibold text-slate-900">{t.title}</h2>
      </div>
      <p className="text-sm text-slate-500">{t.description}</p>
      {path ? (
        <div className="flex flex-wrap items-center gap-2">
          <input readOnly value={`${origin}${path}`} className="flex-1 min-w-[16rem] px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50" onFocus={(e) => e.currentTarget.select()} />
          <button
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700"
            onClick={async () => {
              await navigator.clipboard.writeText(`${origin}${path}`);
              toast.success(t.copied);
            }}
          >
            {t.copy}
          </button>
          <a href={path} target="_blank" rel="noreferrer" className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700">{t.open}</a>
          <button
            disabled={pending}
            className="px-3 py-2 text-sm font-medium text-red-600 disabled:opacity-50"
            onClick={() =>
              startTransition(async () => {
                const res = await unshareInspectionReport(inspectionId);
                if (res.error) toast.error(res.error);
                else setPath(null);
              })
            }
          >
            {t.stop}
          </button>
        </div>
      ) : (
        <button
          disabled={pending}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          onClick={() =>
            startTransition(async () => {
              const res = await shareInspectionReport(inspectionId);
              if (res.error) toast.error(res.error);
              else if (res.path) setPath(res.path);
            })
          }
        >
          {t.enable}
        </button>
      )}
    </div>
  );
}
