import { expireSalesDemos } from "@/lib/sales-demo-conversion";
import { conversionCopy } from "@/lib/admin-locale/sales-demo-conversion";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireSalesActor } from "@/lib/sales-demo";
import { isDemoAvailable } from "@/domain/sales-demo";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { salesDemoCopy } from "@/lib/admin-locale/sales-demo";
import { PLATFORM } from "@/lib/routes";
import { PLAN_LABELS } from "@/config/entitlements";

export default async function SalesDemosPage() {
  const { actor } = await requireSalesActor();
  await expireSalesDemos();
  const locale = await getAdminLocale();
  const t = salesDemoCopy(locale);
  const demos = await db.salesDemo.findMany({ where: actor.platform.all ? {} : { createdByUserId: { in: [...actor.platform.scopeUserIds] } }, include: { shop: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  const date = (value: Date) => value.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA");
  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold">{t.title}</h1>
      <Link href={PLATFORM.salesNew} className="min-h-11 rounded-lg bg-blue-600 px-4 py-3 text-white">{t.newDemo}</Link>
    </div>
    {!demos.length && <p>{t.empty}</p>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {demos.map((demo) => <article key={demo.id} className="min-w-0 space-y-3 rounded-xl border bg-white p-4">
        <h2 className="break-words text-lg font-semibold">{demo.shop.name}</h2>
        <p className="text-sm text-slate-600">{demo.expiresAt <= new Date() && demo.status !== "CONVERTED" ? t.expired : t.states[demo.status]}</p>
        <p className="text-sm">{t.current}: {PLAN_LABELS[demo.currentPlan]} · {t.proposed}: {PLAN_LABELS[demo.proposedPlan]} ({demo.proposedBillingInterval === "YEARLY" ? "12" : "1"} mo)</p>
        <p className="text-sm text-slate-500">{t.created}: {date(demo.createdAt)}<br />{t.expires}: {date(demo.expiresAt)}</p>
        {isDemoAvailable(demo) && <Link className="inline-flex min-h-11 items-center text-blue-700" href={`/platform/sales/${demo.id}/convert`}>{demo.status === "ACTIVATION_SENT" ? conversionCopy(locale).resend : conversionCopy(locale).title}</Link>}
        {isDemoAvailable(demo) && <Link className="inline-flex min-h-11 items-center rounded-lg border px-4 text-blue-700" href={PLATFORM.salesDemo(demo.id)}>{t.resume}</Link>}
      </article>)}
    </div>
  </div>;
}
