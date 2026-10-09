"use client";

import { useState } from "react";
import { unsubscribeAction } from "@/actions/sales-booking-public";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { btnPrimary } from "@/components/sales-crm/ui";

export function UnsubscribeClient({ token, lang, masked, already }: { token: string; lang: "EN" | "FR"; masked: string; already: boolean }) {
  const t = commsCopy(lang === "FR" ? "fr" : "en").pub;
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(already ? "done" : "idle");
  return (
    <div className="space-y-4" lang={lang.toLowerCase()}>
      <h1 className="text-xl font-semibold text-slate-900">{t.unsubTitle}</h1>
      <p className="text-sm text-slate-700">{t.unsubBody} <b>{masked}</b></p>
      {state === "done" && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{already ? t.unsubAlready : t.unsubDone}</p>}
      {state === "error" && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{t.rateLimited}</p>}
      {state !== "done" && <button className={btnPrimary} disabled={state === "busy"} onClick={async () => { setState("busy"); const r = await unsubscribeAction(token); setState(r.ok ? "done" : "error"); }}>{t.unsubConfirm}</button>}
    </div>
  );
}
