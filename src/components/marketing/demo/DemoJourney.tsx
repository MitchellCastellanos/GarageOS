"use client";

import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { DemoFigure, DemoViewerProvider } from "@/components/marketing/demo/DemoViewer";
import { DemoBookingQr } from "@/components/marketing/demo/DemoBookingQr";
import { DemoPhoneSms, DemoSmsToDocument } from "@/components/marketing/demo/DemoMessage";
import {
  DEMO_SECTIONS, DEMO_UI, resolveDemoAsset, type DemoAssetKey, type DemoSectionCopy,
} from "@/lib/demo-journey";
import { ADMIN } from "@/lib/routes";

const SHOP_PETROL = "#0F4C5C";
const SHOP_COPPER = "#C77845";

const section = (id: DemoSectionCopy["id"]) => DEMO_SECTIONS.find((s) => s.id === id)!;

function useHas() {
  const { locale } = useMarketingLocale();
  return (...keys: DemoAssetKey[]) => keys.some((k) => resolveDemoAsset(k, locale) !== null);
}

function SectionFrame({ id, index, flip = false, children, visual }: {
  id: DemoSectionCopy["id"]; index: number; flip?: boolean; children?: React.ReactNode; visual: React.ReactNode;
}) {
  const { locale } = useMarketingLocale();
  const ui = DEMO_UI[locale];
  const s = section(id);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`scroll-mt-32 border-t border-slate-100 py-14 sm:py-20 ${index % 2 ? "bg-slate-50" : "bg-white"}`}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-start lg:gap-12">
          <div className={`lg:col-span-4 ${flip ? "lg:order-2" : ""}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: SHOP_COPPER }}>{ui.step} {index + 1}</p>
            <h2 id={`${id}-title`} className="mt-2 text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">{s.title[locale]}</h2>
            <p className="mt-3 leading-relaxed text-slate-700">{s.benefit[locale]}</p>
            {s.points.length > 0 && (
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                {s.points.map((p) => (
                  <li key={p.en} className="flex gap-2"><span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SHOP_COPPER }} />{p[locale]}</li>
                ))}
              </ul>
            )}
            {children}
          </div>
          <div className={`min-w-0 lg:col-span-8 ${flip ? "lg:order-1" : ""}`}>{visual}</div>
        </div>
      </div>
    </section>
  );
}

function Expandable({ label, show, children }: { label: string; show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <details className="group mt-6 rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-brand-blue [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="grid gap-6 border-t border-slate-100 p-4 sm:grid-cols-2">{children}</div>
    </details>
  );
}

function Side({ label, keys, className, children }: { label: string; keys: DemoAssetKey[]; className?: string; children: React.ReactNode }) {
  const has = useHas();
  if (!has(...keys)) return null;
  return (
    <div className={className}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {children}
    </div>
  );
}

function JourneyBody() {
  const { locale } = useMarketingLocale();
  const ui = DEMO_UI[locale];
  const has = useHas();

  return (
    <>
      {/* Hero */}
      <section className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <div className={`grid gap-10 ${has("01-dashboard-desktop") ? "lg:grid-cols-12 lg:items-center" : ""}`}>
            <div className={has("01-dashboard-desktop") ? "lg:col-span-5" : "mx-auto max-w-3xl text-center"}>
              <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: SHOP_COPPER, color: SHOP_PETROL }}>{ui.fictional}</span>
              <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">{ui.heroTitle}</h1>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">{ui.heroBody}</p>
              <div className={`mt-7 flex flex-col gap-3 sm:flex-row ${has("01-dashboard-desktop") ? "" : "justify-center"}`}>
                <a href="#booking" className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-blue px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-brand-blue-dark">
                  {ui.explore}<ArrowRight className="h-4 w-4" aria-hidden />
                </a>
                <Link href={ADMIN.signup} className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">{ui.trial}</Link>
              </div>
              {locale === "en" && <p className="mt-5 text-xs text-slate-500">{ui.langNote}</p>}
            </div>
            {has("01-dashboard-desktop") && (
              <div className="relative min-w-0 pb-2 sm:pb-10 lg:col-span-7">
                <DemoFigure assetKey="01-dashboard-desktop" priority showCaption={false} sizes="(min-width: 1024px) 58vw, 100vw" />
                {has("02-agenda-desktop") && (
                  <div className="absolute -bottom-4 left-2 hidden w-1/2 sm:block lg:-left-8">
                    <DemoFigure assetKey="02-agenda-desktop" sizes="30vw" showCaption={false} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Navegación del recorrido */}
      <nav aria-label={ui.jumpLabel} className="sticky top-16 z-40 border-b border-slate-100 bg-white/95 backdrop-blur sm:top-[72px]">
        <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 sm:px-6">
          {DEMO_SECTIONS.map((s) => (
            <li key={s.id} className="shrink-0">
              <a href={`#${s.id}`} className="inline-block rounded-full px-3.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-blue">{s.nav[locale]}</a>
            </li>
          ))}
        </ul>
      </nav>

      {/* 1 · Reservación */}
      <SectionFrame id="booking" index={0}
        visual={(
          <div className="space-y-8">
            <div className="grid items-start gap-5 sm:grid-cols-[minmax(0,1fr)_11rem] lg:grid-cols-[minmax(0,1fr)_13rem]">
              <DemoFigure assetKey="03-booking-desktop" sizes="(min-width: 1024px) 50vw, 100vw" />
              <DemoFigure assetKey="04-booking-mobile" sizes="208px" className="mx-auto w-44 sm:w-full" />
            </div>
            <Side label={ui.shopSide} keys={["02-agenda-desktop"]}>
              <DemoFigure assetKey="02-agenda-desktop" sizes="(min-width: 1024px) 60vw, 100vw" />
            </Side>
            <Expandable label={ui.showMore} show={has("05-booking-form-mobile", "06-confirmation-email")}>
              <DemoFigure assetKey="05-booking-form-mobile" className="mx-auto w-48" sizes="192px" />
              <DemoFigure assetKey="06-confirmation-email" sizes="(min-width: 640px) 40vw, 100vw" />
            </Expandable>
            <DemoPhoneSms messageKey="confirmation" />
            <DemoBookingQr />
          </div>
        )}
      />

      {/* 2 · Inspección */}
      <SectionFrame id="inspection" index={1} flip
        visual={(
          <div className="grid items-start gap-6 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <Side label={ui.shopSide} keys={["08-inspection-admin-desktop"]}><DemoFigure assetKey="08-inspection-admin-desktop" sizes="(min-width: 1024px) 45vw, 100vw" /></Side>
            <Side label={ui.customerSide} keys={["09-inspection-report-mobile"]}><DemoFigure assetKey="09-inspection-report-mobile" sizes="224px" className="mx-auto w-48 sm:w-full" /></Side>
          </div>
        )}
      />

      {/* 3 · Estimación y aprobación */}
      <SectionFrame id="approval" index={2}
        visual={(
          <div className="space-y-8">
            <Side label={ui.shopSide} keys={["10-estimate-editor-desktop"]}><DemoFigure assetKey="10-estimate-editor-desktop" sizes="(min-width: 1024px) 60vw, 100vw" /></Side>
            <Side label={ui.customerSide} keys={["11-estimate-customer-mobile"]}>
              <DemoSmsToDocument messageKey="quote" assetKey="11-estimate-customer-mobile">
                <DemoFigure assetKey="11-estimate-customer-mobile" sizes="260px" className="mx-auto w-56" />
              </DemoSmsToDocument>
            </Side>
            <Expandable label={ui.showMore} show={has("12-approval-history-desktop")}>
              <DemoFigure assetKey="12-approval-history-desktop" className="sm:col-span-2" sizes="(min-width: 1024px) 55vw, 100vw" />
            </Expandable>
          </div>
        )}
      />

      {/* 4 · Trabajo */}
      <SectionFrame id="work" index={3} flip
        visual={(
          <div className="space-y-8">
            <DemoFigure assetKey="13-work-order-desktop" sizes="(min-width: 1024px) 60vw, 100vw" />
            <div className="grid items-start gap-6 sm:grid-cols-[17.5rem_minmax(0,1fr)]">
              <DemoPhoneSms messageKey="ready" badge={ui.sampleVisit} />
              <Expandable label={ui.showMore} show={has("14-ready-email")}>
                <DemoFigure assetKey="14-ready-email" className="sm:col-span-2" sizes="(min-width: 640px) 40vw, 100vw" />
              </Expandable>
            </div>
          </div>
        )}
      />

      {/* 5 · Factura — momento clave */}
      <SectionFrame id="invoice" index={4}
        visual={(
          <div className="space-y-8">
            <DemoSmsToDocument messageKey="invoice" assetKey="15-invoice-pdf-page">
              <DemoFigure assetKey="15-invoice-pdf-page" sizes="(min-width: 1024px) 40vw, 100vw" className="mx-auto max-w-md md:max-w-none" />
            </DemoSmsToDocument>
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{ui.paymentNote}</p>
            <Expandable label={ui.showMore} show={has("16-invoice-email", "17-payment-record-desktop")}>
              <DemoFigure assetKey="16-invoice-email" sizes="(min-width: 640px) 40vw, 100vw" />
              <DemoFigure assetKey="17-payment-record-desktop" sizes="(min-width: 640px) 40vw, 100vw" />
            </Expandable>
          </div>
        )}
      />

      {/* 6 · Seguimiento */}
      <SectionFrame id="follow-up" index={5} flip
        visual={(
          <div className="space-y-8">
            <div className="grid items-start gap-6 sm:grid-cols-[13rem_minmax(0,1fr)]">
              <DemoFigure assetKey="18-customer-portal-mobile" sizes="208px" className="mx-auto w-44 sm:w-full" />
              <DemoFigure assetKey="07-client-vehicle-history-desktop" sizes="(min-width: 1024px) 45vw, 100vw" />
            </div>
            <div className="grid items-start gap-6 sm:grid-cols-[17.5rem_minmax(0,1fr)]">
              <DemoPhoneSms messageKey="maintenance" />
              <DemoFigure assetKey="19-maintenance-reminder-email" sizes="(min-width: 640px) 40vw, 100vw" />
            </div>
          </div>
        )}
      />

      {/* 7 · Retención y herramientas */}
      <SectionFrame id="more" index={6}
        visual={(
          <div className="space-y-8">
            <DemoFigure assetKey="20-campaign-email" sizes="(min-width: 1024px) 50vw, 100vw" className="mx-auto max-w-xl" />
            <Expandable label={ui.galleryTitle} show={has("21-campaign-editor-desktop", "22-sms-inbox-desktop", "23-inventory-desktop", "24-reports-desktop", "25-tire-storage-desktop")}>
              {(["21-campaign-editor-desktop", "22-sms-inbox-desktop", "23-inventory-desktop", "24-reports-desktop", "25-tire-storage-desktop"] as const).map((k) => (
                <DemoFigure key={k} assetKey={k} sizes="(min-width: 640px) 40vw, 100vw" />
              ))}
            </Expandable>
          </div>
        )}
      />

      {/* CTA final */}
      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{ui.finalTitle}</h2>
          <p className="mt-3 text-slate-600">{ui.finalBody}</p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={ADMIN.signup} className="inline-flex items-center gap-2 rounded-xl bg-brand-blue px-7 py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 hover:bg-brand-blue-dark">{ui.trial}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
            <Link href="/pricing" className="text-sm font-semibold text-brand-blue hover:underline">{ui.compare}</Link>
            <Link href="/contact" className="text-sm font-semibold text-slate-700 hover:text-slate-900">{ui.contact}</Link>
          </div>
        </div>
      </section>
    </>
  );
}

export function DemoJourney() {
  return (
    <DemoViewerProvider>
      <JourneyBody />
    </DemoViewerProvider>
  );
}
