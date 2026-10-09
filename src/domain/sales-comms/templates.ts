// Approved email templates — pure. Built-in defaults are "version 0" and apply when Super Admin has not approved a
// database version for a (key, language). Placeholders are `{{name}}`; unknown or empty required ones BLOCK the send
// (never "Hello ,"). Signature, branding and the CASL footer are appended by the renderer, not by templates.
import type { CrmLanguage } from "@prisma/client";

export const TEMPLATE_KEYS = [
  "INTRODUCTION", "FOLLOW_UP_1", "DEMO_INVITATION", "POST_DEMO_FOLLOW_UP", "PRICING_FOLLOW_UP", "CLOSING_FOLLOW_UP",
  "MEETING_CONFIRMATION", "MEETING_REMINDER", "MEETING_RESCHEDULED", "MEETING_CANCELLED",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
export type TemplateLanguage = Exclude<CrmLanguage, "UNKNOWN">;

export const COMMERCIAL_TEMPLATE_KEYS: readonly TemplateKey[] = ["INTRODUCTION", "FOLLOW_UP_1", "DEMO_INVITATION", "POST_DEMO_FOLLOW_UP", "PRICING_FOLLOW_UP", "CLOSING_FOLLOW_UP"];
export const MEETING_TEMPLATE_KEYS: readonly TemplateKey[] = ["MEETING_CONFIRMATION", "MEETING_REMINDER", "MEETING_RESCHEDULED", "MEETING_CANCELLED"];

export const KNOWN_VARIABLES = [
  "greeting", "prospect.name", "seller.name", "seller.title", "booking.link",
  "meeting.when", "meeting.duration", "meeting.type", "meeting.location", "meeting.manageLink", "meeting.attendee",
] as const;
export type TemplateVariable = (typeof KNOWN_VARIABLES)[number];
export type TemplateVars = Partial<Record<TemplateVariable, string>>;

export interface BuiltinTemplate { key: TemplateKey; language: TemplateLanguage; subject: string; body: string; required: TemplateVariable[] }

const T = (key: TemplateKey, language: TemplateLanguage, subject: string, body: string, required: TemplateVariable[] = []): BuiltinTemplate => ({ key, language, subject, body, required });

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  T("INTRODUCTION", "EN", "Running {{prospect.name}} with less paperwork",
`{{greeting}}

I'm {{seller.name}} from GarageOS. We build shop-management software for independent auto repair shops — appointments, work orders, inspections, invoices and customer reminders in one place.

I'm reaching out to {{prospect.name}} because shops like yours often tell us that scheduling and follow-ups eat the time they would rather spend in the bay. If that sounds familiar, I'd be glad to show you what GarageOS does in a short call.

Would a quick conversation be useful? You can pick a time that suits you here: {{booking.link}}

If this isn't relevant, just let me know and I won't write again.`, ["booking.link"]),
  T("INTRODUCTION", "FR", "Moins de paperasse chez {{prospect.name}}",
`{{greeting}}

Je m'appelle {{seller.name}} et je travaille chez GarageOS. Nous offrons un logiciel de gestion pour les garages indépendants : rendez-vous, bons de travail, inspections, factures et rappels aux clients au même endroit.

Je vous écris au sujet de {{prospect.name}}, car plusieurs garages nous disent que la planification et les suivis leur prennent un temps qu'ils préféreraient passer à l'atelier. Si cela vous ressemble, je serais heureux de vous présenter GarageOS lors d'un court appel.

Une courte conversation vous intéresserait-elle? Vous pouvez choisir le moment qui vous convient ici : {{booking.link}}

Si ce n'est pas pertinent, dites-le-moi simplement et je ne vous écrirai plus.`, ["booking.link"]),

  T("FOLLOW_UP_1", "EN", "Following up — GarageOS for {{prospect.name}}",
`{{greeting}}

I wanted to follow up on my earlier note. In short, GarageOS helps independent shops book appointments online, track every vehicle through the shop, and send clients their quotes, invoices and reminders without re-typing anything.

If you'd like to see it with your own workflow in mind, here is my calendar: {{booking.link}}

Either way, thank you for your time.`, ["booking.link"]),
  T("FOLLOW_UP_1", "FR", "Suivi — GarageOS pour {{prospect.name}}",
`{{greeting}}

Je me permets de faire un suivi à mon message précédent. En bref, GarageOS aide les garages indépendants à prendre des rendez-vous en ligne, à suivre chaque véhicule dans l'atelier et à envoyer devis, factures et rappels aux clients sans tout ressaisir.

Si vous souhaitez le voir en fonction de votre façon de travailler, voici mon calendrier : {{booking.link}}

Merci de votre temps, quoi qu'il en soit.`, ["booking.link"]),

  T("DEMO_INVITATION", "EN", "A 30-minute GarageOS demo for {{prospect.name}}?",
`{{greeting}}

I'd like to invite you to a short, personalized GarageOS demo for {{prospect.name}}. I'll focus on what matters most to your shop — no generic slideshow.

Pick any time that works for you: {{booking.link}}

You'll receive a confirmation and a calendar invitation right away.`, ["booking.link"]),
  T("DEMO_INVITATION", "FR", "Une démo GarageOS de 30 minutes pour {{prospect.name}}?",
`{{greeting}}

J'aimerais vous inviter à une courte démonstration personnalisée de GarageOS pour {{prospect.name}}. Je me concentrerai sur ce qui compte le plus pour votre garage — pas de présentation générique.

Choisissez le moment qui vous convient : {{booking.link}}

Vous recevrez immédiatement une confirmation et une invitation à votre calendrier.`, ["booking.link"]),

  T("POST_DEMO_FOLLOW_UP", "EN", "Thank you — next steps for {{prospect.name}}",
`{{greeting}}

Thank you for taking the time to see GarageOS. I enjoyed learning how {{prospect.name}} runs its day-to-day.

If you have questions, or would like to look at anything again with your team, reply to this email or book another short call: {{booking.link}}

I'm happy to help with whatever you need to decide.`, ["booking.link"]),
  T("POST_DEMO_FOLLOW_UP", "FR", "Merci — prochaines étapes pour {{prospect.name}}",
`{{greeting}}

Merci d'avoir pris le temps de découvrir GarageOS. J'ai apprécié en apprendre davantage sur le quotidien de {{prospect.name}}.

Si vous avez des questions, ou si vous souhaitez revoir certains points avec votre équipe, répondez à ce courriel ou réservez un autre court appel : {{booking.link}}

Je suis là pour vous aider à prendre votre décision.`, ["booking.link"]),

  T("PRICING_FOLLOW_UP", "EN", "GarageOS pricing for {{prospect.name}}",
`{{greeting}}

As promised, here is a follow-up on pricing. GarageOS plans are monthly with no long-term contract, and the right plan depends on the size of your team and the features you use.

You can review the plans at https://www.garage-os.ca, or we can go through them together in a short call: {{booking.link}}

Let me know what would help you decide.`, ["booking.link"]),
  T("PRICING_FOLLOW_UP", "FR", "Tarification GarageOS pour {{prospect.name}}",
`{{greeting}}

Comme promis, voici un suivi au sujet de la tarification. Les forfaits GarageOS sont mensuels, sans contrat à long terme, et le bon forfait dépend de la taille de votre équipe et des fonctions que vous utilisez.

Vous pouvez consulter les forfaits sur https://www.garage-os.ca, ou nous pouvons les passer en revue ensemble lors d'un court appel : {{booking.link}}

Dites-moi ce qui vous aiderait à décider.`, ["booking.link"]),

  T("CLOSING_FOLLOW_UP", "EN", "Should I close the loop, {{prospect.name}}?",
`{{greeting}}

I've reached out a few times and haven't wanted to crowd your inbox, so this will be my last note for now.

If improving scheduling and customer follow-ups is not a priority right now, no problem at all. If it becomes one, you can reach me by replying here or book a time: {{booking.link}}

Wishing {{prospect.name}} a great season.`, ["booking.link"]),
  T("CLOSING_FOLLOW_UP", "FR", "Dois-je clore le dossier, {{prospect.name}}?",
`{{greeting}}

Je vous ai écrit à quelques reprises et je ne veux pas encombrer votre boîte de réception; ce sera donc mon dernier message pour l'instant.

Si l'amélioration de la planification et des suivis aux clients n'est pas une priorité en ce moment, aucun problème. Si elle le devient, vous pouvez me répondre ici ou réserver un moment : {{booking.link}}

Je souhaite à {{prospect.name}} une excellente saison.`, ["booking.link"]),

  T("MEETING_CONFIRMATION", "EN", "Confirmed: your GarageOS demo on {{meeting.when}}",
`{{greeting}}

Your meeting with {{seller.name}} is confirmed.

When: {{meeting.when}}
Duration: {{meeting.duration}}
Format: {{meeting.type}}
{{meeting.location}}

A calendar invitation is attached. Need to change it? Reschedule or cancel here: {{meeting.manageLink}}`, ["meeting.when", "meeting.manageLink"]),
  T("MEETING_CONFIRMATION", "FR", "Confirmé : votre démo GarageOS le {{meeting.when}}",
`{{greeting}}

Votre rencontre avec {{seller.name}} est confirmée.

Quand : {{meeting.when}}
Durée : {{meeting.duration}}
Format : {{meeting.type}}
{{meeting.location}}

Une invitation de calendrier est jointe. Besoin de modifier? Reportez ou annulez ici : {{meeting.manageLink}}`, ["meeting.when", "meeting.manageLink"]),

  T("MEETING_REMINDER", "EN", "Reminder: GarageOS demo on {{meeting.when}}",
`{{greeting}}

This is a reminder of your meeting with {{seller.name}}.

When: {{meeting.when}}
Duration: {{meeting.duration}}
Format: {{meeting.type}}
{{meeting.location}}

Can't make it? Reschedule or cancel here: {{meeting.manageLink}}`, ["meeting.when", "meeting.manageLink"]),
  T("MEETING_REMINDER", "FR", "Rappel : démo GarageOS le {{meeting.when}}",
`{{greeting}}

Voici un rappel de votre rencontre avec {{seller.name}}.

Quand : {{meeting.when}}
Durée : {{meeting.duration}}
Format : {{meeting.type}}
{{meeting.location}}

Vous ne pouvez pas y être? Reportez ou annulez ici : {{meeting.manageLink}}`, ["meeting.when", "meeting.manageLink"]),

  T("MEETING_RESCHEDULED", "EN", "Rescheduled: your GarageOS demo is now {{meeting.when}}",
`{{greeting}}

Your meeting with {{seller.name}} has been rescheduled.

New time: {{meeting.when}}
Duration: {{meeting.duration}}
Format: {{meeting.type}}
{{meeting.location}}

An updated calendar invitation is attached. Change it again here: {{meeting.manageLink}}`, ["meeting.when", "meeting.manageLink"]),
  T("MEETING_RESCHEDULED", "FR", "Reporté : votre démo GarageOS a maintenant lieu le {{meeting.when}}",
`{{greeting}}

Votre rencontre avec {{seller.name}} a été reportée.

Nouvelle heure : {{meeting.when}}
Durée : {{meeting.duration}}
Format : {{meeting.type}}
{{meeting.location}}

Une invitation de calendrier mise à jour est jointe. Modifiez-la de nouveau ici : {{meeting.manageLink}}`, ["meeting.when", "meeting.manageLink"]),

  T("MEETING_CANCELLED", "EN", "Cancelled: GarageOS demo on {{meeting.when}}",
`{{greeting}}

Your meeting with {{seller.name}} on {{meeting.when}} has been cancelled.

If you'd still like to talk, you can book a new time whenever it suits you: {{booking.link}}`, ["meeting.when"]),
  T("MEETING_CANCELLED", "FR", "Annulé : démo GarageOS du {{meeting.when}}",
`{{greeting}}

Votre rencontre avec {{seller.name}} prévue le {{meeting.when}} a été annulée.

Si vous souhaitez tout de même discuter, vous pouvez réserver un nouveau moment quand cela vous convient : {{booking.link}}`, ["meeting.when"]),
];

export function builtinTemplate(key: TemplateKey, language: TemplateLanguage): BuiltinTemplate | null {
  return BUILTIN_TEMPLATES.find((t) => t.key === key && t.language === language) ?? null;
}

export function isTemplateKey(v: string): v is TemplateKey { return (TEMPLATE_KEYS as readonly string[]).includes(v); }

export function categoryOfTemplate(key: TemplateKey): "COMMERCIAL" | "TRANSACTIONAL" {
  return (MEETING_TEMPLATE_KEYS as readonly string[]).includes(key) ? "TRANSACTIONAL" : "COMMERCIAL";
}

const VAR_RE = /\{\{\s*([a-zA-Z.]+)\s*\}\}/g;

export function extractVariables(text: string): string[] {
  return [...new Set([...text.matchAll(VAR_RE)].map((m) => m[1]))];
}

export function unknownVariables(text: string): string[] {
  return extractVariables(text).filter((v) => !(KNOWN_VARIABLES as readonly string[]).includes(v));
}

export interface RenderedTemplate { subject: string; body: string; missing: string[] }

/**
 * Substitutes variables. A variable that is referenced but has no non-empty value is reported in `missing` and
 * replaced by nothing — the caller MUST refuse to send when `missing` is non-empty. Values are inserted verbatim
 * (they are escaped later when the body becomes HTML) and have control characters stripped from the subject.
 */
export function renderTemplate(subject: string, body: string, vars: TemplateVars): RenderedTemplate {
  const missing = new Set<string>();
  const fill = (s: string, oneLine: boolean) => s.replace(VAR_RE, (_m, name: string) => {
    const v = (vars as Record<string, string | undefined>)[name];
    if (!v || !v.trim()) { if (name !== "meeting.location" && name !== "booking.link") missing.add(name); else if (name === "booking.link") missing.add(name); return ""; }
    return oneLine ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim() : v;
  });
  const out = { subject: fill(subject, true), body: fill(body, false), missing: [...missing] };
  // Collapse the blank line left by an empty optional variable (e.g. meeting.location when no real link exists).
  out.body = out.body.replace(/\n{3,}/g, "\n\n");
  return out;
}

export function greetingFor(language: TemplateLanguage, firstName: string | null | undefined): string {
  const n = firstName?.trim();
  if (language === "FR") return n ? `Bonjour ${n},` : "Bonjour,";
  return n ? `Hi ${n},` : "Hello,";
}
