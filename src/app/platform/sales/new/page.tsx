import Link from "next/link";
import { requireSalesActor } from "@/lib/sales-demo";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { salesDemoCopy } from "@/lib/admin-locale/sales-demo";
import { ProspectForm } from "@/components/sales-demo/ProspectForm";
import { PLATFORM } from "@/lib/routes";
export default async function NewSalesDemoPage() {
  await requireSalesActor();
  const locale = await getAdminLocale();
  const t = salesDemoCopy(locale);
  return <div className="mx-auto max-w-3xl space-y-5">
    <Link className="inline-flex min-h-11 items-center text-blue-700" href={PLATFORM.sales}>{t.back}</Link>
    <h1 className="text-2xl font-semibold">{t.newDemo}</h1>
    <ProspectForm locale={locale} />
  </div>;
}
