import { getAccountingPageData } from "@/actions/documents";
import { DOC_CATEGORIES } from "@/lib/validations";
import { AccountingClient } from "@/components/accounting/AccountingClient";
import { getAdminLocale } from "@/lib/admin-locale";
import { CAJA_DICT } from "@/lib/admin-locale/caja";

// Server Component: fetches documents y los pasa al Client
export default async function AccountingPage() {
  const { documents } = await getAccountingPageData();
  const locale = await getAdminLocale();
  const t = CAJA_DICT[locale].accountingPage;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.subtitle}</p>
      </div>

      <AccountingClient initialDocs={documents} categories={DOC_CATEGORIES} />
    </div>
  );
}
