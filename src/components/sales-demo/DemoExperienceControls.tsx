"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enableSalesDemoCommunications, loadSalesDemoScenario, restartSalesDemo } from "@/actions/sales-demo-experience";
import { salesDemoExperienceCopy } from "@/lib/admin-locale/sales-demo-experience";
import type { AdminLocale } from "@/lib/admin-locale";
const button = "min-h-11 rounded-lg border px-4 py-3 font-medium focus-visible:ring-2 disabled:opacity-50";
export function DemoExperienceControls({ demoId, enabled, loaded, locale }: { demoId: string; enabled: boolean; loaded: boolean; locale: AdminLocale }) {
  const t = salesDemoExperienceCopy(locale); const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sendConfirmed, confirmSend] = useState(false), [restartConfirmed, confirmRestart] = useState(false), [clear, setClear] = useState(false);
  const [message, setMessage] = useState("");
  function run(action: () => Promise<{ error?: string; success?: true }>, restart = false) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error) { setMessage(result.error === "liveLinks" ? t.liveLinks : t.error); return; }
        setMessage(t.success); router.refresh();
        if (restart) router.push("/admin/onboarding");
      } catch { setMessage(t.error); }
    });
  }
  return <div className="space-y-5">
    <section className="space-y-3 rounded-xl border bg-white p-4">
      <h2 className="text-lg font-semibold">{enabled ? t.enabled : t.enable}</h2><p>{t.communicationHelp}</p>
      {!enabled && <><label className="flex min-h-11 items-start gap-3 py-2"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={sendConfirmed} disabled={pending} onChange={(e) => confirmSend(e.target.checked)} />{t.confirmSend}</label>
        <button className={button} disabled={pending || !sendConfirmed} onClick={() => run(() => enableSalesDemoCommunications(demoId, sendConfirmed))}>{t.enable}</button></>}
    </section>
    <section className="space-y-3 rounded-xl border bg-white p-4"><h2 className="text-lg font-semibold">{t.scenario}</h2><p>{t.scenarioHelp}</p><p>{t.live}</p>
      {loaded ? <p role="status">{t.loaded}</p> : <button className={button} disabled={pending} onClick={() => run(() => loadSalesDemoScenario(demoId))}>{t.scenario}</button>}
    </section>
    <section className="space-y-3 rounded-xl border bg-white p-4"><h2 className="text-lg font-semibold">{t.restart}</h2><p>{t.restartHelp}</p>
      {loaded && <label className="flex min-h-11 items-start gap-3 py-2"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={clear} disabled={pending} onChange={(e) => setClear(e.target.checked)} />{t.clear}</label>}
      <label className="flex min-h-11 items-start gap-3 py-2"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={restartConfirmed} disabled={pending} onChange={(e) => confirmRestart(e.target.checked)} />{t.confirmRestart}</label>
      <button className={button} disabled={pending || !restartConfirmed} onClick={() => run(() => restartSalesDemo(demoId, clear, restartConfirmed), true)}>{t.restart}</button>
    </section>
    <p role="status" aria-live="polite" className="break-words">{message}</p>
  </div>;
}
