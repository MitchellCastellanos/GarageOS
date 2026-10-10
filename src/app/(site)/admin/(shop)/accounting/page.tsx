import { requirePagePermission } from "@/lib/access";
import { ADMIN } from "@/lib/routes";
import { getAccountingPageData } from "@/actions/documents";
import { DOC_CATEGORIES } from "@/lib/validations";
import { AccountingClient } from "@/components/accounting/AccountingClient";
import { InvoiceHistoryPanel } from "@/components/accounting/InvoiceHistoryPanel";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { AccountingLightPanel } from "@/components/accounting/AccountingPanels";
import { ACCOUNTING_DICT } from "@/lib/admin-locale/accounting";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { CAJA_DICT } from "@/lib/admin-locale/caja";

// Server Component: fetches documents y los pasa al Client
interface Props {
  searchParams: Promise<{ tab?: string; preset?: string; from?: string; to?: string; basis?: string }>;
}

export default async function AccountingPage({ searchParams }: Props) {
  await requirePagePermission("financial.view");
  const sp = await searchParams;
  const active = sp.tab ?? "history";
  const { documents } = await getAccountingPageData();
  const locale = await getAdminLocale();
  const t = CAJA_DICT[locale].accountingPage;
  const a = ACCOUNTING_DICT[locale].tabs;
  const input = { preset: sp.preset, from: sp.from, to: sp.to, basis: sp.basis };

  const tabs: TabItem[] = [
    {
      id: "history",
      label: t.tabs.history,
      content: active === "history" ? <InvoiceHistoryPanel /> : null,
    },
    {
      id: "documents",
      label: t.tabs.documents,
      content: <AccountingClient initialDocs={documents} categories={DOC_CATEGORIES} />,
    },
    { id: "summary", label: a.summary, content: active === "summary" ? <AccountingLightPanel tab="summary" input={input} /> : null },
    { id: "taxes", label: a.taxes, content: active === "taxes" ? <AccountingLightPanel tab="taxes" input={input} /> : null },
    { id: "activity", label: a.activity, content: active === "activity" ? <AccountingLightPanel tab="activity" input={input} /> : null },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.subtitle}</p>
      </div>

      <Tabs tabs={tabs} basePath={ADMIN.accounting} />
    </div>
  );
}
