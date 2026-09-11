import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import React from "react";

export type AppointmentEmailType = "confirmation" | "reminder" | "cancellation";
export type AppointmentEmailLanguage = "ES" | "EN" | "FR";

export interface AppointmentEmailProps {
  type: AppointmentEmailType;
  clientName: string;
  shopName: string;
  title: string;
  startsAtFormatted: string;
  shopPhone?: string | null;
  shopEmail?: string | null;
  /** Idioma preferido del cliente — por defecto español. */
  language?: AppointmentEmailLanguage | string | null;
  /** Link público para que el cliente confirme o cancele esta cita (sin login). */
  manageUrl?: string | null;
  /** Link público de reservas del taller — se omite si el taller no tiene sitio de reservas. */
  bookingUrl?: string | null;
}

type TypeCopy = { preview: (title: string, shop: string) => string; heading: string; body: string };

interface LanguageStrings {
  htmlLang: string;
  copy: Record<AppointmentEmailType, TypeCopy>;
  greeting: (name: string) => string;
  serviceLabel: string;
  dateTimeLabel: string;
  manageButton: string;
  contactPrompt: string;
  bookOnlineLabel: string;
  footer: (shop: string) => string;
}

const STRINGS: Record<AppointmentEmailLanguage, LanguageStrings> = {
  ES: {
    htmlLang: "es",
    copy: {
      confirmation: {
        preview: (title, shop) => `Cita confirmada: ${title} — ${shop}`,
        heading: "Cita confirmada",
        body: "Tu cita ha sido registrada. Te esperamos en la fecha y hora indicadas.",
      },
      reminder: {
        preview: (title, shop) => `Recordatorio de cita: ${title} — ${shop}`,
        heading: "Recordatorio de cita",
        body: "Te recordamos que tienes una cita próxima en nuestro taller.",
      },
      cancellation: {
        preview: (title, shop) => `Cita cancelada: ${title} — ${shop}`,
        heading: "Cita cancelada",
        body: "Tu cita ha sido cancelada. Si deseas reprogramar, contáctanos.",
      },
    },
    greeting: (name) => `Hola, ${name}`,
    serviceLabel: "SERVICIO",
    dateTimeLabel: "FECHA Y HORA",
    manageButton: "Confirmar o cancelar mi cita",
    contactPrompt: "Para cambios o consultas, contáctanos:",
    bookOnlineLabel: "¿Necesitas otra cita? Resérvala en línea:",
    footer: (shop) => `Este correo fue enviado por ${shop}.`,
  },
  EN: {
    htmlLang: "en",
    copy: {
      confirmation: {
        preview: (title, shop) => `Appointment confirmed: ${title} — ${shop}`,
        heading: "Appointment confirmed",
        body: "Your appointment has been booked. We'll see you at the date and time below.",
      },
      reminder: {
        preview: (title, shop) => `Appointment reminder: ${title} — ${shop}`,
        heading: "Appointment reminder",
        body: "This is a reminder that you have an upcoming appointment at our shop.",
      },
      cancellation: {
        preview: (title, shop) => `Appointment cancelled: ${title} — ${shop}`,
        heading: "Appointment cancelled",
        body: "Your appointment has been cancelled. Contact us if you'd like to reschedule.",
      },
    },
    greeting: (name) => `Hello, ${name}`,
    serviceLabel: "SERVICE",
    dateTimeLabel: "DATE AND TIME",
    manageButton: "Confirm or cancel my appointment",
    contactPrompt: "For changes or questions, contact us:",
    bookOnlineLabel: "Need another appointment? Book online:",
    footer: (shop) => `This email was sent by ${shop}.`,
  },
  FR: {
    htmlLang: "fr",
    copy: {
      confirmation: {
        preview: (title, shop) => `Rendez-vous confirmé : ${title} — ${shop}`,
        heading: "Rendez-vous confirmé",
        body: "Votre rendez-vous a été enregistré. Nous vous attendons à la date et l'heure indiquées.",
      },
      reminder: {
        preview: (title, shop) => `Rappel de rendez-vous : ${title} — ${shop}`,
        heading: "Rappel de rendez-vous",
        body: "Nous vous rappelons que vous avez un rendez-vous prochainement dans notre atelier.",
      },
      cancellation: {
        preview: (title, shop) => `Rendez-vous annulé : ${title} — ${shop}`,
        heading: "Rendez-vous annulé",
        body: "Votre rendez-vous a été annulé. Contactez-nous si vous souhaitez le reprogrammer.",
      },
    },
    greeting: (name) => `Bonjour, ${name}`,
    serviceLabel: "SERVICE",
    dateTimeLabel: "DATE ET HEURE",
    manageButton: "Confirmer ou annuler mon rendez-vous",
    contactPrompt: "Pour tout changement ou question, contactez-nous :",
    bookOnlineLabel: "Besoin d'un autre rendez-vous ? Réservez en ligne :",
    footer: (shop) => `Ce courriel a été envoyé par ${shop}.`,
  },
};

function resolveLanguage(language?: string | null): AppointmentEmailLanguage {
  return language === "EN" || language === "FR" ? language : "ES";
}

export function AppointmentEmail({
  type,
  clientName,
  shopName,
  title,
  startsAtFormatted,
  shopPhone,
  shopEmail,
  language,
  manageUrl,
  bookingUrl,
}: AppointmentEmailProps) {
  const t = STRINGS[resolveLanguage(language)];
  const copy = t.copy[type];
  const showManageButton = type !== "cancellation" && Boolean(manageUrl);

  return (
    <Html lang={t.htmlLang}>
      <Head />
      <Preview>{copy.preview(title, shopName)}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Heading style={styles.shopName}>{shopName}</Heading>
            <Text style={styles.headerSubtitle}>{copy.heading}</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.greeting}>{t.greeting(clientName)}</Text>
            <Text style={styles.bodyText}>{copy.body}</Text>

            <Section style={styles.card}>
              <Text style={styles.cardLabel}>{t.serviceLabel}</Text>
              <Text style={styles.cardValue}>{title}</Text>

              <Hr style={styles.cardDivider} />

              <Text style={styles.cardLabel}>{t.dateTimeLabel}</Text>
              <Text style={styles.cardValue}>{startsAtFormatted}</Text>
            </Section>

            {showManageButton && (
              <Section style={styles.manageSection}>
                <Button style={styles.manageButton} href={manageUrl!}>
                  {t.manageButton}
                </Button>
              </Section>
            )}

            <Text style={styles.bodyText}>{t.contactPrompt}</Text>
            {shopPhone && <Text style={styles.contactDetail}>{shopPhone}</Text>}
            {shopEmail && <Text style={styles.contactDetail}>{shopEmail}</Text>}
          </Section>

          <Section style={styles.footer}>
            {bookingUrl && (
              <Text style={styles.bookingText}>
                {t.bookOnlineLabel}{" "}
                <Link href={bookingUrl} style={styles.bookingLink}>
                  {bookingUrl}
                </Link>
              </Text>
            )}
            <Text style={styles.footerText}>{t.footer(shopName)}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: "#f1f5f9",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    margin: "0",
    padding: "20px 0",
  },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    maxWidth: "560px",
    margin: "0 auto",
    overflow: "hidden",
  },
  header: {
    backgroundColor: "#0f766e",
    padding: "28px 40px",
  },
  shopName: {
    color: "#ffffff",
    fontSize: "20px",
    fontWeight: "700",
    margin: "0 0 4px 0",
  },
  headerSubtitle: {
    color: "#99f6e4",
    fontSize: "14px",
    margin: "0",
  },
  content: {
    padding: "32px 40px",
  },
  greeting: {
    fontSize: "18px",
    fontWeight: "600",
    color: "#0f172a",
    margin: "0 0 12px 0",
  },
  bodyText: {
    fontSize: "14px",
    color: "#475569",
    lineHeight: "1.6",
    margin: "0 0 16px 0",
  },
  card: {
    backgroundColor: "#f0fdfa",
    borderRadius: "8px",
    border: "1px solid #99f6e4",
    padding: "20px 24px",
    margin: "0 0 24px 0",
  },
  cardLabel: {
    fontSize: "10px",
    fontWeight: "700",
    color: "#0d9488",
    letterSpacing: "0.8px",
    margin: "0 0 4px 0",
  },
  cardValue: {
    fontSize: "15px",
    fontWeight: "600",
    color: "#0f172a",
    margin: "0",
  },
  cardDivider: {
    borderColor: "#ccfbf1",
    margin: "16px 0",
  },
  manageSection: {
    textAlign: "center" as const,
    margin: "0 0 24px 0",
  },
  manageButton: {
    backgroundColor: "#0f766e",
    borderRadius: "8px",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "600",
    textDecoration: "none",
    padding: "12px 24px",
  },
  contactDetail: {
    fontSize: "14px",
    color: "#0f766e",
    fontWeight: "600",
    margin: "4px 0",
  },
  footer: {
    backgroundColor: "#f8fafc",
    borderTop: "1px solid #e2e8f0",
    padding: "20px 40px",
  },
  bookingText: {
    fontSize: "12px",
    color: "#64748b",
    lineHeight: "1.6",
    margin: "0 0 12px 0",
    textAlign: "center" as const,
  },
  bookingLink: {
    color: "#0f766e",
    fontWeight: "600",
    textDecoration: "underline",
  },
  footerText: {
    fontSize: "11px",
    color: "#94a3b8",
    textAlign: "center" as const,
    margin: "0",
  },
};
