import { ADMIN } from "@/lib/routes";
import { getAccountingPageData } from "@/actions/documents";
import { DOC_CATEGORIES } from "@/lib/validations";
import { AccountingClient } from "@/components/accounting/AccountingClient";
import { InvoiceHistoryPanel } from "@/components/accounting/InvoiceHistoryPanel";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { CAJA_DICT } from "@/lib/admin-locale/caja";

// Server Component: fetches documents y los pasa al Client
export default async function AccountingPage() {
  const { documents } = await getAccountingPageData();
  const locale = await getAdminLocale();
  const t = CAJA_DICT[locale].accountingPage;

  const tabs: TabItem[] = [
    {
      id: "history",
      label: t.tabs.history,
      content: <InvoiceHistoryPanel />,
    },
    {
      id: "documents",
      label: t.tabs.documents,
      content: <AccountingClient initialDocs={documents} categories={DOC_CATEGORIES} />,
    },
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
