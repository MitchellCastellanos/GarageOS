"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { publishBookingPage } from "@/actions/booking-page";
import { BRAND_COLOR_PRESETS, DEFAULT_BRAND_COLOR, isValidHexColor, toSafeDarkBrandColor } from "@/lib/brand-color";
import { extractDominantColor } from "@/lib/dominant-color";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { ONBOARDING_DICT, toOnboardingLocale } from "@/lib/admin-locale/onboarding";
import { StepShell } from "@/components/onboarding/StepShell";
import { cn } from "@/lib/utils";

interface Step5DesignProps {
  step: number;
  totalSteps: number;
  shopName: string;
  logoUrl: string | null;
  initialBrandColor: string | null;
  onNext: () => void;
  onBack: () => void;
}

export function Step5Design({ step, totalSteps, shopName, logoUrl, initialBrandColor, onNext, onBack }: Step5DesignProps) {
  const locale = useAdminLocale();
  const t = ONBOARDING_DICT[toOnboardingLocale(locale)].step5;
  const [color, setColor] = useState(initialBrandColor ?? DEFAULT_BRAND_COLOR);
  const [extracted, setExtracted] = useState(false);
  const [pending, startTransition] = useTransition();
  const extractedOnce = useRef(false);

  useEffect(() => {
    if (extractedOnce.current || initialBrandColor || !logoUrl) return;
    extractedOnce.current = true;
    extractDominantColor(logoUrl).then((hex) => {
      if (hex) {
        setColor(hex);
        setExtracted(true);
      }
    });
  }, [logoUrl, initialBrandColor]);

  function handleContinue() {
    startTransition(async () => {
      const result = await publishBookingPage({
        template: "CLASSIC",
        typography: "GARAGE",
        brandColor: isValidHexColor(color) ? color : null,
        coverImageUrl: null,
        shopImageUrl: null,
      });
      if ("success" in result) onNext();
      else toast.error("Error");
    });
  }

  return (
    <StepShell step={step} totalSteps={totalSteps} title={t.title} subtitle={t.subtitle} onBack={onBack}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <input
            type="color"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              setExtracted(false);
            }}
            className="w-12 h-12 rounded-lg border border-slate-300 cursor-pointer bg-transparent p-0"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              setExtracted(false);
            }}
            maxLength={7}
            className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono uppercase"
          />
          <div
            className="flex-1 min-w-[160px] rounded-lg px-4 py-3 text-sm font-semibold uppercase tracking-wide"
            style={{ backgroundColor: toSafeDarkBrandColor(color), color: "#fff" }}
          >
            {shopName}
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label={t.title}>
          {BRAND_COLOR_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setColor(preset);
                setExtracted(false);
              }}
              aria-label={preset}
              aria-pressed={color.toLowerCase() === preset}
              className={cn(
                "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                color.toLowerCase() === preset ? "border-slate-900 ring-2 ring-white ring-inset" : "border-white shadow"
              )}
              style={{ backgroundColor: preset }}
            />
          ))}
        </div>

        {extracted && <p className="text-xs text-slate-500">{t.colorExtracted}</p>}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleContinue}
            disabled={pending}
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
