"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { manageCancelAction, manageRescheduleAction, manageSlotsAction } from "@/actions/sales-booking-public";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { btnDanger, btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/sales-crm/ui";
import { SlotPicker } from "@/components/sales-comms/BookingClient";

export function ManageClient({ token, lang: initial, canModify, status }: { token: string; lang: "EN" | "FR"; canModify: boolean; status: string }) {
  const router = useRouter();
  const [lang, setLang] = useState(initial);
  const t = commsCopy(lang === "FR" ? "fr" : "en").pub;
  const [tz] = useState(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto"; } catch { return "America/Toronto"; } });
  const [mode, setMode] = useState<"" | "resched" | "cancel">("");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (mode === "resched" && slots === null) manageSlotsAction(token).then((r) => setSlots(r.ok ? r.slots : [])); }, [mode, slots, token]);
  if (!canModify) return <p role="status" className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{status === "CANCELLED" ? t.cancelledState : t.pastState}</p>;
  return (
    <div className="space-y-4" lang={lang.toLowerCase()}>
      <div role="group" aria-label={t.language} className="flex w-fit overflow-hidden rounded-lg border border-slate-300 text-sm">
        {(["EN", "FR"] as const).map((l) => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={`min-h-11 min-w-11 px-3 ${lang === l ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`}>{l}</button>)}
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{msg.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnSecondary} onClick={() => setMode(mode === "resched" ? "" : "resched")}>{t.reschedule}</button>
        <button type="button" className={btnDanger} onClick={() => setMode(mode === "cancel" ? "" : "cancel")}>{t.cancel}</button>
      </div>
      {mode === "resched" && (
        <div className="space-y-3">
          {slots === null ? <p className="text-sm text-slate-500" role="status">…</p> : <SlotPicker lang={lang} tz={tz} slots={slots} value={slot} onChange={setSlot} />}
          <button type="button" className={btnPrimary} disabled={!slot || busy} onClick={async () => {
            setBusy(true);
            const r = await manageRescheduleAction(token, slot);
            setBusy(false);
            if (r.ok) { setMsg({ ok: true, text: t.rescheduled }); setMode(""); router.refresh(); }
            else setMsg({ ok: false, text: r.error === "SLOT_TAKEN" ? t.slotTaken : r.error === "RATE_LIMITED" ? t.rateLimited : t.pastState });
          }}>{t.reschedule}</button>
        </div>
      )}
      {mode === "cancel" && (
        <div className="space-y-3">
          <label className={labelCls}>{t.cancelReason}<input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></label>
          <div className="flex gap-2">
            <button type="button" className={btnDanger} disabled={busy} onClick={async () => {
              setBusy(true);
              const r = await manageCancelAction(token, reason);
              setBusy(false);
              if (r.ok) { setMsg({ ok: true, text: t.cancelled }); setMode(""); router.refresh(); } else setMsg({ ok: false, text: t.pastState });
            }}>{t.cancelConfirm}</button>
            <button type="button" className={btnSecondary} onClick={() => setMode("")}>{t.keep}</button>
          </div>
        </div>
      )}
    </div>
  );
}
