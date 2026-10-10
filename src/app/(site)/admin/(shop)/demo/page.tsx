import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentDemo } from "@/lib/sales-demo";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { salesDemoExperienceCopy } from "@/lib/admin-locale/sales-demo-experience";
import { DemoExperienceControls } from "@/components/sales-demo/DemoExperienceControls";
export default async function DemoExperiencePage() {
  const demo = await getCurrentDemo();
  if (!demo) redirect("/platform/sales");
  const locale = await getAdminLocale(), t = salesDemoExperienceCopy(locale);
  const links = [["clients", "/admin/clients"], ["appointments", "/admin/appointments"], ["quotes", "/admin/quotes"], ["orders", "/admin/work-orders"],
    ["invoices", "/admin/invoices"], ["inbox", "/admin/inbox"], ["settings", "/admin/settings?tab=booking-page"]] as const;
  return <div className="mx-auto max-w-3xl space-y-5">
    <Link href="/admin/dashboard" className="inline-flex min-h-11 items-center text-blue-700">{t.back}</Link>
    <h1 className="break-words text-2xl font-semibold">{t.title} · {demo.shop.name}</h1>
    <nav className="flex flex-wrap gap-2" aria-label={t.title}>{links.map(([label, href]) => <Link key={label} href={href} className="inline-flex min-h-11 items-center rounded-lg border bg-white px-3 py-2">{t[label]}</Link>)}</nav>
    <section className="space-y-3 rounded-xl border bg-white p-4"><p>{t.bookingHelp}</p>
      {demo.shop.slug && <Link target="_blank" rel="noopener noreferrer" href={"/book/" + encodeURIComponent(demo.shop.slug)} className="inline-flex min-h-11 items-center rounded-lg border px-3 py-2">{t.booking}</Link>}
    </section>
    <DemoExperienceControls demoId={demo.id} enabled={demo.communicationsEnabled} loaded={!!demo.scenarioBatchId} locale={locale} />
  </div>;
}
