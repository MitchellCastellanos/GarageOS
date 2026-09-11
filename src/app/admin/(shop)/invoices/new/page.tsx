import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import { redirect } from "next/navigation";
import { InvoiceForm } from "@/components/invoices/InvoiceForm";
import { createInvoice } from "@/actions/invoices";
import { getInvoiceFormData } from "@/actions/invoices";
import { type InvoiceFormData } from "@/lib/validations";

export default async function NewInvoicePage() {
  const { clients } = await getInvoiceFormData();

  if (clients.length === 0) {
    redirect(`${ADMIN.clients}/new?hint=invoice`);
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Nueva factura</h1>
        <p className="text-slate-500 text-sm mt-1">
          Completa los datos para crear una factura electrónica
        </p>
      </div>

      <InvoiceForm
        clients={clients}
        onSubmit={async (data: InvoiceFormData) => {
          "use server";
          return createInvoice(data);
        }}
      />
    </div>
  );
}
