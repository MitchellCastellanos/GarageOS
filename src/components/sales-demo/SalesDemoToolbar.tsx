"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { exitSalesDemo, setSalesDemoPlan } from "@/actions/sales-demo";
import { PLANS, PLAN_LABELS, type Plan } from "@/config/entitlements";
import { salesDemoCopy } from "@/lib/admin-locale/sales-demo";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { conversionCopy } from "@/lib/admin-locale/sales-demo-conversion";
import Link from "next/link";
import { salesDemoExperienceCopy } from "@/lib/admin-locale/sales-demo-experience";

export function SalesDemoToolbar({ demoId, shopName, plan }: { demoId: string; shopName: string; plan: Plan }) {
  const locale = useAdminLocale(); const t = salesDemoCopy(locale); const router = useRouter();
  const experience = salesDemoExperienceCopy(useAdminLocale());
  const [pending, startTransition] = useTransition();
  return <aside className="no-print flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-300 bg-amber-100 px-3 py-2 text-sm text-slate-950" aria-label={t.demo}>
    <div className="min-w-0 flex-1 basis-full sm:basis-auto"><strong>{t.demo}</strong><span className="ml-2 break-words">{shopName}</span></div>
    <label className="flex min-w-0 flex-wrap items-center gap-2">{t.viewing}
      <select aria-label={t.plan} disabled={pending} value={plan} className="min-h-11 rounded-lg border border-amber-400 bg-white px-3" onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => { try { const result = await setSalesDemoPlan(demoId, next); if (result.error) toast.error(t.error); router.refresh(); } catch { toast.error(t.error); router.refresh(); } });
      }}>{PLANS.map((p) => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}</select>
    </label>
    <Link href="/admin/demo" className="inline-flex min-h-11 items-center rounded-lg border border-amber-400 bg-white px-3 py-2">{experience.title}</Link>
    <Link href="/admin/demo/convert" className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-3 py-2 text-white">{conversionCopy(locale).title}</Link>
    <button type="button" disabled={pending} className="ml-auto min-h-11 rounded-lg bg-slate-950 px-3 py-2 text-white disabled:opacity-50" onClick={() => startTransition(async () => { await exitSalesDemo(); })}>{t.exit}</button>
  </aside>;
}
