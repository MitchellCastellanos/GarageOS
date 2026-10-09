// Automatic GarageOS-branded email signature — pure and isomorphic (used by the server renderer AND the live preview, so the
// preview is byte-for-byte what recipients get). Nothing here accepts HTML: every employee-controlled value is escaped,
// links are rebuilt from validated parts, and the layout is table-based with inline CSS and absolute HTTPS images.
import { escapeHtml } from "./html";
import { isValidEmail, normalizeEmail } from "./email";

export const SIGNATURE_COLORS = { navy: "#07182F", blue: "#1769FF", offWhite: "#F8FAFC", slate: "#475569" } as const;
/** Official navy single-colour lockup (mark + wordmark), 480×160, served from /public/brand. Not recreated. */
export const SIGNATURE_LOGO_PATH = "/brand/logo-monochrome-dark.png";
export const SIGNATURE_LOGO_SIZE = { width: 120, height: 40 } as const;

export interface SignatureInput {
  name: string | null | undefined;
  title?: string | null;
  email: string | null | undefined;
  phone?: string | null;
  websiteUrl?: string | null;
  bookingUrl?: string | null;
  /** Absolute HTTPS URL of the logo (see signatureLogoUrl). */
  logoUrl: string;
  language: "EN" | "FR";
}

export type SignatureField = "name" | "email";
export interface Signature { ok: boolean; missing: SignatureField[]; html: string; text: string; lines: string[] }

const L = {
  EN: { defaultTitle: "Sales Representative", book: "Book a demo", logoAlt: "GarageOS" },
  FR: { defaultTitle: "Représentant aux ventes", book: "Réserver une démo", logoAlt: "GarageOS" },
} as const;

const clean = (v: string | null | undefined, max: number) => (v ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** "Sales Representative — GarageOS" / "…| GarageOS" / "…" → "Sales Representative | GarageOS" (exactly one company suffix). */
export function formatTitle(title: string | null | undefined, language: "EN" | "FR"): string {
  const base = clean(title, 120).replace(/\s*[|—–-]\s*GarageOS\s*$/i, "").trim() || L[language].defaultTitle;
  return `${base} | GarageOS`;
}

function safeHttps(url: string | null | undefined): string | null {
  if (!url) return null;
  try { const u = new URL(url.trim()); return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null; } catch { return null; }
}
const hostLabel = (u: string) => u.replace(/^https?:\/\//i, "").replace(/\/$/, "");
/** tel: href from the digits the employee typed; null when it cannot be a phone number (the text is still shown). */
function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  return /^\+?\d{7,15}$/.test(digits) ? `tel:${digits}` : null;
}

export function buildSignature(i: SignatureInput): Signature {
  const lang = i.language === "FR" ? "FR" : "EN";
  const name = clean(i.name, 100);
  const emailRaw = normalizeEmail(clean(i.email, 254));
  const email = isValidEmail(emailRaw) ? emailRaw : "";
  const missing: SignatureField[] = [...(name ? [] : (["name"] as const)), ...(email ? [] : (["email"] as const))];
  const title = formatTitle(i.title, lang);
  const phone = clean(i.phone, 40);
  const site = safeHttps(i.websiteUrl);
  const book = safeHttps(i.bookingUrl);
  const logo = safeHttps(i.logoUrl) ?? "";

  const lines = [name, title, email, phone, site ? hostLabel(site) : "", book ? `${L[lang].book}: ${book}` : ""].filter(Boolean);
  const text = lines.join("\n");

  const C = SIGNATURE_COLORS;
  const font = "font-family:Arial,Helvetica,sans-serif;";
  const row = (inner: string, style = "") => `<tr><td style="${font}${style}">${inner}</td></tr>`;
  const link = (href: string, label: string) => `<a href="${escapeHtml(href)}" style="color:${C.blue};text-decoration:none;">${escapeHtml(label)}</a>`;
  const rows: string[] = [];
  if (name) rows.push(row(escapeHtml(name), `font-size:16px;line-height:22px;font-weight:bold;color:${C.navy};`));
  rows.push(row(`${escapeHtml(title.replace(/ \| GarageOS$/, ""))} | <span style="color:${C.blue};font-weight:bold;">GarageOS</span>`, `font-size:13px;line-height:20px;color:${C.slate};padding-bottom:6px;`));
  if (email) rows.push(row(link(`mailto:${email}`, email), "font-size:13px;line-height:20px;"));
  if (phone) { const h = telHref(phone); rows.push(row(h ? link(h, phone) : escapeHtml(phone), `font-size:13px;line-height:20px;color:${C.slate};`)); }
  if (site) rows.push(row(link(site, hostLabel(site)), "font-size:13px;line-height:20px;"));
  if (book) rows.push(row(link(book, L[lang].book), "font-size:13px;line-height:20px;font-weight:bold;"));
  if (logo) rows.push(row(`<a href="${escapeHtml(site ?? "https://www.garage-os.ca")}" style="text-decoration:none;"><img src="${escapeHtml(logo)}" alt="${L[lang].logoAlt}" width="${SIGNATURE_LOGO_SIZE.width}" height="${SIGNATURE_LOGO_SIZE.height}" style="display:block;border:0;outline:none;width:${SIGNATURE_LOGO_SIZE.width}px;height:${SIGNATURE_LOGO_SIZE.height}px;max-width:100%;" /></a>`, "padding-top:10px;"));

  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.offWhite}" style="border-collapse:collapse;background-color:${C.offWhite};margin:18px 0 0 0;"><tr><td width="3" bgcolor="${C.blue}" style="width:3px;background-color:${C.blue};font-size:0;line-height:0;">&nbsp;</td><td style="padding:12px 16px 12px 14px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows.join("")}</table></td></tr></table>`;
  return { ok: missing.length === 0, missing, html, text, lines };
}

/**
 * Removes a signature the author (or an old template/draft) already typed at the END of the body, so the generated one is
 * appended exactly once. Recognises: the generated text signature itself, a "-- " delimited block, and a final paragraph that
 * names the sender (email, or name together with GarageOS). Never touches text earlier in the message.
 */
export function stripTrailingSignature(body: string, who: { name: string; email: string; generatedText?: string }): string {
  let b = body.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  const email = who.email.toLowerCase();
  const name = who.name.trim().toLowerCase();
  if (who.generatedText) { const g = who.generatedText.trim(); if (g && b.endsWith(g)) b = b.slice(0, -g.length).replace(/\s*(?:\n--\s*)?$/, "").replace(/\s+$/, ""); }
  const delim = b.lastIndexOf("\n--");
  if (delim >= 0 && /^\n--[ \t]*(\n|$)/.test(b.slice(delim))) {
    const tail = b.slice(delim).toLowerCase();
    if ((email && tail.includes(email)) || (name && tail.includes(name))) b = b.slice(0, delim).replace(/\s+$/, "");
  }
  const parts = b.split(/\n{2,}/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1].toLowerCase();
    if (last.split("\n").length <= 8 && ((email && last.includes(email)) || (name && last.includes(name) && last.includes("garageos")))) parts.pop();
  }
  return parts.join("\n\n").replace(/\s+$/, "");
}
