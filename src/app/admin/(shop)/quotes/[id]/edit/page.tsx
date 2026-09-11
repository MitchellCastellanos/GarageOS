import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { getQuoteById, getQuoteFormData, updateQuote } from "@/actions/quotes";
import { type QuoteFormData } from "@/lib/validations";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditQuotePage({ params }: PageProps) {
  const { id } = await params;

  const [quote, { clients }] = await Promise.all([
    getQuoteById(id),
    getQuoteFormData(),
  ]);

  if (quote.status !== "DRAFT") {
    redirect(`${ADMIN.quotes}/${id}`);
  }

  const initialValues: Partial<QuoteFormData> = {
    clientId: quote.clientId,
    taxRate: Number(quote.taxRate),
    language: quote.language as "ES" | "EN" | "FR",
    notes: quote.notes ?? "",
    dueAt: quote.validUntil ? quote.validUntil.toISOString().split("T")[0] : "",
    vehicles: quote.vehicles.map((qv) => ({
      vehicleId: qv.vehicleId,
      mileageIn: qv.mileageIn ?? undefined,
      mileageOut: qv.mileageOut ?? undefined,
      lineItems: qv.lineItems.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        itemType: item.itemType as "LABOUR" | "PART" | "OTHER",
        warrantyTerm: item.warrantyTerm ?? "",
      })),
    })),
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={`/quotes/${id}`}
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Editar {quote.quoteNumber}</h1>
          <p className="text-slate-500 text-sm mt-1">
            Modifica los datos del borrador antes de enviarlo
          </p>
        </div>
      </div>

      <InvoiceForm
        variant="quote"
        clients={clients}
        mode="edit"
        initialValues={initialValues}
        onSubmit={async (data: QuoteFormData) => {
          "use server";
          return updateQuote(id, data);
        }}
      />
    </div>
  );
}
