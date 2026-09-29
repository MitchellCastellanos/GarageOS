"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { checkShopSlugAvailability, updateShopSettings, updateShopSlug } from "@/actions/settings";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { ONBOARDING_DICT, toOnboardingLocale } from "@/lib/admin-locale/onboarding";
import { StepShell } from "@/components/onboarding/StepShell";

interface Step1BusinessProps {
  step: number;
  totalSteps: number;
  banner?: string;
  shop: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    taxId: string | null;
    slug: string | null;
  };
  slugUrlPrefix: string;
  onNext: (slug: string) => void;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function Step1Business({ step, totalSteps, banner, shop, slugUrlPrefix, onNext }: Step1BusinessProps) {
  const locale = useAdminLocale();
  const t = ONBOARDING_DICT[toOnboardingLocale(locale)].step1;
  const [name, setName] = useState(shop.name);
  const [slug, setSlug] = useState(shop.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(shop.slug));
  const [pending, startTransition] = useTransition();
  const [checking, startChecking] = useTransition();
  const [availability, setAvailability] = useState<{ slug: string; available: boolean; error?: string } | null>(null);

  function handleCheckSlug() {
    const candidate = slug;
    startChecking(async () => {
      const result = await checkShopSlugAvailability(candidate);
      setAvailability({ slug: candidate, available: result.available, error: "error" in result ? result.error : undefined });
    });
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    // El taxId no se toca en este paso — se manda tal cual para no perderlo (ver Paso 2).
    formData.set("taxId", shop.taxId ?? "");

    startTransition(async () => {
      const infoResult = await updateShopSettings(formData);
      if (infoResult?.error) {
        const msg = Object.values(infoResult.error).flat()[0];
        toast.error(typeof msg === "string" ? msg : "Error");
        return;
      }

      if (!slug.trim()) {
        onNext(shop.slug ?? "");
        return;
      }
      const slugFormData = new FormData();
      slugFormData.set("slug", slug);
      const slugResult = await updateShopSlug(slugFormData);
      if (!slugResult?.success) {
        toast.error(slugResult?.error ?? "Error");
        return;
      }
      onNext(slugResult.slug);
    });
  }

  return (
    <StepShell step={step} totalSteps={totalSteps} title={t.title} subtitle={t.subtitle} banner={banner}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.name}</label>
          <input
            name="name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.address}</label>
          <input name="address" type="text" defaultValue={shop.address ?? ""} placeholder={t.addressPlaceholder} className={inputClass} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.phone}</label>
            <input name="phone" type="tel" defaultValue={shop.phone ?? ""} placeholder={t.phonePlaceholder} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.email}</label>
            <input name="email" type="email" defaultValue={shop.email ?? ""} placeholder={t.emailPlaceholder} className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.slugLabel}</label>
          <div className="flex flex-wrap items-stretch rounded-lg border border-slate-300 overflow-hidden">
            <span className="flex items-center px-3 bg-slate-50 text-slate-500 text-sm border-r border-slate-300 whitespace-nowrap">
              {slugUrlPrefix}
            </span>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              className="flex-1 min-w-[140px] px-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <button
              type="button"
              onClick={handleCheckSlug}
              disabled={checking || !slug.trim()}
              className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {checking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {checking ? t.slugChecking : t.slugCheck}
            </button>
            {availability && availability.slug === slug && !checking && (
              <span
                className={`flex items-center gap-1 text-xs font-medium ${availability.available ? "text-emerald-600" : "text-red-600"}`}
              >
                {availability.available ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                {availability.available ? t.slugAvailable : (availability.error ?? t.slugTaken)}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">{t.slugHint}</p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {pending ? t.saving : t.continue}
          </button>
        </div>
      </form>
    </StepShell>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
