"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { TIRE_STORAGE_DICT } from "@/lib/admin-locale/tire-storage";
import { checkInTireSet, checkOutTireSet, moveTireSet } from "@/actions/tire-storage";

const field = "px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const btn = "text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-50";

export function TireSetActions({ id, status, location }: { id: string; status: "STORED" | "CHECKED_OUT"; location: string | null }) {
  const locale = useAdminLocale();
  const t = TIRE_STORAGE_DICT[locale];
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [loc, setLoc] = useState(location ?? "");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) toast.success(okMsg);
      else toast.error(t.errors[res.error ?? "INVALID_STATE"] ?? t.errors.INVALID_STATE);
    });
  }

  if (status === "STORED") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <input className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.detail.checkOutNote} />
          <button
            className={`${btn} bg-blue-600 hover:bg-blue-700 text-white`}
            disabled={pending}
            onClick={() => window.confirm(t.detail.confirmCheckOut) && run(() => checkOutTireSet(id, note), t.toast.checkedOut)}
          >
            {t.detail.checkOut}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input className={field} value={loc} onChange={(e) => setLoc(e.target.value)} placeholder={t.detail.newLocation} />
          <button className={`${btn} border border-slate-300 text-slate-700`} disabled={pending || !loc.trim()} onClick={() => run(() => moveTireSet(id, loc), t.toast.moved)}>
            {t.detail.move}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <input className={field} value={loc} onChange={(e) => setLoc(e.target.value)} placeholder={t.detail.newLocation} />
      <button className={`${btn} bg-blue-600 hover:bg-blue-700 text-white`} disabled={pending} onClick={() => run(() => checkInTireSet(id, loc), t.toast.checkedIn)}>
        {t.detail.reCheckIn}
      </button>
    </div>
  );
}
