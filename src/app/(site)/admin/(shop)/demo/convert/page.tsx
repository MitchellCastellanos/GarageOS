import { getCurrentDemo, requireSalesActor } from "@/lib/sales-demo";
import { redirect } from "next/navigation";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { ConversionForm } from "@/components/sales-demo/ConversionForm";
import { conversionCopy } from "@/lib/admin-locale/sales-demo-conversion";

export default async function ConvertPage() {
  await requireSalesActor(); const demo = await getCurrentDemo();
  if (!demo) redirect("/platform/sales");
  const locale = await getAdminLocale();
  return <div className="mx-auto w-full min-w-0 max-w-xl space-y-5"><h1 className="text-2xl font-semibold">{conversionCopy(locale).title}</h1><h2 className="break-words text-lg">{demo.shop.name}</h2>
    <ConversionForm demoId={demo.id} ownerName={demo.ownerName ?? demo.contactName ?? ""} ownerEmail={demo.ownerEmail ?? demo.contactEmail ?? ""}
      plan={demo.activationSentAt ? demo.proposedPlan : demo.currentPlan} interval={demo.proposedBillingInterval} sent={demo.status === "ACTIVATION_SENT"} activated={demo.status === "AWAITING_PAYMENT"} locale={locale} />
  </div>;
}
