"use client";

import { useEffect, useTransition, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  updateShopSettings,
  updateShopSlug,
  updateShopBrandColor,
  updateEtransferSettings,
  updateShopTaxLines,
  uploadShopLogo,
  changePassword,
  setShopContactToLoginEmail,
  resendShopEmailVerification,
} from "@/actions/settings";
import { validateLogo } from "@/lib/logo-upload";
import { Upload, Loader2, Info, CheckCircle2, MailWarning, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";
import { DEFAULT_BRAND_COLOR, toSafeDarkBrandColor } from "@/lib/brand-color";
import { parseShopTaxLines } from "@/lib/taxes";
import { CANADA_TAX_PRESETS } from "@/lib/tax-presets";
import Decimal from "decimal.js";

interface Shop {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  emailVerified: Date | null;
  taxId: string | null;
  logoUrl: string | null;
  slug: string | null;
  brandColor: string | null;
  etransferEnabled: boolean;
  etransferEmail: string | null;
  taxLines: unknown;
}

interface TaxLineDraft {
  id: string;
  name: string;
  /** Porcentaje como string para el input, ej. "5" (no decimal — 5% = 0.05) */
  pct: string;
}

interface ShopSettingsFormProps {
  shop: Shop;
  slugUrlPrefix: string;
  /** true si quien ve esta pantalla es OWNER — el único rol con login forzosamente verificado. */
  canUseLoginEmail: boolean;
  loginEmail: string;
}

export function ShopSettingsForm({ shop, slugUrlPrefix, canUseLoginEmail, loginEmail }: ShopSettingsFormProps) {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale];
  const searchParams = useSearchParams();
  const [logoUrl, setLogoUrl] = useState(shop.logoUrl);
  const [emailValue, setEmailValue] = useState(shop.email ?? "");
  const [emailVerified, setEmailVerified] = useState<Date | null>(shop.emailVerified);
  const [slug, setSlug] = useState(shop.slug ?? "");
  const [brandColor, setBrandColor] = useState(shop.brandColor ?? DEFAULT_BRAND_COLOR);
  const [infopending, startInfoTransition] = useTransition();
  const [useLoginPending, startUseLoginTransition] = useTransition();
  const [resendPending, startResendTransition] = useTransition();
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    const verifyShopEmail = searchParams.get("verifyShopEmail");
    if (verifyShopEmail === "success") toast.success(t.shopEmailVerification.mainConfirmed);
    else if (verifyShopEmail === "expired") toast.error(t.shopEmailVerification.linkExpired);
    else if (verifyShopEmail === "invalid") toast.error(t.shopEmailVerification.linkInvalid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleUseLoginEmail() {
    startUseLoginTransition(async () => {
      const result = await setShopContactToLoginEmail();
      if (result?.success) {
        setEmailValue(result.email);
        setEmailVerified(new Date());
        setResendSent(false);
        toast.success(t.shopEmailVerification.useLoginEmailSuccess);
      } else {
        toast.error(result?.error ?? t.shopEmailVerification.useLoginEmailError);
      }
    });
  }

  function handleResendShopEmailVerification() {
    startResendTransition(async () => {
      const result = await resendShopEmailVerification();
      if (result?.success) {
        setResendSent(true);
        toast.success(t.shopEmailVerification.resendSuccess);
      } else {
        toast.error(result?.error ?? t.shopEmailVerification.resendError);
      }
    });
  }
  const [logoPending, startLogoTransition] = useTransition();
  const [slugPending, startSlugTransition] = useTransition();
  const [colorPending, startColorTransition] = useTransition();
  const [pwPending, startPwTransition] = useTransition();
  const [etransferPending, startEtransferTransition] = useTransition();
  const [etransferEnabled, setEtransferEnabled] = useState(shop.etransferEnabled);
  const [taxPending, startTaxTransition] = useTransition();
  const [taxLines, setTaxLines] = useState<TaxLineDraft[]>(() =>
    parseShopTaxLines(shop.taxLines).map((l, i) => ({
      id: `${i}-${l.name}`,
      name: l.name,
      pct: new Decimal(l.rate).times(100).toString(),
    }))
  );
  const logoInputRef = useRef<HTMLInputElement>(null);
  const pwFormRef = useRef<HTMLFormElement>(null);

  function handleSlugSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startSlugTransition(async () => {
      const result = await updateShopSlug(formData);
      if (result?.success) {
        setSlug(result.slug);
        toast.success(t.shopSlug.saved);
      } else {
        toast.error(result?.error ?? t.shopSlug.saved);
      }
    });
  }

  function handleColorSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startColorTransition(async () => {
      const result = await updateShopBrandColor(formData);
      if (result?.success) {
        toast.success(t.brandColor.saved);
      } else {
        toast.error(result?.error ?? t.brandColor.saved);
      }
    });
  }

  function resetColor() {
    setBrandColor(DEFAULT_BRAND_COLOR);
    startColorTransition(async () => {
      const formData = new FormData();
      formData.set("brandColor", "");
      const result = await updateShopBrandColor(formData);
      if (result?.success) toast.success(t.brandColor.saved);
      else toast.error(result?.error ?? t.brandColor.saved);
    });
  }

  function handleInfoSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startInfoTransition(async () => {
      const result = await updateShopSettings(formData);
      if (result?.success) {
        toast.success(t.shopInfo.saved);
        setEmailVerified(result.emailVerified ? new Date() : null);
        setResendSent(false);
      } else if (result?.error) {
        const msg = Object.values(result.error).flat()[0];
        toast.error(typeof msg === "string" ? msg : t.shopInfo.saved);
      }
    });
  }

  function handleEtransferSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startEtransferTransition(async () => {
      const result = await updateEtransferSettings(formData);
      if (result?.success) {
        toast.success(t.etransfer.saved);
      } else if (result?.error) {
        const msg = Object.values(result.error).flat()[0];
        toast.error(typeof msg === "string" ? msg : t.etransfer.saved);
      }
    });
  }

  function addTaxLine() {
    setTaxLines((prev) => [...prev, { id: `${Date.now()}`, name: "", pct: "0" }]);
  }

  function removeTaxLine(id: string) {
    setTaxLines((prev) => prev.filter((l) => l.id !== id));
  }

  function updateTaxLine(id: string, patch: Partial<Pick<TaxLineDraft, "name" | "pct">>) {
    setTaxLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function applyTaxPreset(code: string) {
    const preset = CANADA_TAX_PRESETS.find((p) => p.code === code);
    if (!preset) return;
    setTaxLines(
      preset.lines.map((l, i) => ({
        id: `${Date.now()}-${i}`,
        name: l.name,
        pct: new Decimal(l.rate).times(100).toString(),
      }))
    );
  }

  function handleTaxSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload = taxLines
      .filter((l) => l.name.trim())
      .map((l) => ({
        name: l.name.trim(),
        rate: new Decimal(l.pct || 0).div(100).toNumber(),
      }));
    const formData = new FormData();
    formData.set("taxLines", JSON.stringify(payload));
    startTaxTransition(async () => {
      const result = await updateShopTaxLines(formData);
      if (result?.success) {
        toast.success(t.taxes.saved);
      } else {
        toast.error(typeof result?.error === "string" ? result.error : t.taxes.saved);
      }
    });
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset even after rejection so selecting the same file can retry.
    e.target.value = "";
    const validation = validateLogo(file);
    if (validation) {
      toast.error(validation === "tooLarge" ? t.logo.tooLarge : t.logo.invalidFile);
      return;
    }
    const formData = new FormData();
    formData.append("logo", file);
    startLogoTransition(async () => {
      try {
        const result = await uploadShopLogo(formData);
        if (result?.success && result.logoUrl) {
          setLogoUrl(result.logoUrl);
          toast.success(t.logo.uploaded);
        } else {
          toast.error(result?.error ?? t.logo.failed);
        }
      } catch {
        toast.error(t.logo.failed);
      }
    });
  }

  function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startPwTransition(async () => {
      const result = await changePassword(formData);
      if (result?.success) {
        toast.success(t.password.saved);
        pwFormRef.current?.reset();
      } else {
        toast.error(result?.error ?? t.password.saved);
      }
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ── Logo ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-4">{t.logo.title}</h2>
        <div className="flex items-center gap-5">
          {/* Preview */}
          <div className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50 overflow-hidden flex-shrink-0">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={t.logo.title}
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
              {logoPending ? t.logo.uploading : t.logo.change}
            </button>
            <p className="text-xs text-slate-400 mt-2">{t.logo.hint1}</p>
            <p className="text-xs text-slate-400">{t.logo.hint2}</p>
          </div>
        </div>
      </div>

      {/* ── Datos del taller ── */}
      <form onSubmit={handleInfoSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">{t.shopInfo.title}</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t.shopInfo.name}
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
              {t.shopInfo.address}
            </label>
            <input
              name="address"
              type="text"
              defaultValue={shop.address ?? ""}
              placeholder={t.shopInfo.addressPlaceholder}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t.shopInfo.phone}
            </label>
            <input
              name="phone"
              type="tel"
              defaultValue={shop.phone ?? ""}
              placeholder={t.shopInfo.phonePlaceholder}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
              {t.shopInfo.email}
              {emailValue && (
                emailVerified ? (
                  <span title={t.shopEmailVerification.confirmedTooltip}>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
                    <MailWarning className="w-3.5 h-3.5" />
                    {t.shopEmailVerification.unconfirmedLabel}
                  </span>
                )
              )}
            </label>
            <input
              name="email"
              type="email"
              value={emailValue}
              onChange={(e) => setEmailValue(e.target.value)}
              placeholder={t.shopInfo.emailPlaceholder}
              className={inputClass}
            />
            <p className="text-xs text-slate-400 mt-1">{t.shopInfo.emailHint}</p>

            {canUseLoginEmail && emailValue.trim().toLowerCase() !== loginEmail.trim().toLowerCase() && (
              <button
                type="button"
                disabled={useLoginPending}
                onClick={handleUseLoginEmail}
                className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                {useLoginPending && <Loader2 className="w-3 h-3 animate-spin" />}
                {t.shopEmailVerification.useLoginEmailButton(loginEmail)}
              </button>
            )}

            {emailValue && !emailVerified && (
              <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-1">
                <p>
                  {t.shopEmailVerification.unconfirmedPrefix}{" "}
                  {canUseLoginEmail ? <strong>{loginEmail}</strong> : t.shopEmailVerification.unconfirmedFallbackContact}{" "}
                  {t.shopEmailVerification.unconfirmedSuffix}
                </p>
                <button
                  type="button"
                  disabled={resendPending || resendSent}
                  onClick={handleResendShopEmailVerification}
                  className="font-medium text-amber-700 hover:text-amber-900 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  {resendPending && <Loader2 className="w-3 h-3 animate-spin" />}
                  {resendSent ? t.shopEmailVerification.resendSentLabel : t.shopEmailVerification.resendButton}
                </button>
              </div>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t.shopInfo.taxId}
            </label>
            <input
              name="taxId"
              type="text"
              defaultValue={shop.taxId ?? ""}
              placeholder={t.shopInfo.taxIdPlaceholder}
              className={inputClass}
            />
            <p className="text-xs text-slate-400 mt-1">{t.shopInfo.taxIdHint}</p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={infopending}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {infopending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {infopending ? t.shopInfo.saving : t.shopInfo.save}
          </button>
        </div>
      </form>

      {/* ── E-transfer (Interac) ── */}
      <form onSubmit={handleEtransferSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">{t.etransfer.title}</h2>

        <div className="flex items-center gap-3">
          <input
            id="etransferEnabled"
            name="etransferEnabled"
            type="checkbox"
            checked={etransferEnabled}
            onChange={(e) => setEtransferEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          <label htmlFor="etransferEnabled" className="text-sm text-slate-700">
            {t.etransfer.enableLabel}
          </label>
        </div>

        {etransferEnabled && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t.etransfer.emailLabel}
            </label>
            <input
              name="etransferEmail"
              type="email"
              defaultValue={shop.etransferEmail ?? ""}
              placeholder={t.etransfer.emailPlaceholder}
              required={etransferEnabled}
              className={inputClass}
            />
          </div>
        )}

        <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-lg px-3.5 py-3">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-800 leading-relaxed">{t.etransfer.infoNote}</p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={etransferPending}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {etransferPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {etransferPending ? t.etransfer.saving : t.etransfer.save}
          </button>
        </div>
      </form>

      {/* ── Impuestos ── */}
      <form onSubmit={handleTaxSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-slate-900">{t.taxes.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.taxes.subtitle}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {t.taxes.presetLabel}
          </label>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) applyTaxPreset(e.target.value);
              e.target.value = "";
            }}
            className={inputClass}
          >
            <option value="">{t.taxes.presetPlaceholder}</option>
            {CANADA_TAX_PRESETS.map((preset) => (
              <option key={preset.code} value={preset.code}>
                {preset.label[locale]}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1">{t.taxes.presetHint}</p>
        </div>

        {taxLines.length === 0 && (
          <p className="text-xs text-slate-400">{t.taxes.empty}</p>
        )}

        <div className="space-y-2">
          {taxLines.map((line) => (
            <div key={line.id} className="flex items-center gap-2">
              <input
                type="text"
                value={line.name}
                onChange={(e) => updateTaxLine(line.id, { name: e.target.value })}
                placeholder={t.taxes.namePlaceholder}
                maxLength={30}
                className={`${inputClass} flex-1`}
              />
              <div className="relative w-28 flex-shrink-0">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.001"
                  value={line.pct}
                  onChange={(e) => updateTaxLine(line.id, { pct: e.target.value })}
                  className={`${inputClass} pr-7 text-right`}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                  %
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeTaxLine(line.id)}
                className="p-2 text-slate-400 hover:text-red-500 flex-shrink-0"
                title={t.taxes.remove}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addTaxLine}
          disabled={taxLines.length >= 5}
          className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-40"
        >
          <Plus className="w-4 h-4" />
          {t.taxes.addLine}
        </button>

        <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-lg px-3.5 py-3">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-800 leading-relaxed">{t.taxes.infoNote}</p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={taxPending}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {taxPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {taxPending ? t.taxes.saving : t.taxes.save}
          </button>
        </div>
      </form>

      {/* ── Slug público (URL de reservas) ── */}
      <form onSubmit={handleSlugSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900">{t.shopSlug.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.shopSlug.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-stretch rounded-lg border border-slate-300 overflow-hidden max-w-xl">
          <span className="flex items-center px-3 bg-slate-50 text-slate-500 text-sm border-r border-slate-300 whitespace-nowrap">
            {slugUrlPrefix}
          </span>
          <input
            name="slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={t.shopSlug.placeholder}
            className="flex-1 min-w-[140px] px-3 py-2 text-sm focus:outline-none"
          />
        </div>
        {!shop.slug && <p className="text-xs text-amber-700">{t.shopSlug.emptyWarning}</p>}
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={slugPending || !slug.trim()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {slugPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t.shopSlug.save}
          </button>
        </div>
      </form>

      {/* ── Color de marca (fondo de la página de citas) ── */}
      <form onSubmit={handleColorSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900">{t.brandColor.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{t.brandColor.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <input
            type="color"
            name="brandColor"
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
            className="w-12 h-12 rounded-lg border border-slate-300 cursor-pointer bg-transparent p-0"
          />
          <input
            type="text"
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
            placeholder={DEFAULT_BRAND_COLOR}
            className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
          />
          <div
            className="flex-1 min-w-[160px] rounded-lg px-4 py-3 text-sm font-semibold uppercase tracking-wide"
            style={{ backgroundColor: toSafeDarkBrandColor(brandColor), color: "#fff" }}
          >
            {shop.name || t.brandColor.previewLabel}
          </div>
        </div>
        <p className="text-xs text-slate-400">{t.brandColor.hint}</p>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={resetColor}
            disabled={colorPending}
            className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {t.brandColor.reset}
          </button>
          <button
            type="submit"
            disabled={colorPending}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {colorPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t.brandColor.save}
          </button>
        </div>
      </form>

      {/* ── Cambiar contraseña ── */}
      <form ref={pwFormRef} onSubmit={handlePasswordSubmit} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">{t.password.title}</h2>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t.password.current}
            </label>
            <input name="currentPassword" type="password" autoComplete="current-password" className={inputClass} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t.password.next}
              </label>
              <input name="newPassword" type="password" autoComplete="new-password" className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t.password.confirm}
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
            {pwPending ? t.password.submitting : t.password.submit}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
