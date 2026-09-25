"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import Image from "next/image";
import { Loader2, Upload } from "lucide-react";
import { updateShopSettings, updateShopTaxLines, uploadShopLogo } from "@/actions/settings";
import { validateLogo } from "@/lib/logo-upload";
import { CANADA_TAX_PRESETS } from "@/lib/tax-presets";
import { parseShopTaxLines } from "@/lib/taxes";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { ONBOARDING_DICT, toOnboardingLocale } from "@/lib/admin-locale/onboarding";
import { StepShell } from "@/components/onboarding/StepShell";

interface Step2FiscalProps {
  step: number;
  totalSteps: number;
  shop: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    taxId: string | null;
    logoUrl: string | null;
    taxLines: unknown;
  };
  onNext: (logoUrl: string | null) => void;
  onBack: () => void;
}

export function Step2Fiscal({ step, totalSteps, shop, onNext, onBack }: Step2FiscalProps) {
  const locale = useAdminLocale();
  const t = ONBOARDING_DICT[toOnboardingLocale(locale)].step2;
  const [logoUrl, setLogoUrl] = useState(shop.logoUrl);
  const [taxId, setTaxId] = useState(shop.taxId ?? "");
  const [taxLines, setTaxLines] = useState(() => parseShopTaxLines(shop.taxLines));
  const [logoPending, startLogoTransition] = useTransition();
  const [pending, startTransition] = useTransition();
  const logoInputRef = useRef<HTMLInputElement>(null);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const validation = validateLogo(file);
    if (validation) {
      toast.error(validation === "tooLarge" ? "File is too large (max 4 MB)" : "Unsupported file type");
      return;
    }
    const formData = new FormData();
    formData.append("logo", file);
    startLogoTransition(async () => {
      const result = await uploadShopLogo(formData);
      if (result?.success && result.logoUrl) setLogoUrl(result.logoUrl);
      else toast.error(result?.error ?? "Upload failed");
    });
  }

  function applyPreset(code: string) {
    const preset = CANADA_TAX_PRESETS.find((p) => p.code === code);
    if (preset) setTaxLines(preset.lines.map((l) => ({ name: l.name, rate: l.rate })));
  }

  function handleContinue() {
    startTransition(async () => {
      const infoFormData = new FormData();
      infoFormData.set("name", shop.name);
      infoFormData.set("address", shop.address ?? "");
      infoFormData.set("phone", shop.phone ?? "");
      infoFormData.set("email", shop.email ?? "");
      infoFormData.set("taxId", taxId);
      const infoResult = await updateShopSettings(infoFormData);
      if (infoResult?.error) {
        const msg = Object.values(infoResult.error).flat()[0];
        toast.error(typeof msg === "string" ? msg : "Error");
        return;
      }

      const taxFormData = new FormData();
      taxFormData.set(
        "taxLines",
        JSON.stringify(taxLines.map((l) => ({ name: l.name, rate: Number(l.rate) })))
      );
      const taxResult = await updateShopTaxLines(taxFormData);
      if (taxResult?.error) {
        toast.error(typeof taxResult.error === "string" ? taxResult.error : "Error");
        return;
      }

      onNext(logoUrl);
    });
  }

  return (
    <StepShell step={step} totalSteps={totalSteps} title={t.title} subtitle={t.subtitle} onBack={onBack}>
      <div className="space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 mb-2">{t.logoTitle}</h2>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50 overflow-hidden flex-shrink-0">
              {logoUrl ? (
                <Image src={logoUrl} alt={t.logoTitle} width={80} height={80} className="object-contain" unoptimized />
              ) : (
                <Upload className="w-5 h-5 text-slate-300" />
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
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {logoPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {logoPending ? t.logoUploading : t.logoChange}
              </button>
              <p className="text-xs text-slate-400 mt-1.5">{t.logoHint}</p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.taxPresetLabel}</label>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) applyPreset(e.target.value);
              e.target.value = "";
            }}
            className={inputClass}
          >
            <option value="">{t.taxPresetPlaceholder}</option>
            {CANADA_TAX_PRESETS.map((preset) => (
              <option key={preset.code} value={preset.code}>
                {preset.label[locale]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.taxIdLabel}</label>
          <input
            type="text"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            placeholder={t.taxIdPlaceholder}
            className={inputClass}
          />
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleContinue}
            disabled={pending || logoPending}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {pending ? t.saving : t.continue}
          </button>
        </div>
      </div>
    </StepShell>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
