"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition, useMemo } from "react";
import { newInspectionSchema, type NewInspectionFormData } from "@/lib/validations";
import { formatClientName } from "@/lib/client-name";
import { ClientCombobox } from "@/components/invoices/ClientCombobox";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { INSPECTIONS_DICT } from "@/lib/admin-locale/inspections";

interface VehicleOption {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
}

interface ClientOption {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  vehicles: VehicleOption[];
}

interface MechanicOption {
  id: string;
  name: string;
}

interface WorkOrderOption {
  id: string;
  orderNumber: string;
  vehicleId: string;
}

interface NewInspectionFormProps {
  clients: ClientOption[];
  mechanics: MechanicOption[];
  workOrders: WorkOrderOption[];
  onSubmit: (data: NewInspectionFormData) => Promise<{ error?: Record<string, string[]> } | void>;
}

export function NewInspectionForm({ clients, mechanics, workOrders, onSubmit }: NewInspectionFormProps) {
  const [isPending, startTransition] = useTransition();
  const locale = useAdminLocale();
  const t = INSPECTIONS_DICT[locale].form;

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<NewInspectionFormData>({
    resolver: zodResolver(newInspectionSchema),
    defaultValues: {
      clientId: "",
      vehicleId: "",
      workOrderId: "",
      mechanicId: "",
      mileage: undefined,
    },
  });

  const selectedClientId = watch("clientId");
  const selectedVehicleId = watch("vehicleId");

  const sortedClients = useMemo(
    () =>
      [...clients].sort((a, b) =>
        formatClientName(a).localeCompare(formatClientName(b), "es", { sensitivity: "base" })
      ),
    [clients]
  );

  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const clientVehicles = selectedClient?.vehicles ?? [];
  const availableWorkOrders = workOrders.filter((wo) => wo.vehicleId === selectedVehicleId);

  async function onValid(data: NewInspectionFormData) {
    startTransition(async () => {
      const result = await onSubmit(data);
      if (result?.error) {
        for (const [field, messages] of Object.entries(result.error)) {
          setError(field as keyof NewInspectionFormData, { message: messages[0] });
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">{t.clientSectionTitle}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.clientLabel}</label>
            <Controller
              control={control}
              name="clientId"
              render={({ field }) => (
                <ClientCombobox
                  clients={sortedClients}
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    setValue("vehicleId", "");
                    setValue("workOrderId", "");
                  }}
                  hasError={!!errors.clientId}
                />
              )}
            />
            {errors.clientId && <p className="text-red-600 text-xs mt-1">{errors.clientId.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.vehicleLabel}</label>
            <select
              {...register("vehicleId", {
                onChange: () => setValue("workOrderId", ""),
              })}
              disabled={!selectedClientId || clientVehicles.length === 0}
              className={selectClass(!!errors.vehicleId)}
            >
              <option value="">
                {!selectedClientId
                  ? t.selectClientFirst
                  : clientVehicles.length === 0
                  ? t.noVehiclesAvailable
                  : t.selectVehiclePlaceholder}
              </option>
              {clientVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.year} {v.make} {v.model} — {v.licensePlate}
                </option>
              ))}
            </select>
            {errors.vehicleId && <p className="text-red-600 text-xs mt-1">{errors.vehicleId.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.mechanicLabel}</label>
            <select {...register("mechanicId")} className={selectClass(false)}>
              <option value="">{t.unassignedOption}</option>
              {mechanics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.workOrderLabel}</label>
            <select {...register("workOrderId")} disabled={!selectedVehicleId} className={selectClass(false)}>
              <option value="">{t.noWorkOrderOption}</option>
              {availableWorkOrders.map((wo) => (
                <option key={wo.id} value={wo.id}>
                  {wo.orderNumber}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.mileageLabel}</label>
            <input
              {...register("mileage", { setValueAs: emptyToNull })}
              type="number"
              min={0}
              placeholder="75,000"
              className={inputClass(false)}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors"
        >
          {isPending ? t.creating : t.createButton}
        </button>
        <a href="/inspections" className="text-sm text-slate-500 hover:text-slate-800 transition-colors">
          {t.cancel}
        </a>
      </div>
    </form>
  );
}

function emptyToNull(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

function inputClass(hasError: boolean) {
  return [
    "w-full px-3 py-2 border rounded-lg text-sm",
    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
    hasError ? "border-red-400 bg-red-50" : "border-slate-300",
  ].join(" ");
}

function selectClass(hasError: boolean) {
  return [
    "w-full px-3 py-2 border rounded-lg text-sm bg-white",
    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
    hasError ? "border-red-400 bg-red-50" : "border-slate-300",
  ].join(" ");
}
