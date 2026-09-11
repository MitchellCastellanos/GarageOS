// Template de email para recordatorios de servicio
// Usa @react-email/components — se renderiza en el servidor con Resend.
// NO es un componente del DOM — solo se usa en email.ts

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import React from "react";

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
}

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
}: ServiceReminderEmailProps) {
  const previewText = `Recordatorio: ${serviceType} para tu ${vehicleDescription}`;

  function fmtDate(d: Date): string {
    const months = [
      "enero", "febrero", "marzo", "abril", "mayo", "junio",
      "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ];
    return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
  }

  return (
    <Html lang="es">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Header */}
          <Section style={styles.header}>
            <Heading style={styles.shopName}>{shopName}</Heading>
            <Text style={styles.headerSubtitle}>Recordatorio de servicio</Text>
          </Section>

          {/* Greeting */}
          <Section style={styles.content}>
            <Text style={styles.greeting}>Hola, {clientName} 👋</Text>
            <Text style={styles.body_text}>
              Te recordamos que tu vehículo tiene un servicio próximo que requiere atención:
            </Text>

            {/* Service card */}
            <Section style={styles.card}>
              <Text style={styles.cardLabel}>TIPO DE SERVICIO</Text>
              <Text style={styles.cardValue}>{serviceType}</Text>

              <Hr style={styles.cardDivider} />

              <Row>
                <Text style={styles.cardLabel}>VEHÍCULO</Text>
                <Text style={styles.cardValue}>
                  {vehicleDescription}
                </Text>
                <Text style={styles.cardMeta}>Placa: {licensePlate}</Text>
              </Row>

              {dueDate && (
                <>
                  <Hr style={styles.cardDivider} />
                  <Text style={styles.cardLabel}>FECHA LÍMITE</Text>
                  <Text style={styles.cardValue}>{fmtDate(new Date(dueDate))}</Text>
                </>
              )}

              {dueMileage && (
                <>
                  <Hr style={styles.cardDivider} />
                  <Text style={styles.cardLabel}>KILOMETRAJE LÍMITE</Text>
                  <Text style={styles.cardValue}>
                    {dueMileage.toLocaleString()} {mileageUnit}
                  </Text>
                </>
              )}
            </Section>

            <Text style={styles.body_text}>
              Para agendar tu cita o si tienes alguna pregunta, contáctanos:
            </Text>

            {/* Contact */}
            <Section style={styles.contact}>
              <Text style={styles.contactShop}>{shopName}</Text>
              {shopPhone && (
                <Text style={styles.contactDetail}>📞 {shopPhone}</Text>
              )}
              {shopEmail && (
                <Text style={styles.contactDetail}>✉️ {shopEmail}</Text>
              )}
            </Section>
          </Section>

          {/* Footer */}
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              Este recordatorio fue enviado automáticamente por {shopName}.
              Si ya realizaste el servicio, puedes ignorar este mensaje.
            </Text>
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
    backgroundColor: "#1d4ed8",
    padding: "32px 40px",
  },
  shopName: {
    color: "#ffffff",
    fontSize: "22px",
    fontWeight: "700",
    margin: "0 0 4px 0",
  },
  headerSubtitle: {
    color: "#bfdbfe",
    fontSize: "13px",
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
  body_text: {
    fontSize: "14px",
    color: "#475569",
    lineHeight: "1.6",
    margin: "0 0 20px 0",
  },
  card: {
    backgroundColor: "#f8fafc",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    padding: "20px 24px",
    margin: "0 0 24px 0",
  },
  cardLabel: {
    fontSize: "10px",
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: "0.8px",
    margin: "0 0 4px 0",
  },
  cardValue: {
    fontSize: "16px",
    fontWeight: "600",
    color: "#0f172a",
    margin: "0",
  },
  cardMeta: {
    fontSize: "12px",
    color: "#64748b",
    margin: "4px 0 0 0",
  },
  cardDivider: {
    borderColor: "#e2e8f0",
    margin: "16px 0",
  },
  contact: {
    backgroundColor: "#eff6ff",
    borderRadius: "8px",
    padding: "16px 20px",
  },
  contactShop: {
    fontSize: "14px",
    fontWeight: "600",
    color: "#1d4ed8",
    margin: "0 0 6px 0",
  },
  contactDetail: {
    fontSize: "13px",
    color: "#475569",
    margin: "2px 0",
  },
  footer: {
    backgroundColor: "#f8fafc",
    borderTop: "1px solid #e2e8f0",
    padding: "20px 40px",
  },
  footerText: {
    fontSize: "11px",
    color: "#94a3b8",
    lineHeight: "1.6",
    margin: "0",
    textAlign: "center" as const,
  },
};
