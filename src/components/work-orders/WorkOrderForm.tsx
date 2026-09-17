"use client";

import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition, useMemo } from "react";
import { workOrderSchema, type WorkOrderFormData } from "@/lib/validations";
import { formatClientName } from "@/lib/client-name";
import { Plus, Trash2 } from "lucide-react";
import { LineItemDescriptionInput } from "@/components/invoices/LineItemDescriptionInput";
import { ClientCombobox } from "@/components/invoices/ClientCombobox";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { WORK_ORDERS_DICT } from "@/lib/admin-locale/work-orders";
import Decimal from "decimal.js";

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

interface WorkOrderFormProps {
  clients: ClientOption[];
  mechanics: MechanicOption[];
  onSubmit: (data: WorkOrderFormData) => Promise<{ error?: Record<string, string[]> } | void>;
  initialValues?: Partial<WorkOrderFormData>;
  mode?: "create" | "edit";
}

const EMPTY_LINE_ITEM = {
  description: "",
  quantity: 1,
  unitPrice: 0,
  itemType: "LABOUR" as const,
  warrantyTerm: "",
};

export function WorkOrderForm({
  clients,
  mechanics,
  onSubmit,
  initialValues,
  mode = "create",
}: WorkOrderFormProps) {
  const [isPending, startTransition] = useTransition();
  const locale = useAdminLocale();
  const t = WORK_ORDERS_DICT[locale].form;
  const itemTypeLabels = WORK_ORDERS_DICT[locale].itemTypes;
  const ITEM_TYPES = [
    { value: "LABOUR", label: itemTypeLabels.LABOUR },
    { value: "PART", label: itemTypeLabels.PART },
    { value: "OTHER", label: itemTypeLabels.OTHER },
  ];

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<WorkOrderFormData>({
    resolver: zodResolver(workOrderSchema),
    defaultValues: {
      clientId: "",
      vehicleId: "",
      mechanicId: "",
      concern: "",
      diagnosis: "",
      mileageIn: undefined,
      mileageOut: undefined,
      lineItems: [{ ...EMPTY_LINE_ITEM }],
      ...initialValues,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });

  const selectedClientId = watch("clientId");
  const lineItems = useWatch({ control, name: "lineItems" });

  const sortedClients = useMemo(
    () =>
      [...clients].sort((a, b) =>
        formatClientName(a).localeCompare(formatClientName(b), "es", { sensitivity: "base" })
      ),
    [clients]
  );

  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const clientVehicles = selectedClient?.vehicles ?? [];

  const subtotal = useMemo(() => {
    return (lineItems ?? []).reduce((sum: Decimal, item: { quantity?: number; unitPrice?: number }) => {
      const qty = Number(item?.quantity) || 0;
      const price = Number(item?.unitPrice) || 0;
      return sum.plus(new Decimal(qty).times(price));
    }, new Decimal(0));
  }, [lineItems]);

  async function onValid(data: WorkOrderFormData) {
    startTransition(async () => {
      const result = await onSubmit(data);
      if (result?.error) {
        for (const [field, messages] of Object.entries(result.error)) {
          setError(field as keyof WorkOrderFormData, { message: messages[0] });
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-6">
      {/* Cliente y vehículo */}
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
              {...register("vehicleId")}
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
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.mileageInLabel}</label>
            <input
              {...register("mileageIn", { setValueAs: emptyToNull })}
              type="number"
              min={0}
              placeholder="75,000"
              className={inputClass(false)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.mileageOutLabel}</label>
            <input
              {...register("mileageOut", { setValueAs: emptyToNull })}
              type="number"
              min={0}
              placeholder="75,050"
              className={inputClass(false)}
            />
          </div>
        </div>
      </div>

      {/* Motivo / diagnóstico */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.concernLabel}</label>
          <textarea
            {...register("concern")}
            rows={2}
            placeholder={t.concernPlaceholder}
            className={inputClass(!!errors.concern)}
          />
          {errors.concern && <p className="text-red-600 text-xs mt-1">{errors.concern.message}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.diagnosisLabel}</label>
          <textarea
            {...register("diagnosis")}
            rows={3}
            placeholder={t.diagnosisPlaceholder}
            className={inputClass(false)}
          />
        </div>
      </div>

      {/* Líneas de trabajo */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">{t.lineItemsTitle}</h2>
          <p className="text-xs text-slate-500 mt-1">{t.lineItemsHint}</p>
        </div>

        <div className="hidden sm:grid grid-cols-[1fr_120px_90px_100px_110px_80px_36px] gap-3 px-5 py-2 bg-slate-50 border-b border-slate-100">
          <span className="text-xs font-medium text-slate-500 uppercase">{t.tableHeaders.description}</span>
          <span className="text-xs font-medium text-slate-500 uppercase">{t.tableHeaders.type}</span>
          <span className="text-xs font-medium text-slate-500 uppercase">{t.tableHeaders.warranty}</span>
          <span className="text-xs font-medium text-slate-500 uppercase text-right">{t.tableHeaders.quantity}</span>
          <span className="text-xs font-medium text-slate-500 uppercase text-right">{t.tableHeaders.unitPrice}</span>
          <span className="text-xs font-medium text-slate-500 uppercase text-right">{t.tableHeaders.total}</span>
          <span />
        </div>

        <div className="divide-y divide-slate-100">
          {fields.map((field, index) => {
            const qty = Number(lineItems?.[index]?.quantity) || 0;
            const price = Number(lineItems?.[index]?.unitPrice) || 0;
            const lineTotal = new Decimal(qty).times(price);
            const itemErrors = errors.lineItems?.[index];

            return (
              <div
                key={field.id}
                className="grid grid-cols-[1fr_36px] sm:grid-cols-[1fr_120px_90px_100px_110px_80px_36px] gap-3 px-5 py-3 items-start"
              >
                <div>
                  <Controller
                    control={control}
                    name={`lineItems.${index}.description` as const}
                    render={({ field }) => (
                      <LineItemDescriptionInput
                        value={field.value}
                        onChange={field.onChange}
                        onSelectSuggestion={(s) => {
                          field.onChange(s.description);
                          setValue(`lineItems.${index}.itemType` as const, s.itemType);
                          setValue(`lineItems.${index}.unitPrice` as const, s.unitPrice);
                        }}
                        hasError={!!itemErrors?.description}
                        inputClass={inputClass(!!itemErrors?.description)}
                      />
                    )}
                  />
                  {itemErrors?.description && (
                    <p className="text-red-600 text-xs mt-1">{itemErrors.description?.message}</p>
                  )}
                  <input
                    {...register(`lineItems.${index}.warrantyTerm` as const)}
                    type="text"
                    placeholder={t.warrantyPlaceholder}
                    className={`${inputClass(false)} text-xs mt-2 sm:hidden`}
                  />
                  <div className="sm:hidden grid grid-cols-3 gap-2 mt-2">
                    <select
                      {...register(`lineItems.${index}.itemType` as const)}
                      className={`${selectClass(false)} text-xs py-1.5`}
                    >
                      {ITEM_TYPES.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      {...register(`lineItems.${index}.quantity` as const, { valueAsNumber: true })}
                      type="number"
                      min={0}
                      step="0.5"
                      placeholder="1"
                      className={`${inputClass(false)} text-xs py-1.5`}
                    />
                    <input
                      {...register(`lineItems.${index}.unitPrice` as const, { valueAsNumber: true })}
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      className={`${inputClass(false)} text-xs py-1.5`}
                    />
                  </div>
                </div>

                <select
                  {...register(`lineItems.${index}.itemType` as const)}
                  className={`${selectClass(false)} hidden sm:block`}
                >
                  {ITEM_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <input
                  {...register(`lineItems.${index}.warrantyTerm` as const)}
                  type="text"
                  placeholder={t.warrantyPlaceholder}
                  className={`${inputClass(false)} hidden sm:block text-xs`}
                />

                <input
                  {...register(`lineItems.${index}.quantity` as const, { valueAsNumber: true })}
                  type="number"
                  min={0}
                  step="0.5"
                  placeholder="1"
                  className={`${inputClass(false)} text-right hidden sm:block`}
                />

                <div className="hidden sm:block relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input
                    {...register(`lineItems.${index}.unitPrice` as const, { valueAsNumber: true })}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    className={`${inputClass(false)} pl-6 text-right`}
                  />
                </div>

                <div className="hidden sm:flex items-center justify-end">
                  <span className="text-sm font-medium text-slate-900">${lineTotal.toFixed(2)}</span>
                </div>

                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="flex items-center justify-center w-8 h-8 mt-0.5 text-slate-400 hover:text-red-500 transition-colors rounded"
                  title={t.removeLineTitle}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => append({ ...EMPTY_LINE_ITEM })}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t.addLine}
          </button>
          <div className="text-sm text-slate-600">
            {t.subtotalLabel}: <span className="font-semibold text-slate-900">${subtotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors"
        >
          {isPending ? t.saving : mode === "edit" ? t.saveChanges : t.createDraft}
        </button>
        <a href="/work-orders" className="text-sm text-slate-500 hover:text-slate-800 transition-colors">
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
