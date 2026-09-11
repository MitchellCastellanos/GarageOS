import { getAccountingPageData } from "@/actions/documents";
import { DOC_CATEGORIES } from "@/lib/validations";
import { AccountingClient } from "@/components/accounting/AccountingClient";

// Server Component: fetches documents y los pasa al Client
export default async function AccountingPage() {
  const { documents } = await getAccountingPageData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Contabilidad</h1>
        <p className="text-slate-500 text-sm mt-1">
          Sube documentos directamente a Google Drive · La contadora recibe una notificación por email
        </p>
      </div>

      <AccountingClient initialDocs={documents} categories={DOC_CATEGORIES} />
    </div>
  );
}
