"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { inventoryPartSchema, type InventoryPartFormData } from "@/lib/validations";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { INVENTORY_DICT } from "@/lib/admin-locale/inventory";
import { ADMIN } from "@/lib/routes";

interface InventoryPartFormProps {
  defaultValues?: Partial<InventoryPartFormData>;
  onSubmit: (data: InventoryPartFormData) => Promise<{ error?: Record<string, string[]> } | void>;
  isEdit?: boolean;
}

export function InventoryPartForm({ defaultValues, onSubmit, isEdit }: InventoryPartFormProps) {
  const locale = useAdminLocale();
  const t = INVENTORY_DICT[locale];
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<InventoryPartFormData>({
    resolver: zodResolver(inventoryPartSchema),
    defaultValues: defaultValues ?? {
      name: "",
      sku: "",
      description: "",
      unitCost: undefined,
      unitPrice: 0,
      quantityOnHand: 0,
      reorderThreshold: 0,
    },
  });

  async function onValid(data: InventoryPartFormData) {
    startTransition(async () => {
      const result = await onSubmit(data);
      if (result?.error) {
        for (const [field, messages] of Object.entries(result.error)) {
          setError(field as keyof InventoryPartFormData, { message: messages[0] });
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t.form.nameLabel} error={errors.name?.message}>
          <input {...register("name")} type="text" className={inputClass(!!errors.name)} />
        </Field>
        <Field label={t.form.skuLabel} hint={t.form.skuHint} error={errors.sku?.message}>
          <input {...register("sku")} type="text" className={inputClass(!!errors.sku)} />
        </Field>
      </div>

      <Field label={t.form.descriptionLabel} error={errors.description?.message}>
        <textarea
          {...register("description")}
          rows={3}
          className={inputClass(!!errors.description)}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t.form.unitCostLabel} error={errors.unitCost?.message}>
          <input
            {...register("unitCost", { setValueAs: emptyToUndefined })}
            type="number"
            step="0.01"
            min="0"
            className={inputClass(!!errors.unitCost)}
          />
        </Field>
        <Field label={t.form.unitPriceLabel} error={errors.unitPrice?.message}>
          <input
            {...register("unitPrice", { valueAsNumber: true })}
            type="number"
            step="0.01"
            min="0"
            className={inputClass(!!errors.unitPrice)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {!isEdit && (
          <Field
            label={t.form.quantityOnHandLabel}
            hint={t.form.quantityOnHandHint}
            error={errors.quantityOnHand?.message}
          >
            <input
              {...register("quantityOnHand", { setValueAs: emptyToUndefined })}
              type="number"
              step="1"
              min="0"
              className={inputClass(!!errors.quantityOnHand)}
            />
          </Field>
        )}
        <Field
          label={t.form.reorderThresholdLabel}
          hint={t.form.reorderThresholdHint}
          error={errors.reorderThreshold?.message}
        >
          <input
            {...register("reorderThreshold", { setValueAs: emptyToUndefined })}
            type="number"
            step="1"
            min="0"
            className={inputClass(!!errors.reorderThreshold)}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
        >
          {isPending ? t.form.submitting : t.form.submit}
        </button>
        <a
          href={ADMIN.inventory}
          className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          {t.form.cancel}
        </a>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
      {hint && !error && <p className="text-slate-400 text-xs mt-1">{hint}</p>}
      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  );
}

// Un <input type="number"> vacío da NaN con valueAsNumber, y Zod rechaza
// NaN incluso en campos .optional() — lo volvería obligatorio sin querer.
function emptyToUndefined(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

function inputClass(hasError: boolean) {
  return [
    "w-full px-3 py-2 border rounded-lg text-sm",
    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
    "transition-colors",
    hasError ? "border-red-400 bg-red-50" : "border-slate-300 hover:border-slate-400",
  ].join(" ");
}
