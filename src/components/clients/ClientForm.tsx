"use client";

import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";

// ClientForm — formulario reutilizable para crear Y editar clientes.
//
// Conceptos clave aquí:
// - useForm() de React Hook Form maneja el estado del form sin re-renders innecesarios
// - zodResolver conecta el schema Zod con React Hook Form para validación automática
// - register() registra cada input para que RHF lo controle
// - handleSubmit() valida antes de llamar nuestra Server Action
// - errors muestra los mensajes de error por campo

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTransition } from "react";
import { clientSchema, type ClientFormData } from "@/lib/validations";
import { INVOICE_LANGUAGES } from "@/lib/invoice-i18n";

interface ClientFormProps {
  defaultValues?: Partial<ClientFormData>;
  onSubmit: (data: ClientFormData) => Promise<{ error?: Record<string, string[]> } | void>;
  submitLabel?: string;
}

export function ClientForm({
  defaultValues,
  onSubmit,
  submitLabel = "Guardar cliente",
}: ClientFormProps) {
  // useTransition permite mostrar estado de carga mientras la Server Action corre
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: defaultValues ?? {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      language: "ES",
      address: "",
      notes: "",
    },
  });

  async function onValid(data: ClientFormData) {
    startTransition(async () => {
      const result = await onSubmit(data);
      // Si el servidor regresa errores de validación, los mostramos por campo
      if (result?.error) {
        for (const [field, messages] of Object.entries(result.error)) {
          setError(field as keyof ClientFormData, {
            message: messages[0],
          });
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-6">
      {/* Nombre y Apellido */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nombre / Empresa *" error={errors.firstName?.message}>
          <input
            {...register("firstName")}
            type="text"
            placeholder="Carlos o Acme Inc."
            className={inputClass(!!errors.firstName)}
          />
        </Field>
        <Field label="Apellido (opcional)" error={errors.lastName?.message}>
          <input
            {...register("lastName")}
            type="text"
            placeholder="Rodríguez — dejar vacío para empresas"
            className={inputClass(!!errors.lastName)}
          />
        </Field>
      </div>

      {/* Teléfono y Email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Teléfono *" error={errors.phone?.message}>
          <input
            {...register("phone")}
            type="tel"
            placeholder="514-555-0100"
            className={inputClass(!!errors.phone)}
          />
        </Field>
        <Field label="Email (opcional)" error={errors.email?.message}>
          <input
            {...register("email")}
            type="email"
            placeholder="carlos@email.com"
            className={inputClass(!!errors.email)}
          />
        </Field>
      </div>

      {/* Idioma preferido — determina el idioma de SMS y emails de citas */}
      <Field label="Idioma preferido" error={errors.language?.message}>
        <select {...register("language")} className={inputClass(!!errors.language)}>
          {INVOICE_LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </Field>

      {/* Dirección */}
      <Field label="Dirección" error={errors.address?.message}>
        <input
          {...register("address")}
          type="text"
          placeholder="123 Rue Principale, Montréal, QC"
          className={inputClass(!!errors.address)}
        />
      </Field>

      {/* Notas */}
      <Field label="Notas internas" error={errors.notes?.message}>
        <textarea
          {...register("notes")}
          rows={3}
          placeholder="Observaciones sobre el cliente (solo visibles en el sistema)..."
          className={inputClass(!!errors.notes)}
        />
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
          href={ADMIN.clients}
          className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}

// ── Helper components ────────────────────────────────────────

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
    hasError
      ? "border-red-400 bg-red-50"
      : "border-slate-300 hover:border-slate-400",
  ].join(" ");
}
