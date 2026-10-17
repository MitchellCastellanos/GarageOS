import "server-only";
import type { CrmLanguage } from "@prisma/client";
import { db } from "@/lib/db";
import { videoVars } from "@/lib/platform-video";
import { templateVideoLink } from "@/lib/sales-video";
import { videoCtaText } from "@/domain/platform-video";
import { builtinTemplate, categoryOfTemplate, greetingFor, renderTemplate, type TemplateKey, type TemplateLanguage, type TemplateVars } from "@/domain/sales-comms/templates";

export interface ResolvedTemplate { key: TemplateKey; language: TemplateLanguage; version: number; subject: string; body: string; category: "COMMERCIAL" | "TRANSACTIONAL"; source: "approved" | "builtin" }

/** Highest ACTIVE approved version, else the built-in default (version 0). */
export async function resolveTemplate(key: TemplateKey, language: TemplateLanguage): Promise<ResolvedTemplate> {
  const row = await db.crmEmailTemplate.findFirst({ where: { key, language, active: true }, orderBy: { version: "desc" } });
  if (row) return { key, language, version: row.version, subject: row.subject, body: row.bodyText, category: categoryOfTemplate(key), source: "approved" };
  const b = builtinTemplate(key, language);
  if (!b) throw new Error("TEMPLATE_NOT_FOUND");
  return { key, language, version: 0, subject: b.subject, body: b.body, category: categoryOfTemplate(key), source: "builtin" };
}

/**
 * Stand-in contact names the CRM stores when only an address is known (a discovered business e-mail accepted by a reviewer). They are not a person's name: a greeting must
 * never read "Hi Business," / "Bonjour General,". Matching is on the WHOLE normalised name, so a real person called "General" is unaffected by "General contact".
 */
const PLACEHOLDER_CONTACT_NAMES = new Set([
  "business contact", "general contact", "contact", "info", "information", "sales", "service", "support", "office", "reception", "admin", "team", "staff", "owner",
  "contact general", "contact général", "contact d'affaires", "contact commercial", "bureau", "equipe", "équipe", "proprietaire", "propriétaire", "garage",
]);
export const isPlaceholderContactName = (full: string | null | undefined): boolean => PLACEHOLDER_CONTACT_NAMES.has((full ?? "").trim().toLowerCase().replace(/\s+/g, " "));

export function firstNameOf(full: string | null | undefined): string | null {
  if (isPlaceholderContactName(full)) return null;
  const t = full?.trim().split(/\s+/)[0];
  return t || null;
}

export function toTemplateLanguage(l: CrmLanguage | null | undefined): TemplateLanguage | null {
  return l === "FR" || l === "EN" ? l : null;
}

export function baseVars(args: { language: TemplateLanguage; contactName: string | null; prospectName: string; sellerName: string; sellerTitle: string | null; bookingUrl: string | null }): TemplateVars {
  return {
    greeting: greetingFor(args.language, firstNameOf(args.contactName)),
    "prospect.name": args.prospectName,
    "seller.name": args.sellerName,
    "seller.title": args.sellerTitle ?? undefined,
    "booking.link": args.bookingUrl ?? undefined,
  };
}

/** Adds the PUBLISHED outreach video variables for the message language (nothing when unpublished — never a placeholder). */
export async function withVideoVars(vars: TemplateVars, language: TemplateLanguage, ctx?: { staffId: string; userId: string; prospectId: string; contactId: string | null }): Promise<TemplateVars> {
  // With a recipient context the link is the attributed landing page of the 60-second commercial (the CRM can then tell who watched).
  if (ctx) {
    const v = await templateVideoLink({ ...ctx, language });
    if (v) return { ...vars, "video.link": v.url, "video.title": v.title, "video.cta": videoCtaText(language, v.title, v.url) };
  }
  return { ...vars, ...(await videoVars(language)) };
}

export async function renderResolved(t: ResolvedTemplate, vars: TemplateVars) {
  return renderTemplate(t.subject, t.body, vars);
}
