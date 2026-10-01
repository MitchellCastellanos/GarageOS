import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { getEffectiveSubscription } from "@/lib/subscription";
import { AdminLocaleProvider } from "@/components/admin/AdminLocaleProvider";
import { ActivationPayment } from "@/components/sales-demo/ActivationPayment";
import { conversionCopy } from "@/lib/admin-locale/sales-demo-conversion";

export default async function PaymentPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const session = await requireOwner();
  if (session.impersonation) redirect("/platform/sales");
  const demo = await db.salesDemo.findUnique({ where: { shopId: session.user.shopId! }, include: { shop: { select: { name: true } } } });
  if (!demo || demo.activatedOwnerId !== session.user.id) redirect("/admin/dashboard");
  if (demo.status === "CONVERTED") redirect("/admin/dashboard");
  if (demo.status !== "AWAITING_PAYMENT") redirect("/admin/login");
  const locale = await getAdminLocale(); const t = conversionCopy(locale);
  const subscription = await getEffectiveSubscription(demo.shopId);
  const { session_id } = await searchParams;
  return <AdminLocaleProvider locale={locale}><main className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto w-full min-w-0 max-w-3xl space-y-5 rounded-xl border bg-white p-5 sm:p-8">
    <h1 className="text-2xl font-semibold">{t.almost}</h1><h2 className="break-words text-lg">{demo.shop.name}</h2><p>{t.payment}</p>
    <ActivationPayment plan={demo.proposedPlan} interval={demo.proposedBillingInterval} trialEligible={subscription.trialEligible} sessionId={session_id} locale={locale} />
  </div></main></AdminLocaleProvider>;
}
