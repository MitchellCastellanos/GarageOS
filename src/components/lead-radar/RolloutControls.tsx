"use client";

import { activateNationalRolloutAction, pauseNationalRolloutAction, resumeNationalRolloutAction } from "@/actions/lead-radar";
import { btnPrimary, btnSecondary } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { useRadarAction } from "@/components/lead-radar/useRadarAction";
import { nationalCopy } from "@/lib/admin-locale/lead-radar-national";

/** Owner-only controls of the one-time national rollout. Activation is the single authorisation; Pause stops the whole automation at once; Resume re-runs every safety check. */
export function RolloutControls({ locale, state }: { locale: "en" | "fr"; state: "NOT_STARTED" | "RUNNING" | "PAUSED" | "HALTED" | "FINISHED" }) {
  const k = nationalCopy(locale).dash.rollout;
  const { error, notice, pending, run } = useRadarAction(locale);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {state === "NOT_STARTED" && <button type="button" className={btnPrimary} disabled={pending} onClick={() => { if (window.confirm(k.activateConfirm)) run(() => activateNationalRolloutAction()); }}>{k.activate}</button>}
        {state === "RUNNING" && <button type="button" className={btnSecondary} disabled={pending} onClick={() => run(() => pauseNationalRolloutAction())}>{k.pause}</button>}
        {(state === "PAUSED" || state === "HALTED") && <button type="button" className={btnPrimary} disabled={pending} onClick={() => { if (window.confirm(k.resumeConfirm)) run(() => resumeNationalRolloutAction()); }}>{k.resume}</button>}
      </div>
      <FormMessage error={error} notice={notice} />
    </div>
  );
}
