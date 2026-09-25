import "server-only";
import React from "react";
import { db } from "@/lib/db";
import { ADMIN } from "@/lib/routes";
import { getAppUrl } from "@/config/app";
import { formatShopDateTime } from "@/lib/shop-timezone";
import { formatClientName } from "@/lib/client-name";
import { sendPlatformEmail } from "@/lib/platform/notify";
import { resolveEffectiveShopContactEmail } from "@/lib/communications/sender-identity";
import { resolveShopEmailLanguage, type PlatformEmailLanguage } from "@/lib/platform/locale";
import { StaffAlertEmail } from "@/emails/StaffAlertEmail";

/**
 * Alertas internas al equipo del taller — eventos que el taller no disparó y
 * necesita saber (cita nueva desde la web, el cliente canceló desde su link,
 * el cliente aprobó/rechazó una cotización). Canal: email desde GarageOS (no
 * desde el remitente del taller — no es un mensaje al cliente). Reemplaza al
 * SMS que iba al teléfono público del taller y al CC en los correos al
 * cliente. El centro de notificaciones en la app (Fase 3) se alimentará de los
 * mismos puntos de disparo.
 *
 * Destinatarios: los OWNER con correo confirmado; si ninguno califica, el
 * contacto efectivo del taller (resolveEffectiveShopContactEmail). Cada uno
 * recibe el correo en su propio idioma.
 */

interface Recipient {
  email: string;
  language: PlatformEmailLanguage;
}

async function resolveStaffAlertRecipients(shopId: string): Promise<Recipient[]> {
  const owners = await db.user.findMany({
    where: { shopId, role: "OWNER", emailVerified: { not: null } },
    select: { email: true, preferredLocale: true },
  });
  if (owners.length > 0) {
    return owners.map((o) => ({ email: o.email, language: o.preferredLocale === "FR" ? "FR" : "EN" }));
  }

  const fallback = await resolveEffectiveShopContactEmail(shopId);
  if (!fallback) return [];
  return [{ email: fallback, language: await resolveShopEmailLanguage(shopId) }];
}

interface AlertContent {
  subject: string;
  heading: string;
  intro: string;
  details: { label: string; value: string }[];
  ctaLabel: string;
}

async function sendStaffAlert(params: {
  shopId: string;
  shopName: string;
  ctaPath: string;
  build: (language: PlatformEmailLanguage) => AlertContent;
}): Promise<void> {
  const recipients = await resolveStaffAlertRecipients(params.shopId);
  const ctaUrl = `${getAppUrl()}${params.ctaPath}`;

  for (const language of ["EN", "FR"] as const) {
    const to = recipients.filter((r) => r.language === language).map((r) => r.email);
    if (to.length === 0) continue;
    const content = params.build(language);
    try {
      await sendPlatformEmail(
        to,
        content.subject,
        React.createElement(StaffAlertEmail, {
          shopName: params.shopName,
          heading: content.heading,
          intro: content.intro,
          details: content.details,
          ctaUrl,
          ctaLabel: content.ctaLabel,
          language,
        })
      );
    } catch (err) {
      console.error(`[staff-alerts] "${content.subject}" falló:`, err);
    }
  }
}

interface AppointmentAlertInput {
  shop: { id: string; name: string; timezone: string };
  client: { firstName: string; lastName?: string | null; phone: string | null; email: string | null };
  title: string;
  startsAt: Date;
}

const LABELS = {
  EN: { client: "Client", service: "Service", when: "Date and time", contact: "Contact", quote: "Quote", decision: "Decision", signedBy: "Signed by" },
  FR: { client: "Client", service: "Service", when: "Date et heure", contact: "Coordonnées", quote: "Soumission", decision: "Décision", signedBy: "Signé par" },
} as const;

function appointmentDetails(input: AppointmentAlertInput, language: PlatformEmailLanguage) {
  const l = LABELS[language];
  const contact = [input.client.phone, input.client.email].filter(Boolean).join(" · ");
  return [
    { label: l.client, value: formatClientName(input.client) },
    { label: l.service, value: input.title },
    { label: l.when, value: formatShopDateTime(input.startsAt, input.shop.timezone) },
    ...(contact ? [{ label: l.contact, value: contact }] : []),
  ];
}

export async function alertStaffNewWebAppointment(input: AppointmentAlertInput): Promise<void> {
  await sendStaffAlert({
    shopId: input.shop.id,
    shopName: input.shop.name,
    ctaPath: ADMIN.appointments,
    build: (language) =>
      language === "FR"
        ? {
            subject: `Nouveau rendez-vous en ligne — ${formatClientName(input.client)}`,
            heading: "Nouveau rendez-vous en ligne",
            intro: "Un client vient de réserver depuis votre page de réservation. La confirmation lui a déjà été envoyée.",
            details: appointmentDetails(input, language),
            ctaLabel: "Voir l'agenda",
          }
        : {
            subject: `New online booking — ${formatClientName(input.client)}`,
            heading: "New online booking",
            intro: "A client just booked from your booking page. Their confirmation has already been sent.",
            details: appointmentDetails(input, language),
            ctaLabel: "Open the calendar",
          },
  });
}

export async function alertStaffClientCancelledAppointment(input: AppointmentAlertInput): Promise<void> {
  await sendStaffAlert({
    shopId: input.shop.id,
    shopName: input.shop.name,
    ctaPath: ADMIN.appointments,
    build: (language) =>
      language === "FR"
        ? {
            subject: `Rendez-vous annulé par le client — ${formatClientName(input.client)}`,
            heading: "Rendez-vous annulé par le client",
            intro: "Le client a annulé son rendez-vous depuis son lien. La plage est de nouveau libre.",
            details: appointmentDetails(input, language),
            ctaLabel: "Voir l'agenda",
          }
        : {
            subject: `Appointment cancelled by client — ${formatClientName(input.client)}`,
            heading: "Appointment cancelled by client",
            intro: "The client cancelled their appointment from their link. The slot is free again.",
            details: appointmentDetails(input, language),
            ctaLabel: "Open the calendar",
          },
  });
}

export async function alertStaffQuoteDecided(input: {
  shop: { id: string; name: string };
  quoteId: string;
  quoteNumber: string;
  clientName: string;
  decision: "ACCEPTED" | "REJECTED";
  actorName: string;
}): Promise<void> {
  const accepted = input.decision === "ACCEPTED";
  await sendStaffAlert({
    shopId: input.shop.id,
    shopName: input.shop.name,
    ctaPath: `${ADMIN.quotes}/${input.quoteId}`,
    build: (language) => {
      const l = LABELS[language];
      const details = [
        { label: l.quote, value: input.quoteNumber },
        { label: l.client, value: input.clientName },
        { label: l.signedBy, value: input.actorName },
      ];
      return language === "FR"
        ? {
            subject: `Soumission ${input.quoteNumber} ${accepted ? "acceptée" : "refusée"} — ${input.clientName}`,
            heading: accepted ? "Soumission acceptée" : "Soumission refusée",
            intro: accepted
              ? "Le client a accepté la soumission en ligne. Vous pouvez planifier le travail."
              : "Le client a refusé la soumission en ligne.",
            details,
            ctaLabel: "Voir la soumission",
          }
        : {
            subject: `Quote ${input.quoteNumber} ${accepted ? "accepted" : "declined"} — ${input.clientName}`,
            heading: accepted ? "Quote accepted" : "Quote declined",
            intro: accepted
              ? "The client accepted the quote online. You can schedule the work."
              : "The client declined the quote online.",
            details,
            ctaLabel: "Open the quote",
          };
    },
  });
}

async function shopBasics(shopId: string): Promise<{ id: string; name: string } | null> {
  return db.shop.findUnique({ where: { id: shopId }, select: { id: true, name: true } });
}

/** 80 % / 100 % del cupo mensual de SMS (una vez por umbral y por mes, ver checkSmsUsageAlerts). */
export async function alertStaffSmsUsage(input: {
  shopId: string;
  level: 80 | 100;
  used: number;
  allowance: number;
}): Promise<void> {
  const shop = await shopBasics(input.shopId);
  if (!shop) return;
  const full = input.level === 100;
  const usage = `${input.used} / ${input.allowance}`;
  await sendStaffAlert({
    shopId: shop.id,
    shopName: shop.name,
    ctaPath: `${ADMIN.settings}?tab=notifications`,
    build: (language) =>
      language === "FR"
        ? {
            subject: full
              ? `Forfait SMS du mois épuisé — ${shop.name}`
              : `80 % du forfait SMS du mois utilisé — ${shop.name}`,
            heading: full ? "Forfait SMS épuisé" : "Forfait SMS presque épuisé",
            intro: full
              ? "Les avis automatiques (confirmations, rappels, véhicule prêt) partent maintenant par courriel jusqu'au mois prochain. Vos clients sont toujours avisés."
              : "Vous avez utilisé 80 % de vos SMS du mois. Une fois le forfait épuisé, les avis automatiques partiront par courriel.",
            details: [{ label: "Segments SMS", value: usage }],
            ctaLabel: "Voir l'utilisation",
          }
        : {
            subject: full ? `Monthly SMS allowance used up — ${shop.name}` : `80% of monthly SMS allowance used — ${shop.name}`,
            heading: full ? "SMS allowance used up" : "SMS allowance almost used up",
            intro: full
              ? "Automatic notices (confirmations, reminders, vehicle ready) now go out by email until next month. Your clients are still notified."
              : "You've used 80% of this month's SMS. Once it runs out, automatic notices will go out by email instead.",
            details: [{ label: "SMS segments", value: usage }],
            ctaLabel: "View usage",
          },
  });
}

/** El número dedicado se liberará (suscripción sin pagar) — da tiempo a regularizar. */
export async function alertStaffSmsNumberReleaseScheduled(input: {
  shopId: string;
  phoneNumber: string;
  releaseAt: Date;
}): Promise<void> {
  const shop = await shopBasics(input.shopId);
  if (!shop) return;
  await sendStaffAlert({
    shopId: shop.id,
    shopName: shop.name,
    ctaPath: `${ADMIN.settings}?tab=billing`,
    build: (language) => {
      const date = input.releaseAt.toLocaleDateString(language === "FR" ? "fr-CA" : "en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      return language === "FR"
        ? {
            subject: `Votre numéro SMS sera libéré le ${date} — ${shop.name}`,
            heading: "Numéro SMS bientôt libéré",
            intro:
              "Votre abonnement n'est plus actif. Votre numéro SMS dédié continue de fonctionner jusqu'à la date ci-dessous; réactivez l'abonnement pour le conserver.",
            details: [
              { label: "Numéro", value: input.phoneNumber },
              { label: "Date de libération", value: date },
            ],
            ctaLabel: "Gérer l'abonnement",
          }
        : {
            subject: `Your SMS number will be released on ${date} — ${shop.name}`,
            heading: "SMS number release scheduled",
            intro:
              "Your subscription is no longer active. Your dedicated SMS number keeps working until the date below; reactivate your subscription to keep it.",
            details: [
              { label: "Number", value: input.phoneNumber },
              { label: "Release date", value: date },
            ],
            ctaLabel: "Manage subscription",
          };
    },
  });
}
