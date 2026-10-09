import "server-only";
import { render } from "@react-email/render";
import React from "react";
import { SalesEmail } from "@/emails/SalesEmail";
import { assertSafeHeaderValue, cleanSubject } from "@/domain/sales-comms/email";
import { textToHtml } from "@/domain/sales-comms/html";
import { getAppUrl } from "@/config/app";

export interface IdentityFacts { fromName: string; fromEmail: string; jobTitle: string | null; phone: string | null; signatureText: string | null }
export interface SettingsFacts { legalName: string; mailingAddress: string | null; contactEmail: string | null; contactPhone: string | null; websiteUrl: string }

export function signatureLinesFor(id: IdentityFacts, s: SettingsFacts, lang: "EN" | "FR"): string[] {
  if (id.signatureText?.trim()) return id.signatureText.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd()).filter((l, i, a) => l || (i > 0 && a[i - 1])).slice(0, 12);
  const title = id.jobTitle?.trim() || (lang === "FR" ? "Représentant aux ventes — GarageOS" : "Sales Representative — GarageOS");
  return [id.fromName, title, id.fromEmail, ...(id.phone ? [id.phone] : []), s.websiteUrl.replace(/^https?:\/\//, "")];
}

export function footerLinesFor(s: SettingsFacts, lang: "EN" | "FR", commercial: boolean): string[] {
  const contact = [s.contactEmail, s.contactPhone, s.websiteUrl.replace(/^https?:\/\//, "")].filter(Boolean).join(" · ");
  const ident = `${s.legalName}${s.mailingAddress ? ` · ${s.mailingAddress}` : ""}`;
  const lines = [ident, contact];
  if (commercial) lines.push(lang === "FR"
    ? "Vous recevez ce message parce que votre entreprise pourrait bénéficier de GarageOS. Vous pouvez vous désabonner en tout temps."
    : "You are receiving this message because your business may benefit from GarageOS. You can unsubscribe at any time.");
  return lines.filter(Boolean);
}

export interface BuildContentInput {
  subject: string; bodyText: string; language: "EN" | "FR"; identity: IdentityFacts; settings: SettingsFacts;
  commercial: boolean; unsubscribeUrl: string | null; bookingCta?: { url: string; label: string } | null;
}
export interface BuiltContent { subject: string; text: string; html: string }

/** The ONE renderer for both the live preview and the stored message, so a preview can never differ from what is sent. */
export async function buildContent(i: BuildContentInput): Promise<BuiltContent> {
  const subject = cleanSubject(i.subject);
  const lines = signatureLinesFor(i.identity, i.settings, i.language);
  const footer = footerLinesFor(i.settings, i.language, i.commercial);
  const unsubLabel = i.language === "FR" ? "Se désabonner" : "Unsubscribe";
  if (i.commercial && !i.unsubscribeUrl) throw new Error("UNSUBSCRIBE_URL_REQUIRED");
  const html = await render(React.createElement(SalesEmail, {
    lang: i.language === "FR" ? "fr" : "en", preview: subject, bodyHtml: textToHtml(i.bodyText), signatureLines: lines, footerLines: footer,
    unsubscribe: i.commercial && i.unsubscribeUrl ? { url: i.unsubscribeUrl, label: unsubLabel } : null, bookingCta: i.bookingCta ?? null,
  }));
  const text = [i.bodyText.trim(), "", "--", ...lines, "", ...footer, ...(i.commercial && i.unsubscribeUrl ? [`${unsubLabel}: ${i.unsubscribeUrl}`] : [])].join("\n");
  return { subject, text, html };
}

export function unsubscribeUrlFor(token: string): string {
  return `${getAppUrl()}/sales/unsubscribe/${encodeURIComponent(token)}`;
}

/** RFC 8058 one-click endpoint (POST) — a different URL from the human confirmation page. */
export function unsubscribeApiUrlFor(token: string): string {
  return `${getAppUrl()}/api/sales/unsubscribe/${encodeURIComponent(token)}`;
}

export function listUnsubscribeHeaders(url: string): Record<string, string> {
  return { "List-Unsubscribe": `<${assertSafeHeaderValue(url)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}
