import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import { redirect } from "next/navigation";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { createQuote, getQuoteFormData } from "@/actions/quotes";
import { type QuoteFormData } from "@/lib/validations";

export default async function NewQuotePage() {
  const { clients } = await getQuoteFormData();

  if (clients.length === 0) {
    redirect(`${ADMIN.clients}/new?hint=quote`);
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Nueva cotización</h1>
        <p className="text-slate-500 text-sm mt-1">
          Completa los datos para crear una cotización
        </p>
      </div>

      <InvoiceForm
        variant="quote"
        clients={clients}
        onSubmit={async (data: QuoteFormData) => {
          "use server";
          return createQuote(data);
        }}
      />
    </div>
  );
}
