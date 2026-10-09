import "server-only";
import { render } from "@react-email/render";
import React from "react";
import { SalesEmail } from "@/emails/SalesEmail";
import { assertSafeHeaderValue, cleanSubject } from "@/domain/sales-comms/email";
import { textToHtml } from "@/domain/sales-comms/html";
import { getAppUrl } from "@/config/app";
import { db } from "@/lib/db";
import { buildSignature, stripTrailingSignature, SIGNATURE_LOGO_PATH, type Signature } from "@/domain/sales-comms/signature";
import { DEFAULT_OUTREACH_VIDEO_KEY } from "@/domain/platform-video";
import { getPublishedVideo } from "@/lib/platform-video";
import { bookingUrl, ensureGeneralLink } from "@/lib/sales-comms/booking-links";

export interface IdentityFacts { staffId: string; fromName: string; fromEmail: string; jobTitle: string | null; phone: string | null }
export interface SettingsFacts { legalName: string; mailingAddress: string | null; contactEmail: string | null; contactPhone: string | null; websiteUrl: string }

/** Absolute HTTPS URL of the official logo (public/brand). NEXT_PUBLIC_APP_URL must be the https production origin. */
export function signatureLogoUrl(): string { return `${getAppUrl()}${SIGNATURE_LOGO_PATH}`; }

/**
 * The signature of one sender, generated from their profile — never typed by hand. Sender-identity fields win, the staff
 * profile fills the gaps (so nothing is entered twice), the website comes from the global settings, and the optional demo link
 * is the seller's own general booking link when online booking is on.
 * SNAPSHOT POLICY: a message captures its signature when its body is rendered — for a composed email that is the moment the
 * seller presses Send/Schedule (what they previewed is what is sent, even if scheduled for later); for a sequence step it is
 * the moment that step is generated (just before dispatch, so profile edits between steps are picked up); meeting notices are
 * rendered at send time. A sent message's stored body is never rewritten.
 */
export async function resolveSignature(id: IdentityFacts, s: SettingsFacts, lang: "EN" | "FR"): Promise<Signature> {
  const staff = await db.platformSalesStaff.findUnique({ where: { id: id.staffId }, select: { title: true, phone: true, bookingEnabled: true, userId: true } });
  const bookingUrl = staff?.bookingEnabled ? bookingUrl_(await ensureGeneralLink(id.staffId, staff.userId)) : null;
  return buildSignature({ name: id.fromName, title: id.jobTitle || staff?.title, email: id.fromEmail, phone: id.phone || staff?.phone, websiteUrl: s.websiteUrl, bookingUrl, logoUrl: signatureLogoUrl(), language: lang });
}
const bookingUrl_ = (link: { token: string }) => bookingUrl(link.token);

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
  const sig = await resolveSignature(i.identity, i.settings, i.language);
  // Exactly one signature: drop any the draft/template/author already put at the end before appending the generated one.
  const bodyText = stripTrailingSignature(i.bodyText, { name: i.identity.fromName, email: i.identity.fromEmail, generatedText: sig.text });
  // A PUBLISHED outreach video that the body actually links gets a linked thumbnail block (only with a real https thumbnail).
  const pv = i.commercial ? await getPublishedVideo(DEFAULT_OUTREACH_VIDEO_KEY, i.language, "outreach") : null;
  const video = pv?.thumbnailUrl && bodyText.includes(pv.url) ? { url: pv.url, title: pv.title, thumbnailUrl: pv.thumbnailUrl, label: i.language === "FR" ? "Regarder la vidéo" : "Watch the video" } : null;
  const footer = footerLinesFor(i.settings, i.language, i.commercial);
  const unsubLabel = i.language === "FR" ? "Se désabonner" : "Unsubscribe";
  if (i.commercial && !i.unsubscribeUrl) throw new Error("UNSUBSCRIBE_URL_REQUIRED");
  const html = await render(React.createElement(SalesEmail, {
    lang: i.language === "FR" ? "fr" : "en", preview: subject, bodyHtml: textToHtml(bodyText), signatureHtml: sig.html, footerLines: footer,
    unsubscribe: i.commercial && i.unsubscribeUrl ? { url: i.unsubscribeUrl, label: unsubLabel } : null, bookingCta: i.bookingCta ?? null, video,
  }));
  const text = [bodyText.trim(), "", "--", sig.text, "", ...footer, ...(i.commercial && i.unsubscribeUrl ? [`${unsubLabel}: ${i.unsubscribeUrl}`] : [])].join("\n");
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
