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
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { CLIENTS_DICT } from "@/lib/admin-locale/clients";

interface ClientFormProps {
  defaultValues?: Partial<ClientFormData>;
  onSubmit: (data: ClientFormData) => Promise<{ error?: Record<string, string[]> } | void>;
  submitLabel?: string;
}

export function ClientForm({
  defaultValues,
  onSubmit,
  submitLabel,
}: ClientFormProps) {
  const locale = useAdminLocale();
  const t = CLIENTS_DICT[locale];
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
      language: "EN",
      notifyChannel: "AUTO",
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
        <Field label={t.clientForm.nameLabel} error={errors.firstName?.message}>
          <input
            {...register("firstName")}
            type="text"
            placeholder={t.clientForm.namePlaceholder}
            className={inputClass(!!errors.firstName)}
          />
        </Field>
        <Field label={t.clientForm.lastNameLabel} error={errors.lastName?.message}>
          <input
            {...register("lastName")}
            type="text"
            placeholder={t.clientForm.lastNamePlaceholder}
            className={inputClass(!!errors.lastName)}
          />
        </Field>
      </div>

      {/* Teléfono y Email */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t.clientForm.phoneLabel} error={errors.phone?.message}>
          <input
            {...register("phone")}
            type="tel"
            placeholder={t.clientForm.phonePlaceholder}
            className={inputClass(!!errors.phone)}
          />
        </Field>
        <Field label={t.clientForm.emailLabel} error={errors.email?.message}>
          <input
            {...register("email")}
            type="email"
            placeholder={t.clientForm.emailPlaceholder}
            className={inputClass(!!errors.email)}
          />
        </Field>
      </div>

      {/* Idioma preferido — determina el idioma de SMS y emails de citas */}
      <Field label={t.clientForm.languageLabel} error={errors.language?.message}>
        <select {...register("language")} className={inputClass(!!errors.language)}>
          {INVOICE_LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </Field>

      {/* Preferencia de canal de notificación */}
      <Field label={t.clientForm.notifyChannelLabel} error={errors.notifyChannel?.message}>
        <select {...register("notifyChannel")} className={inputClass(!!errors.notifyChannel)}>
          <option value="AUTO">{t.clientForm.notifyChannelOptions.auto}</option>
          <option value="SMS">{t.clientForm.notifyChannelOptions.sms}</option>
          <option value="EMAIL">{t.clientForm.notifyChannelOptions.email}</option>
          <option value="BOTH">{t.clientForm.notifyChannelOptions.both}</option>
        </select>
        <p className="text-xs text-slate-400 mt-1">{t.clientForm.notifyChannelHint}</p>
      </Field>

      {/* Dirección */}
      <Field label={t.clientForm.addressLabel} error={errors.address?.message}>
        <input
          {...register("address")}
          type="text"
          placeholder={t.clientForm.addressPlaceholder}
          className={inputClass(!!errors.address)}
        />
      </Field>

      {/* Notas */}
      <Field label={t.clientForm.notesLabel} error={errors.notes?.message}>
        <textarea
          {...register("notes")}
          rows={3}
          placeholder={t.clientForm.notesPlaceholder}
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
          {isPending ? t.common.saving : (submitLabel ?? t.clientForm.saveDefault)}
        </button>
        <a
          href={ADMIN.clients}
          className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          {t.common.cancel}
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
