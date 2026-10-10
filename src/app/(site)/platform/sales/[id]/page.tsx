import Link from "next/link";
import { requirePreparedDemo } from "@/lib/sales-demo";
import { startSalesDemo } from "@/actions/sales-demo";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { salesDemoCopy } from "@/lib/admin-locale/sales-demo";
import { DemoAssetEditor } from "@/components/sales-demo/DemoAssetEditor";
import { PLATFORM } from "@/lib/routes";
export default async function PrepareDemoPage({ params }: { params: Promise<{ id: string }> }) {
  const { demo } = await requirePreparedDemo((await params).id);
  const locale = await getAdminLocale(); const t = salesDemoCopy(locale);
  return <div className="mx-auto max-w-5xl space-y-5">
    <Link href={PLATFORM.sales} className="inline-flex min-h-11 items-center text-blue-700">{t.back}</Link>
    <h1 className="break-words text-2xl font-semibold">{demo.shop.name}</h1>
    <p className="text-slate-600">{t.assetsHint}</p>
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <DemoAssetEditor demoId={demo.id} kind="logo" initialUrl={demo.shop.logoUrl} locale={locale} />
      <DemoAssetEditor demoId={demo.id} kind="cover" initialUrl={demo.shop.bookingCoverImageUrl} locale={locale} />
      <DemoAssetEditor demoId={demo.id} kind="shop" initialUrl={demo.shop.bookingShopImageUrl} locale={locale} />
    </div>
    <form action={async () => { "use server"; await startSalesDemo(demo.id); }}>
      <button className="min-h-11 w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white sm:w-auto">{t.start}</button>
    </form>
  </div>;
}
