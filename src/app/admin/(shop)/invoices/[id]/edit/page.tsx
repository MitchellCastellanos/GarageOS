import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { getInvoiceById, getInvoiceFormData, updateInvoice } from "@/actions/invoices";
import { type InvoiceFormData } from "@/lib/validations";
import { isInvoicePending } from "@/lib/invoice-status";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditInvoicePage({ params }: PageProps) {
  const { id } = await params;

  const [invoice, { clients }] = await Promise.all([
    getInvoiceById(id),
    getInvoiceFormData(),
  ]);

  if (!isInvoicePending(invoice.status)) {
    redirect(`${ADMIN.invoices}/${id}`);
  }

  const initialValues: Partial<InvoiceFormData> = {
    clientId: invoice.clientId,
    taxRate: Number(invoice.taxRate),
    language: invoice.language as "ES" | "EN" | "FR",
    notes: invoice.notes ?? "",
    dueAt: invoice.dueAt ? invoice.dueAt.toISOString().split("T")[0] : "",
    vehicles: invoice.vehicles.map((iv) => ({
      vehicleId: iv.vehicleId,
      mileageIn: iv.mileageIn ?? undefined,
      mileageOut: iv.mileageOut ?? undefined,
      lineItems: iv.lineItems.map((item) => ({
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
          href={`/invoices/${id}`}
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Editar {invoice.invoiceNumber}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Modifica los datos del borrador antes de enviarlo
          </p>
        </div>
      </div>

      <InvoiceForm
        clients={clients}
        mode="edit"
        initialValues={initialValues}
        onSubmit={async (data: InvoiceFormData) => {
          "use server";
          return updateInvoice(id, data);
        }}
      />
    </div>
  );
}
