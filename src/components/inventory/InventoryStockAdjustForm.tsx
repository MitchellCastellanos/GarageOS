"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { inventoryMovementSchema, type InventoryMovementFormData } from "@/lib/validations";
import { recordInventoryMovement } from "@/actions/inventory";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { INVENTORY_DICT } from "@/lib/admin-locale/inventory";

export function InventoryStockAdjustForm({ partId }: { partId: string }) {
  const locale = useAdminLocale();
  const t = INVENTORY_DICT[locale];
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InventoryMovementFormData>({
    resolver: zodResolver(inventoryMovementSchema),
    defaultValues: { type: "RECEIVE", quantity: 1, note: "" },
  });

  async function onValid(data: InventoryMovementFormData) {
    setFormError(null);
    startTransition(async () => {
      const result = await recordInventoryMovement(partId, data);
      if (result?.error) {
        setFormError(typeof result.error === "string" ? result.error : t.errors.genericError);
        return;
      }
      reset({ type: "RECEIVE", quantity: 1, note: "" });
    });
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {t.detail.movementTypeLabel}
          </label>
          <select {...register("type")} className={inputClass(false)}>
            {(["RECEIVE", "ADJUSTMENT", "CONSUMED", "RETURN"] as const).map((type) => (
              <option key={type} value={type}>
                {t.detail.movementTypes[type]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {t.detail.movementQuantityLabel}
          </label>
          <input
            {...register("quantity", { valueAsNumber: true })}
            type="number"
            step="1"
            className={inputClass(!!errors.quantity)}
          />
        </div>
      </div>
      <p className="text-xs text-slate-400">{t.detail.movementQuantityHint}</p>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          {t.detail.movementNoteLabel}
        </label>
        <input {...register("note")} type="text" className={inputClass(!!errors.note)} />
      </div>

      {formError && <p className="text-red-600 text-xs">{formError}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
      >
        {isPending ? t.detail.movementSubmitting : t.detail.movementSubmit}
      </button>
    </form>
  );
}

function inputClass(hasError: boolean) {
  return [
    "w-full px-3 py-2 border rounded-lg text-sm",
    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
    hasError ? "border-red-400 bg-red-50" : "border-slate-300",
  ].join(" ");
}
