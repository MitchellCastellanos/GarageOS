import { Button, Hr, Section, Text } from "@react-email/components";
import React from "react";
import { ShopEmailLayout } from "@/emails/layout/ShopEmailLayout";

export type AppointmentEmailType = "confirmation" | "update" | "reminder" | "cancellation";
export type AppointmentEmailLanguage = "EN" | "FR";

export interface AppointmentEmailProps {
  type: AppointmentEmailType;
  clientName: string;
  shopName: string;
  title: string;
  startsAtFormatted: string;
  shopPhone?: string | null;
  shopEmail?: string | null;
  /** Preferred customer language. English is the fallback. */
  language?: AppointmentEmailLanguage | string | null;
  manageUrl?: string | null;
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
  poweredBy: string;
}

const STRINGS: Record<AppointmentEmailLanguage, LanguageStrings> = {
  EN: {
    htmlLang: "en",
    copy: {
      confirmation: {
        preview: (title, shop) => `Appointment confirmed: ${title} — ${shop}`,
        heading: "Appointment confirmed",
        body: "Your appointment has been booked. We'll see you at the date and time below.",
      },
      update: {
        preview: (title, shop) => `Appointment updated: ${title} — ${shop}`,
        heading: "Appointment updated",
        body: "Your appointment has been changed. Here are the updated details.",
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
    poweredBy: "Sent with GarageOS",
  },
  FR: {
    htmlLang: "fr",
    copy: {
      confirmation: {
        preview: (title, shop) => `Rendez-vous confirmé : ${title} — ${shop}`,
        heading: "Rendez-vous confirmé",
        body: "Votre rendez-vous a été enregistré. Nous vous attendons à la date et l'heure indiquées.",
      },
      update: {
        preview: (title, shop) => `Rendez-vous modifié : ${title} — ${shop}`,
        heading: "Rendez-vous modifié",
        body: "Votre rendez-vous a été modifié. Voici les nouveaux détails.",
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
    poweredBy: "Envoyé avec GarageOS",
  },
};

function resolveLanguage(language?: string | null): AppointmentEmailLanguage {
  return language === "FR" ? "FR" : "EN";
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
    <ShopEmailLayout
      lang={t.htmlLang}
      previewText={copy.preview(title, shopName)}
      shopName={shopName}
      headerSubtitle={copy.heading}
      footerText={t.footer(shopName)}
      poweredByText={t.poweredBy}
      bookingUrl={bookingUrl}
      bookingLabel={t.bookOnlineLabel}
    >
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
    </ShopEmailLayout>
  );
}

const styles = {
  greeting: { fontSize: "18px", fontWeight: "600", color: "#0f172a", margin: "0 0 12px 0" },
  bodyText: { fontSize: "14px", color: "#475569", lineHeight: "1.6", margin: "0 0 16px 0" },
  card: { backgroundColor: "#f0fdfa", borderRadius: "8px", border: "1px solid #99f6e4", padding: "20px 24px", margin: "0 0 24px 0" },
  cardLabel: { fontSize: "10px", fontWeight: "700", color: "#0d9488", letterSpacing: "0.8px", margin: "0 0 4px 0" },
  cardValue: { fontSize: "15px", fontWeight: "600", color: "#0f172a", margin: "0" },
  cardDivider: { borderColor: "#ccfbf1", margin: "16px 0" },
  manageSection: { textAlign: "center" as const, margin: "0 0 24px 0" },
  manageButton: { backgroundColor: "#0f766e", borderRadius: "8px", color: "#ffffff", fontSize: "14px", fontWeight: "600", textDecoration: "none", padding: "12px 24px" },
  contactDetail: { fontSize: "14px", color: "#0f766e", fontWeight: "600", margin: "4px 0" },
};
