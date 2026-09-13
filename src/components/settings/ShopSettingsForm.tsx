"use client";

import { useTransition, useRef, useState } from "react";
import { toast } from "sonner";
import { updateShopSettings, updateShopSlug, updateShopBrandColor, uploadShopLogo, changePassword } from "@/actions/settings";
import { Upload, Loader2 } from "lucide-react";
import Image from "next/image";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { SETTINGS_DICT } from "@/lib/admin-locale/settings";
import { DEFAULT_BRAND_COLOR, toSafeDarkBrandColor } from "@/lib/brand-color";

interface Shop {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  logoUrl: string | null;
  slug: string | null;
  brandColor: string | null;
}

interface ShopSettingsFormProps {
  shop: Shop;
  slugUrlPrefix: string;
}

export function ShopSettingsForm({ shop, slugUrlPrefix }: ShopSettingsFormProps) {
  const locale = useAdminLocale();
  const t = SETTINGS_DICT[locale];
  const [logoUrl, setLogoUrl] = useState(shop.logoUrl);
  const [slug, setSlug] = useState(shop.slug ?? "");
  const [brandColor, setBrandColor] = useState(shop.brandColor ?? DEFAULT_BRAND_COLOR);
  const [infopending, startInfoTransition] = useTransition();
  const [logoPending, startLogoTransition] = useTransition();
  const [slugPending, startSlugTransition] = useTransition();
  const [colorPending, startColorTransition] = useTransition();
  const [pwPending, startPwTransition] = useTransition();
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
      } else if (result?.error) {
        const msg = Object.values(result.error).flat()[0];
        toast.error(typeof msg === "string" ? msg : t.shopInfo.saved);
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
        toast.success(t.logo.uploaded);
      } else {
        toast.error(result?.error ?? t.logo.uploaded);
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
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t.shopInfo.email}
            </label>
            <input
              name="email"
              type="email"
              defaultValue={shop.email ?? ""}
              placeholder={t.shopInfo.emailPlaceholder}
              className={inputClass}
            />
            <p className="text-xs text-slate-400 mt-1">{t.shopInfo.emailHint}</p>
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
