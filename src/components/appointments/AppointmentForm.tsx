"use client";

import { ADMIN } from "@/lib/routes";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import {
  appointmentEditSchema,
  appointmentSchema,
  type AppointmentEditFormData,
  type AppointmentFormData,
} from "@/lib/validations";
import { APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABEL } from "@/lib/appointment-status";
import { formatClientName } from "@/lib/client-name";

interface Client {
  id: string;
  firstName: string;
  lastName?: string | null;
  vehicles: { id: string; make: string; model: string; year: number; licensePlate: string }[];
}

interface Mechanic {
  id: string;
  name: string;
}

type CreateProps = {
  mode?: "create";
  onSubmit: (data: AppointmentFormData) => Promise<{ error?: Record<string, string[]> } | void>;
  initialValues?: Partial<AppointmentFormData>;
};

type EditProps = {
  mode: "edit";
  onSubmit: (data: AppointmentEditFormData) => Promise<{ error?: Record<string, string[]> } | void>;
  initialValues?: Partial<AppointmentEditFormData>;
};

type AppointmentFormProps = (CreateProps | EditProps) & {
  clients: Client[];
  mechanics: Mechanic[];
};

export function AppointmentForm({
  clients,
  mechanics,
  onSubmit,
  initialValues,
  mode = "create",
}: AppointmentFormProps) {
  const [isPending, startTransition] = useTransition();
  const isEdit = mode === "edit";

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<AppointmentEditFormData>({
    resolver: zodResolver(isEdit ? appointmentEditSchema : appointmentSchema),
    defaultValues: {
      clientId: "",
      vehicleId: "",
      mechanicId: "",
      title: "",
      date: "",
      time: "09:00",
      durationMinutes: 60,
      notes: "",
      status: "SCHEDULED",
      ...initialValues,
    },
  });

  const selectedClientId = watch("clientId");
  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const vehicles = selectedClient?.vehicles ?? [];

  async function onValid(data: AppointmentEditFormData) {
    startTransition(async () => {
      const result = isEdit
        ? await (onSubmit as EditProps["onSubmit"])(data)
        : await (onSubmit as CreateProps["onSubmit"])(data);
      if (result?.error) {
        if (result.error._form?.[0]) {
          setError("root", { message: result.error._form[0] });
        }
        for (const [field, messages] of Object.entries(result.error)) {
          if (field === "_form") continue;
          setError(field as keyof AppointmentEditFormData, { message: messages[0] });
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-6 max-w-2xl">
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Datos de la cita</h2>

        {isEdit && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Estado
            </label>
            <select {...register("status")} className={selectClass(!!errors.status)}>
              {APPOINTMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {APPOINTMENT_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
            {errors.status && (
              <p className="text-red-600 text-xs mt-1">{errors.status.message}</p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Título / servicio *
          </label>
          <input
            {...register("title")}
            type="text"
            placeholder="Cambio de aceite, revisión de frenos..."
            className={inputClass(!!errors.title)}
          />
          {errors.title && (
            <p className="text-red-600 text-xs mt-1">{errors.title.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Cliente *
            </label>
            <select {...register("clientId")} className={selectClass(!!errors.clientId)}>
              <option value="">Seleccionar cliente...</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {formatClientName(client)}
                </option>
              ))}
            </select>
            {errors.clientId && (
              <p className="text-red-600 text-xs mt-1">{errors.clientId.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Vehículo (opcional)
            </label>
            <select
              {...register("vehicleId")}
              disabled={!selectedClientId || vehicles.length === 0}
              className={selectClass(false)}
            >
              <option value="">
                {!selectedClientId
                  ? "Selecciona un cliente primero"
                  : vehicles.length === 0
                  ? "Sin vehículos"
                  : "Sin vehículo específico"}
              </option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.year} {v.make} {v.model} — {v.licensePlate}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Mecánico (opcional)
          </label>
          <select {...register("mechanicId")} className={selectClass(!!errors.mechanicId)}>
            <option value="">Sin asignar</option>
            {mechanics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {errors.mechanicId && (
            <p className="text-red-600 text-xs mt-1">{errors.mechanicId.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Fecha *
            </label>
            <input {...register("date")} type="date" className={inputClass(!!errors.date)} />
            {errors.date && (
              <p className="text-red-600 text-xs mt-1">{errors.date.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Hora *
            </label>
            <input {...register("time")} type="time" className={inputClass(!!errors.time)} />
            {errors.time && (
              <p className="text-red-600 text-xs mt-1">{errors.time.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Duración (min)
            </label>
            <input
              {...register("durationMinutes", { valueAsNumber: true })}
              type="number"
              min={15}
              step={15}
              className={inputClass(false)}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Notas (opcionales)
          </label>
          <textarea
            {...register("notes")}
            rows={3}
            placeholder="Instrucciones, piezas a pedir..."
            className={inputClass(false)}
          />
        </div>
      </div>

      {errors.root && (
        <p className="text-red-600 text-sm">{errors.root.message}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors"
        >
          {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear cita"}
        </button>
        <a href={ADMIN.appointments} className="text-sm text-slate-500 hover:text-slate-800 transition-colors">
          Cancelar
        </a>
      </div>
    </form>
  );
}

function inputClass(hasError: boolean) {
  return [
    "w-full px-3 py-2 border rounded-lg text-sm",
    "focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent",
    hasError ? "border-red-400 bg-red-50" : "border-slate-300",
  ].join(" ");
}

function selectClass(hasError: boolean) {
  return [
    "w-full px-3 py-2 border rounded-lg text-sm bg-white",
    "focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent",
    hasError ? "border-red-400 bg-red-50" : "border-slate-300",
  ].join(" ");
}
