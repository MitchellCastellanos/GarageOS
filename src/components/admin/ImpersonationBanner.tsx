"use client";

import { useTransition } from "react";
import { endImpersonation } from "@/actions/platform";
import { Loader2, ShieldAlert } from "lucide-react";

export function ImpersonationBanner({ shopName, startedByName }: { shopName: string; startedByName: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="no-print sticky top-0 z-50 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950">
      <span className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4" />
        Estás viendo como <strong>{shopName}</strong> — {startedByName}, super admin
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => endImpersonation())}
        className="flex items-center gap-1.5 rounded-md bg-slate-950 px-3 py-1 text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        Salir
      </button>
    </div>
  );
}
