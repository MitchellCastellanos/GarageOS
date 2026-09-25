"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  Lock,
  Monitor,
  RotateCcw,
  Smartphone,
  Trash2,
} from "lucide-react";
import {
  publishBookingPage,
  uploadBookingPageImage,
  type getBookingPageSettings,
  type BookingPageActionError,
} from "@/actions/booking-page";
import { useAdminLocale } from "@/components/admin/AdminLocaleProvider";
import { LocaleProvider } from "@/components/booking/LocaleProvider";
import { BookingPageRenderer } from "@/components/booking/page/BookingPageRenderer";
import { BOOKING_FONT_VARIABLES, TYPOGRAPHY_PRESETS } from "@/components/booking/page/typography";
import { ScaledPreview } from "@/components/settings/booking-page/ScaledPreview";
import { prepareBookingImage } from "@/components/settings/booking-page/prepare-image";
import { BOOKING_PAGE_DICT, type BookingPageDictionary } from "@/lib/admin-locale/booking-page";
import { DEFAULT_BRAND_COLOR, isValidHexColor, toSafeDarkBrandColor } from "@/lib/brand-color";
import {
  BOOKING_PAGE_TEMPLATES,
  BOOKING_PAGE_TYPOGRAPHIES,
  buildBookingPageViewModel,
  isPremiumTemplate,
  isPremiumTypography,
  requiresAdvancedDesign,
  validateBookingImage,
  type BookingImageKind,
  type BookingPageTemplate,
  type BookingPageTypography,
} from "@/lib/booking-page";
import { ADMIN } from "@/lib/routes";
import { cn } from "@/lib/utils";

type Settings = NonNullable<Awaited<ReturnType<typeof getBookingPageSettings>>>;

const STEPS = ["photos", "template", "style", "review"] as const;
type Step = (typeof STEPS)[number];

interface Draft {
  template: BookingPageTemplate;
  typography: BookingPageTypography;
  brandColor: string;
  coverImageUrl: string | null;
  shopImageUrl: string | null;
}

function toDraft(published: Settings["published"]): Draft {
  return {
    template: published.template,
    typography: published.typography,
    brandColor: published.brandColor ?? DEFAULT_BRAND_COLOR,
    coverImageUrl: published.coverImageUrl,
    shopImageUrl: published.shopImageUrl,
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.template === b.template &&
    a.typography === b.typography &&
    a.brandColor.toLowerCase() === b.brandColor.toLowerCase() &&
    a.coverImageUrl === b.coverImageUrl &&
    a.shopImageUrl === b.shopImageUrl
  );
}

const UPGRADE_HREF = `${ADMIN.settings}?tab=billing&plan=pro`;

export function BookingPageConfigurator({ settings }: { settings: Settings }) {
  const locale = useAdminLocale();
  const t = BOOKING_PAGE_DICT[locale];

  const [published, setPublished] = useState<Draft>(() => toDraft(settings.published));
  const [draft, setDraft] = useState<Draft>(published);
  // Primera vez (nunca publicó desde acá): asistente guiado paso a paso.
  // Después: el mismo contenido como editor compacto de navegación libre.
  const [guided, setGuided] = useState(!settings.publishedAt);
  const [step, setStep] = useState<Step>("photos");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [justPublished, setJustPublished] = useState(false);
  const [publishedAt, setPublishedAt] = useState<Date | null>(settings.publishedAt);
  const [publishing, startPublish] = useTransition();

  const dirty = !sameDraft(draft, published);
  const locked = requiresAdvancedDesign(draft) && !settings.advancedDesignAllowed;
  const stepIndex = STEPS.indexOf(step);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const page = useMemo(
    () =>
      buildBookingPageViewModel({
        slug: settings.shop.slug ?? "",
        shop: {
          name: settings.shop.name,
          logoUrl: settings.shop.logoUrl,
          phone: settings.shop.phone,
          address: settings.shop.address,
          bookingSlotMinutes: settings.shop.bookingSlotMinutes,
        },
        coverImageUrl: draft.coverImageUrl,
        shopImageUrl: draft.shopImageUrl,
        services: settings.services,
      }),
    [settings, draft.coverImageUrl, draft.shopImageUrl]
  );

  function update(patch: Partial<Draft>) {
    setJustPublished(false);
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function errorMessage(code: BookingPageActionError | undefined) {
    return code ? t.errors[code] : t.errors.generic;
  }

  function handlePublish() {
    if (locked) {
      toast.error(t.errors.entitlement);
      return;
    }
    startPublish(async () => {
      try {
        const brandColor = draft.brandColor.toLowerCase() === DEFAULT_BRAND_COLOR ? null : draft.brandColor;
        const result = await publishBookingPage({
          template: draft.template,
          typography: draft.typography,
          brandColor,
          coverImageUrl: draft.coverImageUrl,
          shopImageUrl: draft.shopImageUrl,
        });
        if ("error" in result) {
          toast.error(errorMessage(result.error));
          return;
        }
        setPublished(draft);
        setPublishedAt(result.publishedAt);
        setGuided(false);
        setStep("review");
        setJustPublished(true);
        toast.success(t.publish.success);
      } catch {
        toast.error(t.errors.generic);
      }
    });
  }

  function handleDiscard() {
    setDraft(published);
    setJustPublished(false);
  }

  return (
    <div className="space-y-5 min-w-0">
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-slate-900">{t.title}</h2>
            <StatusPill dirty={dirty} publishedAt={publishedAt} t={t} />
          </div>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">{guided ? t.guidedIntro : t.subtitle}</p>
        </div>
        {!guided && (
          <div className="flex items-center gap-2 flex-wrap">
            {dirty && (
              <button
                type="button"
                onClick={handleDiscard}
                disabled={publishing}
                className="flex items-center gap-1.5 text-sm text-slate-600 hover:bg-slate-100 px-3 py-2 rounded-lg"
              >
                <RotateCcw className="w-4 h-4" />
                {t.publish.discard}
              </button>
            )}
            <PublishButton
              onClick={handlePublish}
              disabled={!dirty || locked || publishing}
              publishing={publishing}
              t={t}
            />
          </div>
        )}
      </div>

      {!settings.shop.bookingEnabled && (
        <Notice>{t.publish.bookingDisabled}</Notice>
      )}

      <nav className="flex gap-1 overflow-x-auto" aria-label={t.title}>
        {STEPS.map((key, i) => {
          const reachable = !guided || i <= stepIndex;
          return (
            <button
              key={key}
              type="button"
              disabled={!reachable}
              onClick={() => setStep(key)}
              aria-current={step === key ? "step" : undefined}
              className={cn(
                "shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                step === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                !reachable && "opacity-40 cursor-not-allowed hover:bg-transparent"
              )}
            >
              {guided && (
                <span
                  className={cn(
                    "w-5 h-5 rounded-full text-[11px] flex items-center justify-center",
                    step === key ? "bg-white text-slate-900" : i < stepIndex ? "bg-emerald-500 text-white" : "bg-slate-200"
                  )}
                >
                  {i < stepIndex ? <Check className="w-3 h-3" /> : i + 1}
                </span>
              )}
              {t.steps[key]}
            </button>
          );
        })}
      </nav>

      <div className="grid xl:grid-cols-[380px_minmax(0,1fr)] gap-6 items-start">
        <div className="space-y-4 min-w-0">
          {step === "photos" && <PhotosStep draft={draft} settings={settings} onChange={update} t={t} errorMessage={errorMessage} />}
          {step === "template" && (
            <TemplateStep draft={draft} page={page} allowed={settings.advancedDesignAllowed} onChange={update} t={t} />
          )}
          {step === "style" && <StyleStep draft={draft} allowed={settings.advancedDesignAllowed} onChange={update} t={t} />}
          {step === "review" && (
            <ReviewStep
              draft={draft}
              settings={settings}
              featuredCount={page.featured.length}
              locked={locked}
              dirty={dirty}
              guided={guided}
              publishing={publishing}
              justPublished={justPublished}
              onPublish={handlePublish}
              t={t}
            />
          )}

          {guided && (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)])}
                disabled={stepIndex === 0}
                className="text-sm font-medium text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-lg disabled:invisible"
              >
                {t.back}
              </button>
              <span className="text-xs text-slate-400">{t.stepCounter(stepIndex + 1, STEPS.length)}</span>
              {stepIndex < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(STEPS[stepIndex + 1])}
                  className="text-sm font-medium bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg"
                >
                  {t.next}
                </button>
              ) : (
                <span className="w-16" />
              )}
            </div>
          )}
        </div>

        <PreviewPanel
          page={page}
          draft={draft}
          device={device}
          onDeviceChange={setDevice}
          dirty={dirty}
          locked={locked}
          publicUrl={publishedAt ? settings.publicUrl : null}
          t={t}
        />
      </div>
    </div>
  );
}

// ── Piezas ──────────────────────────────────────────────────────

function StatusPill({ dirty, publishedAt, t }: { dirty: boolean; publishedAt: Date | null; t: BookingPageDictionary }) {
  if (dirty) {
    return (
      <span className="text-[11px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
        {t.publish.unsaved}
      </span>
    );
  }
  if (!publishedAt) return null;
  return (
    <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
      {t.publish.upToDate}
    </span>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3 rounded-lg">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

function ProBadge({ t }: { t: BookingPageDictionary }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
      <Lock className="w-2.5 h-2.5" />
      {t.pro.badge}
    </span>
  );
}

function LockedCallout({ t }: { t: BookingPageDictionary }) {
  return (
    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4">
      <p className="font-semibold text-slate-900 text-sm flex items-center gap-2">
        <Lock className="w-4 h-4 text-amber-700" />
        {t.pro.lockedTitle}
      </p>
      <p className="text-sm text-slate-600 mt-1">{t.pro.lockedBody}</p>
      <Link
        href={UPGRADE_HREF}
        className="inline-flex mt-3 bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        {t.pro.upgradeCta}
      </Link>
    </div>
  );
}

function PublishButton({
  onClick,
  disabled,
  publishing,
  t,
  className,
}: {
  onClick: () => void;
  disabled: boolean;
  publishing: boolean;
  t: BookingPageDictionary;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg",
        className
      )}
    >
      {publishing && <Loader2 className="w-4 h-4 animate-spin" />}
      {publishing ? t.publish.publishing : t.publish.button}
    </button>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      {title && <h3 className="font-semibold text-slate-900">{title}</h3>}
      {children}
    </div>
  );
}

// ── Paso 1: fotos ───────────────────────────────────────────────

function PhotosStep({
  draft,
  settings,
  onChange,
  t,
  errorMessage,
}: {
  draft: Draft;
  settings: Settings;
  onChange: (patch: Partial<Draft>) => void;
  t: BookingPageDictionary;
  errorMessage: (code: BookingPageActionError | undefined) => string;
}) {
  return (
    <>
      <Card>
        <div>
          <h3 className="font-semibold text-slate-900">{t.photos.heading}</h3>
          <p className="text-sm text-slate-500 mt-1">{t.photos.intro}</p>
        </div>
        <PhotoField
          kind="cover"
          url={draft.coverImageUrl}
          onChange={(url) => onChange({ coverImageUrl: url })}
          copy={t.photos.cover}
          t={t}
          errorMessage={errorMessage}
        />
        <PhotoField
          kind="shop"
          url={draft.shopImageUrl}
          onChange={(url) => onChange({ shopImageUrl: url })}
          copy={t.photos.shop}
          t={t}
          errorMessage={errorMessage}
        />
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 shrink-0 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
            {settings.shop.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo en Supabase
              <img src={settings.shop.logoUrl} alt={t.photos.logoTitle} className="w-full h-full object-contain" />
            ) : (
              <ImagePlus className="w-5 h-5 text-slate-300" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">{t.photos.logoTitle}</p>
            <p className="text-xs text-slate-500">{settings.shop.logoUrl ? t.photos.logoSet : t.photos.logoMissing}</p>
            <Link href={`${ADMIN.settings}?tab=general`} className="text-xs font-medium text-teal-700 hover:underline">
              {t.photos.logoLink}
            </Link>
          </div>
        </div>
      </Card>
    </>
  );
}

function PhotoField({
  kind,
  url,
  onChange,
  copy,
  t,
  errorMessage,
}: {
  kind: BookingImageKind;
  url: string | null;
  onChange: (url: string | null) => void;
  copy: { title: string; guidance: string; recommended: string };
  t: BookingPageDictionary;
  errorMessage: (code: BookingPageActionError | undefined) => string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.target.files?.[0];
    e.target.value = "";
    if (!original) return;

    setUploading(true);
    try {
      const file = await prepareBookingImage(original);
      const validation = validateBookingImage(file);
      if (validation) {
        toast.error(errorMessage(validation === "empty" ? "noFile" : validation));
        return;
      }
      const formData = new FormData();
      formData.set("kind", kind);
      formData.set("image", file);
      const result = await uploadBookingPageImage(formData);
      if ("error" in result) toast.error(errorMessage(result.error));
      else onChange(result.url);
    } catch {
      toast.error(t.errors.uploadFailed);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border-t border-slate-100 pt-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-900">{copy.title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{copy.guidance}</p>
        <p className="text-[11px] text-slate-400 mt-1">{copy.recommended}</p>
      </div>
      <div
        className={cn(
          "relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50",
          kind === "cover" ? "aspect-[16/9]" : "aspect-[4/3]"
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura del borrador (Supabase)
          <img src={url} alt={copy.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400 text-xs text-center px-4">
            <ImagePlus className="w-6 h-6" />
            <span>{t.photos.empty}</span>
            <span className="text-[11px]">{t.photos.fallbackNote}</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className="hidden"
          onChange={handleFile}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 text-sm font-medium border border-slate-300 hover:bg-slate-50 disabled:opacity-50 px-3 py-1.5 rounded-lg"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
          {uploading ? t.photos.uploading : url ? t.photos.replace : t.photos.upload}
        </button>
        {url && !uploading && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex items-center gap-1.5 text-sm text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg"
          >
            <Trash2 className="w-4 h-4" />
            {t.photos.remove}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Paso 2: plantilla ───────────────────────────────────────────

function TemplateStep({
  draft,
  page,
  allowed,
  onChange,
  t,
}: {
  draft: Draft;
  page: ReturnType<typeof buildBookingPageViewModel>;
  allowed: boolean;
  onChange: (patch: Partial<Draft>) => void;
  t: BookingPageDictionary;
}) {
  const selectedLocked = !allowed && isPremiumTemplate(draft.template);

  return (
    <Card>
      <div>
        <h3 className="font-semibold text-slate-900">{t.template.heading}</h3>
        <p className="text-sm text-slate-500 mt-1">{t.template.intro}</p>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-1 gap-3">
        {BOOKING_PAGE_TEMPLATES.map((template) => {
          const selected = draft.template === template;
          return (
            <button
              key={template}
              type="button"
              onClick={() => onChange({ template })}
              aria-pressed={selected}
              className={cn(
                "text-left rounded-xl border-2 overflow-hidden transition-colors",
                selected ? "border-teal-600" : "border-slate-200 hover:border-slate-300"
              )}
            >
              <div className="border-b border-slate-100 bg-slate-100">
                <ScaledPreview virtualWidth={1280} height={150} interactive={false}>
                  <LocaleProvider syncDocumentLang={false}>
                    <BookingPageRenderer
                      page={page}
                      design={{ template, typography: draft.typography }}
                      brandColor={draft.brandColor}
                      mode="thumbnail"
                    />
                  </LocaleProvider>
                </ScaledPreview>
              </div>
              <div className="px-3 py-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    {t.template.names[template]}
                    {template === "CLASSIC" && (
                      <span className="text-[10px] font-medium text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">
                        {t.template.recommended}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{t.template.descriptions[template]}</p>
                </div>
                {!allowed && isPremiumTemplate(template) && <ProBadge t={t} />}
              </div>
            </button>
          );
        })}
      </div>
      {selectedLocked && <LockedCallout t={t} />}
    </Card>
  );
}

// ── Paso 3: estilo ──────────────────────────────────────────────

function StyleStep({
  draft,
  allowed,
  onChange,
  t,
}: {
  draft: Draft;
  allowed: boolean;
  onChange: (patch: Partial<Draft>) => void;
  t: BookingPageDictionary;
}) {
  const [colorText, setColorText] = useState(draft.brandColor);
  const adjusted = toSafeDarkBrandColor(draft.brandColor).toLowerCase() !== draft.brandColor.toLowerCase();
  const typographyLocked = !allowed && isPremiumTypography(draft.typography);

  function setColor(value: string) {
    setColorText(value);
    if (isValidHexColor(value)) onChange({ brandColor: value.toLowerCase() });
  }

  return (
    <>
      <Card title={t.style.typographyTitle}>
        <p className="text-sm text-slate-500 -mt-2">{t.style.intro}</p>
        <div className={cn("grid grid-cols-2 gap-2", BOOKING_FONT_VARIABLES)}>
          {BOOKING_PAGE_TYPOGRAPHIES.map((typography) => {
            const preset = TYPOGRAPHY_PRESETS[typography];
            const selected = draft.typography === typography;
            return (
              <button
                key={typography}
                type="button"
                onClick={() => onChange({ typography })}
                aria-pressed={selected}
                className={cn(
                  "relative text-left rounded-lg border-2 p-3 transition-colors",
                  selected ? "border-teal-600 bg-teal-50/40" : "border-slate-200 hover:border-slate-300"
                )}
              >
                {!allowed && isPremiumTypography(typography) && (
                  <span className="absolute top-2 right-2">
                    <ProBadge t={t} />
                  </span>
                )}
                <span
                  className="block text-2xl text-slate-900 leading-none"
                  style={{
                    fontFamily: preset.heading,
                    fontWeight: preset.headingWeight,
                    textTransform: preset.headingCase,
                    letterSpacing: preset.headingTracking,
                  }}
                >
                  Aa
                </span>
                <span className="block mt-2 text-sm font-medium text-slate-900">{t.style.typographyNames[typography]}</span>
                <span className="block text-[11px] text-slate-500">{t.style.typographyDescriptions[typography]}</span>
              </button>
            );
          })}
        </div>
        {typographyLocked && <LockedCallout t={t} />}
      </Card>

      <Card title={t.style.colorTitle}>
        <p className="text-sm text-slate-500 -mt-2">{t.style.colorHint}</p>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={draft.brandColor}
            onChange={(e) => setColor(e.target.value)}
            className="w-12 h-10 rounded-lg border border-slate-200 cursor-pointer bg-white p-1"
            aria-label={t.style.colorTitle}
          />
          <input
            value={colorText}
            onChange={(e) => setColor(e.target.value.trim())}
            maxLength={7}
            className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono uppercase"
          />
          <button
            type="button"
            onClick={() => setColor(DEFAULT_BRAND_COLOR)}
            className="text-sm text-slate-600 hover:bg-slate-100 px-3 py-2 rounded-lg"
          >
            {t.style.colorReset}
          </button>
        </div>
        {adjusted && (
          <p className="text-xs text-slate-500 flex items-center gap-2">
            <span
              className="inline-block w-4 h-4 rounded border border-slate-200"
              style={{ backgroundColor: toSafeDarkBrandColor(draft.brandColor) }}
            />
            {t.style.colorAdjusted}
          </p>
        )}
      </Card>
    </>
  );
}

// ── Paso 4: revisar y publicar ──────────────────────────────────

function ReviewStep({
  draft,
  settings,
  featuredCount,
  locked,
  dirty,
  guided,
  publishing,
  justPublished,
  onPublish,
  t,
}: {
  draft: Draft;
  settings: Settings;
  featuredCount: number;
  locked: boolean;
  dirty: boolean;
  guided: boolean;
  publishing: boolean;
  justPublished: boolean;
  onPublish: () => void;
  t: BookingPageDictionary;
}) {
  const photoCount = [draft.coverImageUrl, draft.shopImageUrl].filter(Boolean).length;

  return (
    <>
      <Card>
        <div>
          <h3 className="font-semibold text-slate-900">{t.review.heading}</h3>
          <p className="text-sm text-slate-500 mt-1">{t.review.intro}</p>
        </div>
        <dl className="text-sm divide-y divide-slate-100 border-y border-slate-100">
          <SummaryRow label={t.review.template}>
            {t.template.names[draft.template]}
            {!settings.advancedDesignAllowed && isPremiumTemplate(draft.template) && <ProBadge t={t} />}
          </SummaryRow>
          <SummaryRow label={t.review.typography}>
            {t.style.typographyNames[draft.typography]}
            {!settings.advancedDesignAllowed && isPremiumTypography(draft.typography) && <ProBadge t={t} />}
          </SummaryRow>
          <SummaryRow label={t.review.color}>
            <span className="inline-block w-4 h-4 rounded border border-slate-200" style={{ backgroundColor: draft.brandColor }} />
            <span className="font-mono uppercase text-xs">{draft.brandColor}</span>
          </SummaryRow>
          <SummaryRow label={t.review.photos}>{t.review.photosCount(photoCount)}</SummaryRow>
          <SummaryRow label={t.review.services}>
            {t.review.featuredCount(featuredCount)}
            <Link href={`${ADMIN.settings}?tab=services`} className="text-xs font-medium text-teal-700 hover:underline">
              {t.review.servicesLink}
            </Link>
          </SummaryRow>
        </dl>

        {locked && <LockedCallout t={t} />}

        {(guided || dirty) && (
          <PublishButton
            onClick={onPublish}
            disabled={locked || publishing || (!guided && !dirty)}
            publishing={publishing}
            t={t}
            className="w-full py-2.5"
          />
        )}
      </Card>

      {justPublished && settings.publicUrl && <LiveUrlCard url={settings.publicUrl} t={t} />}
      {!settings.publicUrl && <Notice>{t.publish.noSlug}</Notice>}
    </>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="flex items-center gap-2 text-slate-900 font-medium text-right">{children}</dd>
    </div>
  );
}

function LiveUrlCard({ url, t }: { url: string; t: BookingPageDictionary }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t.publish.copied);
    } catch {
      toast.error(t.errors.generic);
    }
  }

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
        <Check className="w-4 h-4" />
        {t.publish.liveTitle}
      </p>
      <p className="text-sm text-emerald-900 break-all font-mono">{url}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 text-sm font-medium bg-white border border-emerald-200 hover:bg-emerald-100 px-3 py-1.5 rounded-lg"
        >
          <Copy className="w-4 h-4" />
          {t.publish.copy}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg"
        >
          <ExternalLink className="w-4 h-4" />
          {t.publish.open}
        </a>
      </div>
    </div>
  );
}

// ── Preview ─────────────────────────────────────────────────────

function PreviewPanel({
  page,
  draft,
  device,
  onDeviceChange,
  dirty,
  locked,
  publicUrl,
  t,
}: {
  page: ReturnType<typeof buildBookingPageViewModel>;
  draft: Draft;
  device: "desktop" | "mobile";
  onDeviceChange: (device: "desktop" | "mobile") => void;
  dirty: boolean;
  locked: boolean;
  publicUrl: string | null;
  t: BookingPageDictionary;
}) {
  const mobile = device === "mobile";

  return (
    <div className="xl:sticky xl:top-4 bg-slate-100 rounded-xl border border-slate-200 p-3 space-y-3 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-700">{t.preview.title}</p>
          {dirty && (
            <span className="text-[10px] font-semibold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
              {t.preview.draftBadge}
            </span>
          )}
          {locked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
              <Lock className="w-2.5 h-2.5" />
              {t.pro.previewNote}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t.preview.openLive}
            </a>
          )}
          <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200">
            <DeviceButton active={!mobile} onClick={() => onDeviceChange("desktop")} label={t.preview.desktop}>
              <Monitor className="w-4 h-4" />
            </DeviceButton>
            <DeviceButton active={mobile} onClick={() => onDeviceChange("mobile")} label={t.preview.mobile}>
              <Smartphone className="w-4 h-4" />
            </DeviceButton>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "mx-auto bg-white overflow-hidden shadow-sm",
          mobile ? "max-w-[406px] rounded-[2rem] border-[8px] border-slate-900" : "rounded-lg border border-slate-200"
        )}
      >
        <ScaledPreview key={device} virtualWidth={mobile ? 390 : 1280} height={mobile ? 720 : 680}>
          <LocaleProvider syncDocumentLang={false}>
            <BookingPageRenderer
              page={page}
              design={{ template: draft.template, typography: draft.typography }}
              brandColor={draft.brandColor}
              mode="preview"
            />
          </LocaleProvider>
        </ScaledPreview>
      </div>
    </div>
  );
}

function DeviceButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
        active ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"
      )}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
