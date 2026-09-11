"use client";

import { useTransition, useRef, useState } from "react";
import { toast } from "sonner";
import { updateShopSettings, uploadShopLogo, changePassword } from "@/actions/settings";
import { Upload, Loader2 } from "lucide-react";
import Image from "next/image";
import { EmailRoutingPreview } from "@/components/settings/EmailRoutingPreview";
import { shopToEmailConfig } from "@/lib/email-config";

interface Shop {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  billingEmail: string | null;
  infoEmail: string | null;
  providersEmail: string | null;
  newsletterEmail: string | null;
  taxId: string | null;
  logoUrl: string | null;
  appointmentReminderHours: number;
  appointmentSmsEnabled: boolean;
  appointmentEmailsEnabled: boolean;
}

interface ShopSettingsFormProps {
  shop: Shop;
}

export function ShopSettingsForm({ shop }: ShopSettingsFormProps) {
  const [logoUrl, setLogoUrl] = useState(shop.logoUrl);
  const [emailDraft, setEmailDraft] = useState(shopToEmailConfig(shop));
  const [infopending, startInfoTransition] = useTransition();
  const [logoPending, startLogoTransition] = useTransition();
  const [pwPending, startPwTransition] = useTransition();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const pwFormRef = useRef<HTMLFormElement>(null);

  function handleInfoSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startInfoTransition(async () => {
      const result = await updateShopSettings(formData);
      if (result?.success) {
        setEmailDraft({
          name: (formData.get("name") as string) || shop.name,
          email: (formData.get("email") as string) || null,
          billingEmail: (formData.get("billingEmail") as string) || null,
          infoEmail: (formData.get("infoEmail") as string) || null,
          providersEmail: (formData.get("providersEmail") as string) || null,
          newsletterEmail: (formData.get("newsletterEmail") as string) || null,
        });
        toast.success("Configuración guardada");
      } else if (result?.error) {
        const msg = Object.values(result.error).flat()[0];
        toast.error(msg ?? "Error al guardar");
      }
    });
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("logo", file);
    startLogoTransition(async () => {
      const result = await uploadShopLogo(formData);
      if (result?.success && result.logoUrl) {
        setLogoUrl(result.logoUrl);
        toast.success("Logo actualizado");
      } else {
        toast.error(result?.error ?? "Error subiendo logo");
      }
    });
  }

  function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startPwTransition(async () => {
      const result = await changePassword(formData);
      if (result?.success) {
        toast.success("Contraseña actualizada");
        pwFormRef.current?.reset();
      } else {
        toast.error(result?.error ?? "Error al cambiar contraseña");
      }
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ── Logo ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-4">Logo del taller</h2>
        <div className="flex items-center gap-5">
          {/* Preview */}
          <div className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50 overflow-hidden flex-shrink-0">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="Logo del taller"
                width={96}
                height={96}
                className="object-contain"
                unoptimized
              />
            ) : (
              <Upload className="w-6 h-6 text-slate-300" />
            )}
          </div>
          <div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleLogoChange}
            />
            <button
              type="button"
              disabled={logoPending}
              onClick={() => logoInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {logoPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {logoPending ? "Subiendo..." : "Cambiar logo"}
            </button>
            <p className="text-xs text-slate-400 mt-2">
              JPG, PNG, WebP o SVG · Máximo 5 MB
            </p>
            <p className="text-xs text-slate-400">
              El logo aparece en todas las facturas PDF
            </p>
          </div>
        </div>
      </div>

      {/* ── Datos del taller ── */}
      <form onSubmit={handleInfoSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Datos del taller</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Nombre del taller *
            </label>
            <input
              name="name"
              type="text"
              defaultValue={shop.name}
              required
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Dirección
            </label>
            <input
              name="address"
              type="text"
              defaultValue={shop.address ?? ""}
              placeholder="123 Rue Principale, Montréal, QC"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Teléfono
            </label>
            <input
              name="phone"
              type="tel"
              defaultValue={shop.phone ?? ""}
              placeholder="(514) 000-0000"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Email principal
            </label>
            <input
              name="email"
              type="email"
              defaultValue={shop.email ?? ""}
              placeholder="info@tutaller.com"
              className={inputClass}
            />
            <p className="text-xs text-slate-400 mt-1">
              Contacto general y fallback si no hay buzón específico
            </p>
          </div>
          <div className="sm:col-span-2 border-t border-slate-100 pt-4 mt-2">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Buzones del dominio</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  billing@ — Sin uso
                </label>
                <input
                  name="billingEmail"
                  type="email"
                  defaultValue={shop.billingEmail ?? ""}
                  placeholder="billing@tutaller.com"
                  className={inputClass}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Las facturas y contabilidad ahora salen de info@
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  info@ — Facturas, cotizaciones, recordatorios y web
                </label>
                <input
                  name="infoEmail"
                  type="email"
                  defaultValue={shop.infoEmail ?? ""}
                  placeholder="info@tutaller.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  providers@ — Proveedores
                </label>
                <input
                  name="providersEmail"
                  type="email"
                  defaultValue={shop.providersEmail ?? ""}
                  placeholder="providers@tutaller.com"
                  className={inputClass}
                />
                <p className="text-xs text-slate-400 mt-1">Reservado para uso futuro</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  newsletter@ — Marketing
                </label>
                <input
                  name="newsletterEmail"
                  type="email"
                  defaultValue={shop.newsletterEmail ?? ""}
                  placeholder="newsletter@tutaller.com"
                  className={inputClass}
                />
                <p className="text-xs text-slate-400 mt-1">Para Brevo/Mailchimp más adelante</p>
              </div>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Número de impuestos (NEQ / TPS / TVQ)
            </label>
            <input
              name="taxId"
              type="text"
              defaultValue={shop.taxId ?? ""}
              placeholder="TPS: 123456789 RT0001 · TVQ: 1234567890 TQ0001"
              className={inputClass}
            />
            <p className="text-xs text-slate-400 mt-1">Aparece en el pie de página de las facturas PDF</p>
          </div>
          <div className="sm:col-span-2 border-t border-slate-100 pt-4 mt-2">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              Citas — notificaciones (SMS y email)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Horas antes de la cita
                </label>
                <input
                  name="appointmentReminderHours"
                  type="number"
                  min={1}
                  max={168}
                  defaultValue={shop.appointmentReminderHours}
                  className={inputClass}
                />
                <p className="text-xs text-slate-400 mt-1">
                  El cron envía recordatorio cuando falten estas horas (por defecto 24 h)
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-6">
                <div className="flex items-center gap-3">
                  <input
                    id="appointmentSmsEnabled"
                    name="appointmentSmsEnabled"
                    type="checkbox"
                    defaultChecked={shop.appointmentSmsEnabled}
                    className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <label htmlFor="appointmentSmsEnabled" className="text-sm text-slate-700">
                    Enviar notificaciones de citas por SMS (canal principal)
                  </label>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    id="appointmentEmailsEnabled"
                    name="appointmentEmailsEnabled"
                    type="checkbox"
                    defaultChecked={shop.appointmentEmailsEnabled}
                    className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <label htmlFor="appointmentEmailsEnabled" className="text-sm text-slate-700">
                    Enviar también por email (secundario)
                  </label>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              El SMS requiere una cuenta de Twilio configurada por el equipo técnico
              (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER).
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={infopending}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {infopending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {infopending ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </form>

      <EmailRoutingPreview shop={emailDraft} />

      {/* ── Cambiar contraseña ── */}
      <form ref={pwFormRef} onSubmit={handlePasswordSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Cambiar contraseña</h2>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Contraseña actual
            </label>
            <input name="currentPassword" type="password" autoComplete="current-password" className={inputClass} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Nueva contraseña
              </label>
              <input name="newPassword" type="password" autoComplete="new-password" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Confirmar contraseña
              </label>
              <input name="confirmPassword" type="password" autoComplete="new-password" className={inputClass} />
            </div>
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={pwPending}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {pwPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {pwPending ? "Cambiando..." : "Cambiar contraseña"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
