"use client";

// InvoiceForm — constructor de facturas con vehículos y líneas dinámicas.
//
// Conceptos clave:
// - useFieldArray(): de React Hook Form, maneja arrays dinámicos (vehículos y,
//   dentro de cada vehículo, sus líneas de servicio). Cada vehículo tiene su
//   propio sub-formulario de líneas — por eso VehicleSection llama su propio
//   useFieldArray (las reglas de hooks no permiten llamarlo dentro de un map).
// - watch(): observa valores del form en tiempo real para calcular totales.
// - Los totales se calculan en el cliente para feedback inmediato,
//   pero se RE-CALCULAN en el servidor (Server Action) para seguridad.

import { useForm, useFieldArray, useWatch, Controller, type Control, type UseFormRegister, type UseFormSetValue, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition, useMemo } from "react";
import { invoiceSchema, type InvoiceFormData } from "@/lib/validations";
import { formatClientName } from "@/lib/client-name";
import { calculateTaxBreakdown, sumTaxLineRates, type ShopTaxLine } from "@/lib/taxes";
import { INVOICE_LANGUAGES } from "@/lib/invoice-i18n";
import { Plus, Trash2 } from "lucide-react";
import { LineItemDescriptionInput } from "@/components/invoices/LineItemDescriptionInput";
import { ClientCombobox } from "@/components/invoices/ClientCombobox";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { INVOICES_DICT, type InvoicesDictionary } from "@/lib/admin-locale/invoices";
import Decimal from "decimal.js";

// Tipos de los datos que necesita el form (vienen del servidor)
interface VehicleOption {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
}

interface Client {
  id: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  vehicles: VehicleOption[];
}

interface InvoiceFormProps {
  clients: Client[];
  onSubmit: (data: InvoiceFormData) => Promise<{ error?: Record<string, string[]> } | void>;
  initialValues?: Partial<InvoiceFormData>;
  mode?: "create" | "edit";
  variant?: "invoice" | "quote";
  /** Impuestos configurados por el taller — ver Shop.taxLines. */
  taxLines: ShopTaxLine[];
}

const EMPTY_LINE_ITEM = {
  description: "",
  quantity: 1,
  unitPrice: 0,
  itemType: "LABOUR" as const,
  warrantyTerm: "",
};

const EMPTY_VEHICLE_ENTRY = {
  vehicleId: "",
  mileageIn: undefined,
  mileageOut: undefined,
  lineItems: [{ ...EMPTY_LINE_ITEM }],
};

export function InvoiceForm({
  clients,
  onSubmit,
  initialValues,
  mode = "create",
  variant = "invoice",
  taxLines,
}: InvoiceFormProps) {
  const isQuote = variant === "quote";
  const cancelHref = isQuote ? "/quotes" : "/invoices";
  const [isPending, startTransition] = useTransition();
  const locale = useAdminLocale();
  const t = INVOICES_DICT[locale].form;
  const itemTypeLabels = INVOICES_DICT[locale].itemTypes;
  const ITEM_TYPES = [
    { value: "LABOUR", label: itemTypeLabels.LABOUR },
    { value: "PART", label: itemTypeLabels.PART },
    { value: "OTHER", label: itemTypeLabels.OTHER },
  ];
  const defaultTaxRate = sumTaxLineRates(taxLines).toNumber();

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      clientId: "",
      taxRate: defaultTaxRate,
      language: "EN",
      notes: "",
      dueAt: "",
      vehicles: [{ ...EMPTY_VEHICLE_ENTRY, lineItems: [{ ...EMPTY_LINE_ITEM }] }],
      ...initialValues,
    },
  });

  // useFieldArray maneja el array de vehículos de la factura
  const { fields: vehicleFields, append: appendVehicle, remove: removeVehicle } = useFieldArray({
    control,
    name: "vehicles",
  });

  // watch() lee valores en tiempo real para el cliente seleccionado
  const selectedClientId = watch("clientId");
  const vehicleEntries = useWatch({ control, name: "vehicles" });
  const taxRate = watch("taxRate");

  // Clientes ordenados alfabéticamente por nombre mostrado (el orden del
  // servidor puede dejar clientes sin apellido -empresas- desordenados)
  const sortedClients = useMemo(
    () =>
      [...clients].sort((a, b) =>
        formatClientName(a).localeCompare(formatClientName(b), "es", { sensitivity: "base" })
      ),
    [clients]
  );

  // Vehículos disponibles del cliente seleccionado
  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const clientVehicles = selectedClient?.vehicles ?? [];

  // Calcular totales en tiempo real (suma de líneas de TODOS los vehículos)
  const { subtotal, taxLineAmounts, taxAmount, total } = useMemo(() => {
    const sub = (vehicleEntries ?? []).reduce((vSum, entry) => {
      const lines = entry?.lineItems ?? [];
      return lines.reduce((sum, item) => {
        const qty = Number(item?.quantity) || 0;
        const price = Number(item?.unitPrice) || 0;
        return sum.plus(new Decimal(qty).times(price));
      }, vSum);
    }, new Decimal(0));
    const rate = taxRate ?? defaultTaxRate;
    const { lines, taxAmount: tax } = calculateTaxBreakdown(sub, rate, taxLines);
    return {
      subtotal: sub,
      taxLineAmounts: lines,
      taxAmount: tax,
      total: sub.plus(tax),
    };
  }, [vehicleEntries, taxRate, defaultTaxRate, taxLines]);

  const effectiveRate = taxRate ?? defaultTaxRate;
  const combinedPct = new Decimal(effectiveRate).times(100).toFixed(2);

  async function onValid(data: InvoiceFormData) {
    startTransition(async () => {
      const result = await onSubmit(data);
      if (result?.error) {
        for (const [field, messages] of Object.entries(result.error)) {
          setError(field as keyof InvoiceFormData, { message: messages[0] });
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-6">

      {/* ── Cliente y datos generales ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">{t.clientSectionTitle}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Cliente */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t.clientLabel}
            </label>
            <Controller
              control={control}
              name="clientId"
              render={({ field }) => (
                <ClientCombobox
                  clients={sortedClients}
                  value={field.value}
                  onChange={field.onChange}
                  hasError={!!errors.clientId}
                />
              )}
            />
            {errors.clientId && (
              <p className="text-red-600 text-xs mt-1">{errors.clientId.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {isQuote ? t.validUntilLabel : t.dueDateLabel}
            </label>
            <input
              {...register("dueAt")}
              type="date"
              className={inputClass(false)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {isQuote ? t.quoteLanguageLabel : t.invoiceLanguageLabel}
            </label>
            <select {...register("language")} className={selectClass(!!errors.language)}>
              {INVOICE_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Vehículos (uno o varios) ── */}
      <div className="space-y-4">
        {errors.vehicles?.root?.message && (
          <p className="text-red-600 text-sm">{errors.vehicles.root.message}</p>
        )}
        {typeof errors.vehicles?.message === "string" && (
          <p className="text-red-600 text-sm">{errors.vehicles.message}</p>
        )}

        {vehicleFields.map((field, vehicleIndex) => {
          // Vehículos ya elegidos en otros grupos — los ocultamos para evitar duplicados
          const chosenElsewhere = new Set(
            (vehicleEntries ?? [])
              .map((e, i) => (i === vehicleIndex ? null : e?.vehicleId))
              .filter((id): id is string => Boolean(id))
          );
          const currentVehicleId = vehicleEntries?.[vehicleIndex]?.vehicleId;
          const availableVehicles = clientVehicles.filter(
            (v) => v.id === currentVehicleId || !chosenElsewhere.has(v.id)
          );

          return (
            <VehicleSection
              key={field.id}
              vehicleIndex={vehicleIndex}
              control={control}
              register={register}
              setValue={setValue}
              errors={errors}
              isQuote={isQuote}
              selectedClientId={selectedClientId}
              availableVehicles={availableVehicles}
              canRemove={vehicleFields.length > 1}
              onRemove={() => removeVehicle(vehicleIndex)}
              t={t}
              itemTypes={ITEM_TYPES}
            />
          );
        })}

        <button
          type="button"
          onClick={() => appendVehicle({ ...EMPTY_VEHICLE_ENTRY, lineItems: [{ ...EMPTY_LINE_ITEM }] })}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t.addVehicle}
        </button>
      </div>

      {/* ── Totales + Impuestos + Notas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Notas */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <label className="block text-sm font-semibold text-slate-900 mb-3">
            {t.notesLabel}
          </label>
          <textarea
            {...register("notes")}
            rows={4}
            placeholder={t.notesPlaceholder}
            className={inputClass(false)}
          />
        </div>

        {/* Totales */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">{t.summaryTitle}</h2>

          {/* Tasa de impuesto */}
          <div className="flex items-center justify-between text-sm mb-4">
            <label className="text-slate-600">
              {t.taxRateLabel}
            </label>
            <div className="flex items-center gap-1">
              <input
                {...register("taxRate", { valueAsNumber: true })}
                type="number"
                min={0}
                max={1}
                step="0.00001"
                className="w-24 text-right border border-slate-300 rounded px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
              />
              <span className="text-slate-500 text-sm">({combinedPct}%)</span>
            </div>
          </div>

          <div className="space-y-2 text-sm border-t border-slate-100 pt-3">
            <div className="flex justify-between">
              <span className="text-slate-600">{t.subtotal}</span>
              <span className="text-slate-900">${subtotal.toFixed(2)}</span>
            </div>
            {taxLineAmounts.map((line) => (
              <div className="flex justify-between" key={line.name}>
                <span className="text-slate-600">{t.taxLine(line.name, line.pct)}</span>
                <span className="text-slate-900">${line.amount.toFixed(2)}</span>
              </div>
            ))}
            {taxLineAmounts.length > 1 && (
              <div className="flex justify-between text-slate-500">
                <span className="text-xs">{t.totalTaxes(combinedPct)}</span>
                <span className="text-xs">${taxAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center border-t border-slate-200 pt-3 mt-3">
              <span className="font-semibold text-slate-900">{t.totalCad}</span>
              <span className="text-xl font-bold text-blue-600">
                ${total.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Acciones ── */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors"
        >
          {isPending
            ? t.saving
            : mode === "edit"
            ? t.saveChanges
            : isQuote
            ? t.createQuoteDraft
            : t.createInvoiceDraft}
        </button>
        <a
          href={cancelHref}
          className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          {t.cancel}
        </a>
      </div>
    </form>
  );
}

// ── Sección de un vehículo: selección + kilometraje + sus líneas de servicio ──
// Vive en su propio componente porque useFieldArray no puede llamarse dentro
// de un map (reglas de hooks): cada vehículo necesita su propio array de líneas.
function VehicleSection({
  vehicleIndex,
  control,
  register,
  setValue,
  errors,
  isQuote,
  selectedClientId,
  availableVehicles,
  canRemove,
  onRemove,
  t,
  itemTypes,
}: {
  vehicleIndex: number;
  control: Control<InvoiceFormData>;
  register: UseFormRegister<InvoiceFormData>;
  setValue: UseFormSetValue<InvoiceFormData>;
  errors: FieldErrors<InvoiceFormData>;
  isQuote: boolean;
  selectedClientId: string;
  availableVehicles: VehicleOption[];
  canRemove: boolean;
  onRemove: () => void;
  t: InvoicesDictionary["form"];
  itemTypes: { value: string; label: string }[];
}) {
  const lineItemsName = `vehicles.${vehicleIndex}.lineItems` as const;
  const { fields, append, remove } = useFieldArray({ control, name: lineItemsName });
  const lineItems = useWatch({ control, name: lineItemsName });

  const vehicleErrors = errors.vehicles?.[vehicleIndex];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Selección de vehículo + kilometraje */}
      <div className="p-5 space-y-4 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold text-slate-900">
            {t.vehicle.numbered(vehicleIndex + 1)}
          </h2>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors"
              title={t.vehicle.removeTitle}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t.vehicle.remove}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t.vehicle.vehicleLabel}
            </label>
            <select
              {...register(`vehicles.${vehicleIndex}.vehicleId` as const)}
              disabled={!selectedClientId || availableVehicles.length === 0}
              className={selectClass(!!vehicleErrors?.vehicleId)}
            >
              <option value="">
                {!selectedClientId
                  ? t.vehicle.selectClientFirst
                  : availableVehicles.length === 0
                  ? t.vehicle.noVehiclesAvailable
                  : t.vehicle.selectPlaceholder}
              </option>
              {availableVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.year} {v.make} {v.model} — {v.licensePlate}
                </option>
              ))}
            </select>
            {vehicleErrors?.vehicleId && (
              <p className="text-red-600 text-xs mt-1">{vehicleErrors.vehicleId.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t.vehicle.mileageInLabel}
            </label>
            <input
              {...register(`vehicles.${vehicleIndex}.mileageIn` as const, { setValueAs: emptyToNull })}
              type="number"
              min={0}
              placeholder="75,000"
              className={inputClass(false)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t.vehicle.mileageOutLabel}
            </label>
            <input
              {...register(`vehicles.${vehicleIndex}.mileageOut` as const, { setValueAs: emptyToNull })}
              type="number"
              min={0}
              placeholder="75,050"
              className={inputClass(false)}
            />
          </div>
        </div>
      </div>

      {/* Líneas de servicio de este vehículo */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">{t.vehicle.servicesTitle}</h3>
        {vehicleErrors?.lineItems?.root && (
          <p className="text-red-600 text-xs mt-1">{vehicleErrors.lineItems.root.message}</p>
        )}
        {typeof vehicleErrors?.lineItems?.message === "string" && (
          <p className="text-red-600 text-xs mt-1">{vehicleErrors.lineItems.message}</p>
        )}
      </div>

      {/* Header de la tabla */}
      <div className="hidden sm:grid grid-cols-[1fr_120px_90px_100px_110px_80px_36px] gap-3 px-5 py-2 bg-slate-50 border-b border-slate-100">
        <span className="text-xs font-medium text-slate-500 uppercase">{t.vehicle.tableHeaders.description}</span>
        <span className="text-xs font-medium text-slate-500 uppercase">{t.vehicle.tableHeaders.type}</span>
        <span className="text-xs font-medium text-slate-500 uppercase">{t.vehicle.tableHeaders.warranty}</span>
        <span className="text-xs font-medium text-slate-500 uppercase text-right">{t.vehicle.tableHeaders.quantity}</span>
        <span className="text-xs font-medium text-slate-500 uppercase text-right">{t.vehicle.tableHeaders.unitPrice}</span>
        <span className="text-xs font-medium text-slate-500 uppercase text-right">{t.vehicle.tableHeaders.total}</span>
        <span />
      </div>

      {/* Filas de líneas */}
      <div className="divide-y divide-slate-100">
        {fields.map((field, index) => {
          const qty = Number(lineItems?.[index]?.quantity) || 0;
          const price = Number(lineItems?.[index]?.unitPrice) || 0;
          const lineTotal = new Decimal(qty).times(price);
          const itemErrors = vehicleErrors?.lineItems?.[index];

          return (
            <div
              key={field.id}
              className="grid grid-cols-[1fr_36px] sm:grid-cols-[1fr_120px_90px_100px_110px_80px_36px] gap-3 px-5 py-3 items-start"
            >
              {/* Descripción */}
              <div>
                <Controller
                  control={control}
                  name={`${lineItemsName}.${index}.description` as const}
                  render={({ field }) => (
                    <LineItemDescriptionInput
                      value={field.value}
                      onChange={field.onChange}
                      onSelectSuggestion={(s) => {
                        field.onChange(s.description);
                        setValue(`${lineItemsName}.${index}.itemType` as const, s.itemType);
                        setValue(`${lineItemsName}.${index}.unitPrice` as const, s.unitPrice);
                      }}
                      hasError={!!itemErrors?.description}
                      inputClass={inputClass(!!itemErrors?.description)}
                    />
                  )}
                />
                {itemErrors?.description && (
                  <p className="text-red-600 text-xs mt-1">
                    {itemErrors.description?.message}
                  </p>
                )}
                <input
                  {...register(`${lineItemsName}.${index}.warrantyTerm` as const)}
                  type="text"
                  placeholder={t.vehicle.warrantyPlaceholderMobile}
                  className={`${inputClass(false)} text-xs mt-2 sm:hidden`}
                />
                {/* Mobile: Tipo, Cantidad, Precio en columna */}
                <div className="sm:hidden grid grid-cols-3 gap-2 mt-2">
                  <select
                    {...register(`${lineItemsName}.${index}.itemType` as const)}
                    className={`${selectClass(false)} text-xs py-1.5`}
                  >
                    {itemTypes.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <input
                    {...register(`${lineItemsName}.${index}.quantity` as const, { valueAsNumber: true })}
                    type="number"
                    min={0}
                    step="0.5"
                    placeholder="1"
                    className={`${inputClass(false)} text-xs py-1.5`}
                  />
                  <input
                    {...register(`${lineItemsName}.${index}.unitPrice` as const, { valueAsNumber: true })}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    className={`${inputClass(false)} text-xs py-1.5`}
                  />
                </div>
              </div>

              {/* Tipo (desktop) */}
              <select
                {...register(`${lineItemsName}.${index}.itemType` as const)}
                className={`${selectClass(false)} hidden sm:block`}
              >
                {itemTypes.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              {/* Garantía (desktop) */}
              <input
                {...register(`${lineItemsName}.${index}.warrantyTerm` as const)}
                type="text"
                placeholder={t.vehicle.warrantyPlaceholderDesktop}
                className={`${inputClass(false)} hidden sm:block text-xs`}
              />

              {/* Cantidad (desktop) */}
              <input
                {...register(`${lineItemsName}.${index}.quantity` as const, { valueAsNumber: true })}
                type="number"
                min={0}
                step="0.5"
                placeholder="1"
                className={`${inputClass(false)} text-right hidden sm:block`}
              />

              {/* Precio unitario (desktop) */}
              <div className="hidden sm:block relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  {...register(`${lineItemsName}.${index}.unitPrice` as const, { valueAsNumber: true })}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  className={`${inputClass(false)} pl-6 text-right`}
                />
              </div>

              {/* Total de línea (solo lectura) */}
              <div className="hidden sm:flex items-center justify-end">
                <span className="text-sm font-medium text-slate-900">
                  ${lineTotal.toFixed(2)}
                </span>
              </div>

              {/* Botón eliminar */}
              <button
                type="button"
                onClick={() => remove(index)}
                disabled={fields.length === 1}
                className="flex items-center justify-center w-8 h-8 mt-0.5 text-slate-400 hover:text-red-500 disabled:opacity-30 transition-colors rounded"
                title={t.vehicle.removeLineTitle}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Botón agregar línea */}
      <div className="px-5 py-3 border-t border-slate-100">
        <button
          type="button"
          onClick={() => append({ ...EMPTY_LINE_ITEM })}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t.vehicle.addLine}
        </button>
      </div>
    </div>
  );
}

// Convierte el valor de un <input type="number"> vacío a null (campo opcional).
// Sin esto, valueAsNumber produciría NaN y Zod rechazaría el campo, volviéndolo
// efectivamente obligatorio.
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
