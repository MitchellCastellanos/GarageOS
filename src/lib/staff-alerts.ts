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
import { getStaffNotificationPreferences, type StaffEventKey } from "@/lib/staff-notify";
import { DEFAULT_STAFF_NOTIFICATION_PREFERENCE } from "@/lib/staff-notify-events";
import { groupEmailBatchByLanguage, planStaffAlertRecipients } from "@/domain/staff-notify";
import { publishStaffNotification } from "@/lib/staff-notify-realtime";

/**
 * Alertas internas al equipo del taller — eventos que el taller no disparó y
 * necesita saber (cita nueva desde la web, el cliente canceló desde su link,
 * el cliente aprobó/rechazó una cotización, uso/ciclo de vida de SMS). Dos
 * canales, decididos por cada usuario (ver src/lib/staff-notify.ts):
 *
 * - **App** (StaffNotification + campana en tiempo real): canal principal,
 *   activo por defecto. No depende de que el correo esté verificado.
 * - **Email** desde GarageOS (no desde el remitente del taller — no es un
 *   mensaje al cliente): refuerzo, también activo por defecto, apagable por
 *   evento. Exige correo verificado.
 *
 * Reemplaza al SMS que iba al teléfono público del taller y al CC en los
 * correos al cliente.
 *
 * Destinatarios: los OWNER del taller. Si ninguno tiene correo verificado, el
 * email cae al contacto efectivo del taller (sin preferencia asociada — no es
 * un usuario) y la app se queda sin nada que mostrar (no hay a quién).
 */

interface OwnerRecipient {
  userId: string;
  email: string;
  emailVerified: boolean;
  language: PlatformEmailLanguage;
}

async function resolveOwners(shopId: string): Promise<OwnerRecipient[]> {
  const owners = await db.user.findMany({
    where: { shopId, role: "OWNER" },
    select: { id: true, email: true, emailVerified: true, preferredLocale: true },
  });
  return owners.map((o) => ({
    userId: o.id,
    email: o.email,
    emailVerified: Boolean(o.emailVerified),
    language: o.preferredLocale === "FR" ? "FR" : "EN",
  }));
}

interface AlertContent {
  subject: string;
  heading: string;
  intro: string;
  details: { label: string; value: string }[];
  ctaLabel: string;
}

async function sendPlatformAlertEmail(
  to: string[],
  language: PlatformEmailLanguage,
  shopName: string,
  ctaUrl: string,
  content: AlertContent
): Promise<void> {
  try {
    await sendPlatformEmail(
      to,
      content.subject,
      React.createElement(StaffAlertEmail, {
        shopName,
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

/** Cuerpo corto para la campana — intro más el primer detalle (ej. nombre del cliente). */
function notificationBody(content: AlertContent): string {
  const firstDetail = content.details[0];
  return firstDetail ? `${content.intro} (${firstDetail.label}: ${firstDetail.value})` : content.intro;
}

async function sendStaffAlert(params: {
  shopId: string;
  shopName: string;
  event: StaffEventKey;
  ctaPath: string;
  build: (language: PlatformEmailLanguage) => AlertContent;
}): Promise<void> {
  const owners = await resolveOwners(params.shopId);
  const ctaUrl = `${getAppUrl()}${params.ctaPath}`;

  if (owners.length === 0) {
    // Ningún OWNER en el taller (no debería pasar) — email de último recurso,
    // sin preferencia asociada porque no hay un usuario al que atribuírsela.
    const fallback = await resolveEffectiveShopContactEmail(params.shopId);
    if (!fallback) return;
    const language = await resolveShopEmailLanguage(params.shopId);
    await sendPlatformAlertEmail([fallback], language, params.shopName, ctaUrl, params.build(language));
    return;
  }

  const preferenceRows = await Promise.all(
    owners.map(async (o) => [o.userId, await getStaffNotificationPreferences(o.userId)] as const)
  );
  const preferences = new Map(preferenceRows.map(([userId, prefs]) => [userId, prefs[params.event]]));
  const plan = planStaffAlertRecipients(owners, preferences, DEFAULT_STAFF_NOTIFICATION_PREFERENCE);

  for (const entry of plan) {
    if (!entry.createInApp) continue;
    const content = params.build(entry.language);
    try {
      const notification = await db.staffNotification.create({
        data: {
          shopId: params.shopId,
          userId: entry.userId,
          event: params.event,
          title: content.heading,
          body: notificationBody(content),
          href: params.ctaPath,
        },
      });
      await publishStaffNotification(entry.userId, {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        href: notification.href,
        createdAt: notification.createdAt.toISOString(),
      });
    } catch (err) {
      console.error(`[staff-alerts] no se pudo crear la notificación en la app (${params.event}):`, err);
    }
  }

  const emailBatch = groupEmailBatchByLanguage(owners, plan);
  for (const language of ["EN", "FR"] as const) {
    if (emailBatch[language].length === 0) continue;
    await sendPlatformAlertEmail(emailBatch[language], language, params.shopName, ctaUrl, params.build(language));
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
    event: "STAFF_NEW_WEB_BOOKING",
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
    event: "STAFF_CLIENT_CANCELLED_APPOINTMENT",
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
    event: "STAFF_QUOTE_DECIDED",
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
    event: "STAFF_SMS_USAGE",
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
    event: "STAFF_SMS_NUMBER_RELEASE_SCHEDULED",
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

/** GarageOS activó el número dedicado del taller (respuesta a su solicitud). */
export async function alertStaffSmsNumberActivated(input: { shopId: string; phoneNumber: string }): Promise<void> {
  const shop = await shopBasics(input.shopId);
  if (!shop) return;
  await sendStaffAlert({
    shopId: shop.id,
    shopName: shop.name,
    event: "STAFF_SMS_NUMBER_ACTIVATED",
    ctaPath: ADMIN.inbox,
    build: (language) =>
      language === "FR"
        ? {
            subject: `Votre numéro SMS est actif — ${shop.name}`,
            heading: "Numéro SMS activé",
            intro:
              "Vos avis SMS partent maintenant de votre propre numéro, et les réponses de vos clients arrivent dans votre boîte de réception.",
            details: [{ label: "Numéro", value: input.phoneNumber }],
            ctaLabel: "Ouvrir la boîte de réception",
          }
        : {
            subject: `Your SMS number is live — ${shop.name}`,
            heading: "SMS number activated",
            intro: "Your SMS notices now go out from your own number, and client replies arrive in your Inbox.",
            details: [{ label: "Number", value: input.phoneNumber }],
            ctaLabel: "Open the Inbox",
          },
  });
}
