"use client";

import { releaseDiscoveryReservation } from "@/actions/lead-radar";
import { btnSecondary } from "@/components/sales-crm/ui";
import { FormMessage } from "@/components/sales-crm/useCrmAction";
import { useRadarAction } from "@/components/lead-radar/useRadarAction";

export function ReleaseButton({ locale, ledgerId }: { locale: "en" | "fr"; ledgerId: string }) {
  const { c, pending, error, run } = useRadarAction(locale);
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" className={btnSecondary} disabled={pending} title={c.budget.releaseHelp} onClick={() => { if (window.confirm(c.budget.releaseHelp)) run(() => releaseDiscoveryReservation(ledgerId)); }}>{c.budget.release}</button>
      <FormMessage error={error} />
    </span>
  );
}
