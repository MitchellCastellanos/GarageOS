import { Hr, Row, Section, Text } from "@react-email/components";
import React from "react";
import { ShopEmailLayout } from "@/emails/layout/ShopEmailLayout";

interface ServiceReminderEmailProps {
  clientName: string;
  vehicleDescription: string;
  licensePlate: string;
  serviceType: string;
  dueDate?: Date | null;
  dueMileage?: number | null;
  mileageUnit: string;
  shopName: string;
  shopPhone?: string | null;
  shopEmail?: string | null;
  language?: string | null;
}

const COPY = {
  EN: {
    locale: "en-CA",
    lang: "en",
    preview: (service: string, vehicle: string) => `Reminder: ${service} for your ${vehicle}`,
    subtitle: "Service reminder",
    footer: (shop: string) => `This reminder was sent automatically by ${shop}. If the service has already been completed, you can ignore this message.`,
    greeting: (name: string) => `Hello, ${name} 👋`,
    intro: "Your vehicle has an upcoming service that may need attention:",
    service: "SERVICE TYPE",
    vehicle: "VEHICLE",
    plate: "Plate",
    dueDate: "DUE DATE",
    dueMileage: "DUE MILEAGE",
    contact: "To book an appointment or if you have any questions, contact us:",
  },
  FR: {
    locale: "fr-CA",
    lang: "fr",
    preview: (service: string, vehicle: string) => `Rappel : ${service} pour votre ${vehicle}`,
    subtitle: "Rappel d'entretien",
    footer: (shop: string) => `Ce rappel a été envoyé automatiquement par ${shop}. Si l'entretien a déjà été effectué, vous pouvez ignorer ce message.`,
    greeting: (name: string) => `Bonjour, ${name} 👋`,
    intro: "Votre véhicule a un entretien à venir qui pourrait nécessiter votre attention :",
    service: "TYPE DE SERVICE",
    vehicle: "VÉHICULE",
    plate: "Plaque",
    dueDate: "DATE D'ÉCHÉANCE",
    dueMileage: "KILOMÉTRAGE D'ÉCHÉANCE",
    contact: "Pour prendre rendez-vous ou si vous avez des questions, contactez-nous :",
  },
} as const;

export function ServiceReminderEmail({
  clientName,
  vehicleDescription,
  licensePlate,
  serviceType,
  dueDate,
  dueMileage,
  mileageUnit,
  shopName,
  shopPhone,
  shopEmail,
  language,
}: ServiceReminderEmailProps) {
  const t = language === "FR" ? COPY.FR : COPY.EN;
  const previewText = t.preview(serviceType, vehicleDescription);

  function fmtDate(d: Date): string {
    return new Intl.DateTimeFormat(t.locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
  }

  return (
    <ShopEmailLayout
      lang={t.lang}
      previewText={previewText}
      shopName={shopName}
      headerSubtitle={t.subtitle}
      footerText={t.footer(shopName)}
    >
      <Text style={styles.greeting}>{t.greeting(clientName)}</Text>
      <Text style={styles.body_text}>{t.intro}</Text>

      <Section style={styles.card}>
        <Text style={styles.cardLabel}>{t.service}</Text>
        <Text style={styles.cardValue}>{serviceType}</Text>

        <Hr style={styles.cardDivider} />

        <Row>
          <Text style={styles.cardLabel}>{t.vehicle}</Text>
          <Text style={styles.cardValue}>{vehicleDescription}</Text>
          <Text style={styles.cardMeta}>{t.plate}: {licensePlate}</Text>
        </Row>

        {dueDate && (
          <>
            <Hr style={styles.cardDivider} />
            <Text style={styles.cardLabel}>{t.dueDate}</Text>
            <Text style={styles.cardValue}>{fmtDate(new Date(dueDate))}</Text>
          </>
        )}

        {dueMileage && (
          <>
            <Hr style={styles.cardDivider} />
            <Text style={styles.cardLabel}>{t.dueMileage}</Text>
            <Text style={styles.cardValue}>
              {dueMileage.toLocaleString(t.locale)} {mileageUnit}
            </Text>
          </>
        )}
      </Section>

      <Text style={styles.body_text}>{t.contact}</Text>

      <Section style={styles.contact}>
        <Text style={styles.contactShop}>{shopName}</Text>
        {shopPhone && <Text style={styles.contactDetail}>📞 {shopPhone}</Text>}
        {shopEmail && <Text style={styles.contactDetail}>✉️ {shopEmail}</Text>}
      </Section>
    </ShopEmailLayout>
  );
}

const styles = {
  greeting: { fontSize: "18px", fontWeight: "600", color: "#0f172a", margin: "0 0 12px 0" },
  body_text: { fontSize: "14px", color: "#475569", lineHeight: "1.6", margin: "0 0 20px 0" },
  card: { backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", padding: "20px 24px", margin: "0 0 24px 0" },
  cardLabel: { fontSize: "10px", fontWeight: "700", color: "#94a3b8", letterSpacing: "0.8px", margin: "0 0 4px 0" },
  cardValue: { fontSize: "16px", fontWeight: "600", color: "#0f172a", margin: "0" },
  cardMeta: { fontSize: "12px", color: "#64748b", margin: "4px 0 0 0" },
  cardDivider: { borderColor: "#e2e8f0", margin: "16px 0" },
  contact: { backgroundColor: "#eff6ff", borderRadius: "8px", padding: "16px 20px" },
  contactShop: { fontSize: "14px", fontWeight: "600", color: "#1d4ed8", margin: "0 0 6px 0" },
  contactDetail: { fontSize: "13px", color: "#475569", margin: "2px 0" },
};
