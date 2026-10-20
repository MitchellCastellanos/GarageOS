import { getCallingPage } from "@/actions/sales-calling";
import { callingCopy } from "@/lib/admin-locale/sales-calling";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { CallingWorkspace } from "@/components/sales-calling/CallingWorkspace";

export const dynamic = "force-dynamic";

export default async function CallingPage() {
  const { actor, t, locale } = await loadCrmPage("place_sales_calls");
  if (!actor) return <PermissionDenied t={t} />;
  const c = callingCopy(locale);
  const data = await getCallingPage();
  return (
    <div className="mx-auto w-full max-w-[120rem] space-y-3">
      <PageHeader title={c.title} subtitle={c.subtitle} />
      <CallingWorkspace data={data} locale={locale} />
    </div>
  );
}
