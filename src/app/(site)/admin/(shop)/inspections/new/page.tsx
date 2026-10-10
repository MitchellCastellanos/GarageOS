import { ADMIN } from "@/lib/routes";
import { redirect } from "next/navigation";
import { NewInspectionForm } from "@/components/inspections/NewInspectionForm";
import { createInspection, getInspectionFormData } from "@/actions/inspections";
import { type NewInspectionFormData } from "@/lib/validations";
import { getInspectionTemplates } from "@/actions/inspection-templates";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { INSPECTIONS_DICT } from "@/lib/admin-locale/inspections";

export default async function NewInspectionPage() {
  const [{ clients, mechanics, workOrders }, templates] = await Promise.all([getInspectionFormData(), getInspectionTemplates()]);

  if (clients.length === 0) {
    redirect(`${ADMIN.clients}/new?hint=inspection`);
  }

  const locale = await getAdminLocale();
  const t = INSPECTIONS_DICT[locale];

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t.new.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.new.subtitle}</p>
      </div>

      <NewInspectionForm
        clients={clients}
        mechanics={mechanics}
        workOrders={workOrders}
        templates={templates.map((x) => ({ id: x.id, name: x.name }))}
        onSubmit={async (data: NewInspectionFormData) => {
          "use server";
          return createInspection(data);
        }}
      />
    </div>
  );
}
