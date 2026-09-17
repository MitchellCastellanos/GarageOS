import { ADMIN } from "@/lib/routes";
import { redirect } from "next/navigation";
import { WorkOrderForm } from "@/components/work-orders/WorkOrderForm";
import { createWorkOrder, getWorkOrderFormData } from "@/actions/work-orders";
import { type WorkOrderFormData } from "@/lib/validations";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { WORK_ORDERS_DICT } from "@/lib/admin-locale/work-orders";

export default async function NewWorkOrderPage() {
  const { clients, mechanics } = await getWorkOrderFormData();

  if (clients.length === 0) {
    redirect(`${ADMIN.clients}/new?hint=workOrder`);
  }

  const locale = await getAdminLocale();
  const t = WORK_ORDERS_DICT[locale];

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t.new.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.new.subtitle}</p>
      </div>

      <WorkOrderForm
        clients={clients}
        mechanics={mechanics}
        onSubmit={async (data: WorkOrderFormData) => {
          "use server";
          return createWorkOrder(data);
        }}
      />
    </div>
  );
}
