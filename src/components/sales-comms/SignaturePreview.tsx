"use client";

import { useMemo } from "react";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { buildSignature } from "@/domain/sales-comms/signature";

export interface SignatureSource {
  name: string; title: string; email: string; phone: string;
  websiteUrl: string; bookingUrl: string | null; bookingEnabled: boolean; logoUrl: string; emailLanguage: "EN" | "FR";
}

/**
 * Live preview of the automatic signature. It runs the SAME pure builder the server uses when rendering outgoing mail, so what
 * is shown here is exactly what recipients get. The HTML comes only from that builder (all employee values escaped), never
 * from user input.
 */
export function SignaturePreview({ locale, src }: { locale: "en" | "fr"; src: SignatureSource }) {
  const t = commsCopy(locale).sig;
  const sig = useMemo(() => buildSignature({ name: src.name, title: src.title, email: src.email, phone: src.phone, websiteUrl: src.websiteUrl, bookingUrl: src.bookingEnabled ? src.bookingUrl : null, logoUrl: src.logoUrl, language: src.emailLanguage }),
    [src.name, src.title, src.email, src.phone, src.websiteUrl, src.bookingUrl, src.bookingEnabled, src.logoUrl, src.emailLanguage]);
  return (
    <section aria-labelledby="sig-preview-h" className="space-y-2 rounded-lg border border-slate-200 p-4 sm:col-span-2">
      <h3 id="sig-preview-h" className="text-sm font-semibold text-slate-900">{t.previewTitle}</h3>
      <p className="text-xs text-slate-500">{t.auto}</p>
      {!sig.ok ? (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">{t.missingTitle}</p>
          <p>{t.missingBody} {sig.missing.map((m) => t.missing[m]).join(", ")}.</p>
        </div>
      ) : (
        <div data-testid="signature-preview" className="max-w-full overflow-x-auto rounded-lg border border-slate-100 bg-white p-3" dangerouslySetInnerHTML={{ __html: sig.html }} />
      )}
      <ul className="space-y-0.5 text-xs text-slate-500">
        {sig.ok && !src.title.trim() && <li>{t.titleDefault}</li>}
        {sig.ok && !src.phone.trim() && <li>{t.phoneOptional}</li>}
        <li>{src.bookingEnabled ? t.bookingOn : t.bookingOff}</li>
        <li>{t.language}</li>
      </ul>
    </section>
  );
}
