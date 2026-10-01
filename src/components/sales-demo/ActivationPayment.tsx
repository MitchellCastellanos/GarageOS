"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmCheckoutAction } from "@/actions/billing";
import { PlanCheckout } from "@/components/billing/PlanCheckout";
import { conversionCopy } from "@/lib/admin-locale/sales-demo-conversion";
import type { Plan } from "@/config/entitlements";
import type { BillingInterval } from "@/domain/subscription-state";

export function ActivationPayment({ plan, interval, trialEligible, sessionId, locale }: { plan: Plan; interval: BillingInterval; trialEligible: boolean; sessionId?: string; locale: string }) {
  const t = conversionCopy(locale); const router = useRouter(); const [pending, startTransition] = useTransition(); const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!sessionId) return;
    let live = true;
    confirmCheckoutAction(sessionId).then((r) => { if (!live) return; if (r.error) setFailed(true); else router.refresh(); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [sessionId, router]);
  if (sessionId) return <div className="space-y-4"><p role="status">{failed ? t.unconfirmed : t.confirming}</p><button disabled={pending} className="min-h-11 rounded-lg border px-4" onClick={() => startTransition(async () => { try { const r = await confirmCheckoutAction(sessionId); if (r.error) setFailed(true); else router.refresh(); } catch { setFailed(true); } })}>{t.retry}</button></div>;
  return <PlanCheckout returnTo="activation" trialEligible={trialEligible} defaultPlan={plan} defaultInterval={interval} lockSelection />;
}
