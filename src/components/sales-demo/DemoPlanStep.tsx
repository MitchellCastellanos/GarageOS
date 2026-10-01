"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setSalesDemoPlan } from "@/actions/sales-demo";
import { PLANS, PLAN_LABELS, type Plan } from "@/config/entitlements";
import { salesDemoCopy } from "@/lib/admin-locale/sales-demo";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { StepShell } from "@/components/onboarding/StepShell";
import { useRouter } from "next/navigation";
export function DemoPlanStep({ demoId, initialPlan, step, totalSteps, onNext, onBack }: {
  demoId: string; initialPlan: Plan; step: number; totalSteps: number; onNext: () => void; onBack: () => void;
}) {
  const t = salesDemoCopy(useAdminLocale()); const router = useRouter();
  const [plan, setPlan] = useState(initialPlan); const [pending, startTransition] = useTransition();
  return <StepShell step={step} totalSteps={totalSteps} title={t.plan} subtitle={t.noStripe} onBack={onBack}>
    <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-3"><legend className="sr-only">{t.plan}</legend>
      {PLANS.map((p) => <label key={p} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-3 ${plan === p ? "border-blue-600 bg-blue-50" : ""}`}>
        <input type="radio" name="demoPlan" value={p} checked={plan === p} onChange={() => setPlan(p)} />{PLAN_LABELS[p]}
      </label>)}
    </fieldset>
    <button disabled={pending} className="mt-5 min-h-11 w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-50" onClick={() => startTransition(async () => {
      try { const result = await setSalesDemoPlan(demoId, plan); if (result.error) toast.error(t.error); else onNext(); }
      catch { toast.error(t.error); router.refresh(); }
    })}>{pending ? t.saving : t.continue}</button>
  </StepShell>;
}
