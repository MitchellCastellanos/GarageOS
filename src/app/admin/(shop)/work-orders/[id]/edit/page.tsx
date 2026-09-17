import { ADMIN } from "@/lib/routes";
import { redirect } from "next/navigation";
import { WorkOrderForm } from "@/components/work-orders/WorkOrderForm";
import { getWorkOrderById, getWorkOrderFormData, updateWorkOrder } from "@/actions/work-orders";
import { type WorkOrderFormData } from "@/lib/validations";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { WORK_ORDERS_DICT } from "@/lib/admin-locale/work-orders";

const EDITABLE_STATUSES = new Set(["OPEN", "AWAITING_APPROVAL", "APPROVED", "IN_PROGRESS"]);

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditWorkOrderPage({ params }: PageProps) {
  const { id } = await params;
  const [workOrder, { clients, mechanics }, locale] = await Promise.all([
    getWorkOrderById(id),
    getWorkOrderFormData(),
    getAdminLocale(),
  ]);

  if (!EDITABLE_STATUSES.has(workOrder.status)) {
    redirect(`${ADMIN.workOrders}/${id}`);
  }

  const t = WORK_ORDERS_DICT[locale];

  const initialValues: Partial<WorkOrderFormData> = {
    clientId: workOrder.clientId,
    vehicleId: workOrder.vehicleId,
    mechanicId: workOrder.mechanicId ?? "",
    concern: workOrder.concern,
    diagnosis: workOrder.diagnosis ?? "",
    mileageIn: workOrder.mileageIn,
    mileageOut: workOrder.mileageOut,
    lineItems: workOrder.lines.map((line) => ({
      description: line.description,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      itemType: line.itemType,
      warrantyTerm: line.warrantyTerm ?? "",
    })),
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t.edit.title(workOrder.orderNumber)}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.edit.subtitle}</p>
      </div>

      <WorkOrderForm
        clients={clients}
        mechanics={mechanics}
        mode="edit"
        initialValues={initialValues}
        onSubmit={async (data: WorkOrderFormData) => {
          "use server";
          return updateWorkOrder(id, data);
        }}
      />
    </div>
  );
}
