"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { vehicleSchema, type VehicleFormData } from "@/lib/validations";

interface VehicleFormProps {
  clientId: string;
  defaultValues?: Partial<VehicleFormData>;
  onSubmit: (data: VehicleFormData) => Promise<{ error?: Record<string, string[]> } | void>;
  submitLabel?: string;
}

export function VehicleForm({
  clientId,
  defaultValues,
  onSubmit,
  submitLabel = "Guardar vehículo",
}: VehicleFormProps) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<VehicleFormData>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: defaultValues ?? {
      make: "",
      model: "",
      year: new Date().getFullYear(),
      licensePlate: "",
      vin: "",
      color: "",
      mileageUnit: "KM",
    },
  });

  async function onValid(data: VehicleFormData) {
    startTransition(async () => {
      const result = await onSubmit(data);
      if (result?.error) {
        for (const [field, messages] of Object.entries(result.error)) {
          setError(field as keyof VehicleFormData, { message: messages[0] });
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-6">
      {/* Marca y Modelo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Marca *" error={errors.make?.message}>
          <input
            {...register("make")}
            type="text"
            placeholder="Toyota"
            className={inputClass(!!errors.make)}
          />
        </Field>
        <Field label="Modelo *" error={errors.model?.message}>
          <input
            {...register("model")}
            type="text"
            placeholder="Corolla"
            className={inputClass(!!errors.model)}
          />
        </Field>
      </div>

      {/* Año y Placa */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Año *" error={errors.year?.message}>
          <input
            {...register("year", { valueAsNumber: true })}
            type="number"
            min={1900}
            max={new Date().getFullYear() + 1}
            placeholder="2020"
            className={inputClass(!!errors.year)}
          />
        </Field>
        <Field label="Placa *" error={errors.licensePlate?.message}>
          <input
            {...register("licensePlate")}
            type="text"
            placeholder="ABC 1234"
            className={`${inputClass(!!errors.licensePlate)} uppercase`}
          />
        </Field>
      </div>

      {/* VIN y Color */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="VIN" error={errors.vin?.message}>
          <input
            {...register("vin")}
            type="text"
            maxLength={17}
            placeholder="1HGBH41JXMN109186"
            className={inputClass(!!errors.vin)}
          />
        </Field>
        <Field label="Color" error={errors.color?.message}>
          <input
            {...register("color")}
            type="text"
            placeholder="Blanco"
            className={inputClass(!!errors.color)}
          />
        </Field>
      </div>

      {/* Unidad de km */}
      <Field label="Unidad de kilometraje" error={errors.mileageUnit?.message}>
        <select
          {...register("mileageUnit")}
          className={inputClass(!!errors.mileageUnit)}
        >
          <option value="KM">Kilómetros (km)</option>
          <option value="MILES">Millas (mi)</option>
        </select>
      </Field>

      {/* Acciones */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
        >
          {isPending ? "Guardando..." : submitLabel}
        </button>
        <a
          href={`/clients/${clientId}`}
          className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
      </label>
      {children}
      {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return [
    "w-full px-3 py-2 border rounded-lg text-sm",
    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
    "transition-colors",
    hasError ? "border-red-400 bg-red-50" : "border-slate-300 hover:border-slate-400",
  ].join(" ");
}
