import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import React from "react";
import { getInvoiceStrings, type InvoiceLanguage } from "@/lib/invoice-i18n";
import { getDefaultEmailLogoUrl } from "@/lib/app-url";

// TODO(garageos): Mecanico enviaba siempre al mismo correo de e-transfer de un
// solo taller. Aquí se usa el email general del taller como destino — antes
// de aceptar pagos reales hace falta un campo dedicado por taller.

export interface InvoiceEmailProps {
  clientName: string;
  shopName: string;
  shopPhone?: string | null;
  shopEmail?: string | null;
  shopAddress?: string | null;
  shopLogoUrl?: string | null;
  invoiceNumber: string;
  totalFormatted: string;
  vehicleDescription: string;
  dueDateFormatted?: string | null;
  language: InvoiceLanguage | string;
  isResend?: boolean;
  /** Link público de reservas del taller — se omite si el taller no tiene sitio de reservas. */
  bookingUrl?: string | null;
}

export function InvoiceEmail({
  clientName,
  shopName,
  shopPhone,
  shopEmail,
  shopAddress,
  shopLogoUrl,
  invoiceNumber,
  totalFormatted,
  vehicleDescription,
  dueDateFormatted,
  language,
  isResend = false,
  bookingUrl,
}: InvoiceEmailProps) {
  const t = getInvoiceStrings(language).mail;
  const previewText = isResend
    ? t.resendPreview(invoiceNumber, shopName)
    : t.preview(invoiceNumber, shopName);

  const signatureLogo = shopLogoUrl?.split("?")[0] || getDefaultEmailLogoUrl();

  return (
    <Html lang={(language as string).toLowerCase()}>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Heading style={styles.headerTitle}>
              {isResend ? t.resendSubject(invoiceNumber, shopName) : t.subject(invoiceNumber, shopName)}
            </Heading>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.greeting}>{t.greeting(clientName)}</Text>
            <Text style={styles.bodyText}>{isResend ? t.resendBody : t.body}</Text>
            <Text style={styles.attachmentNote}>{t.attachmentNote}</Text>

            <Section style={styles.card}>
              <Text style={styles.cardLabel}>{t.invoiceNumber}</Text>
              <Text style={styles.cardValue}>{invoiceNumber}</Text>

              <Hr style={styles.cardDivider} />

              <Text style={styles.cardLabel}>{t.vehicle}</Text>
              <Text style={styles.cardValue}>{vehicleDescription}</Text>

              {dueDateFormatted && (
                <>
                  <Hr style={styles.cardDivider} />
                  <Text style={styles.cardLabel}>{t.dueDate}</Text>
                  <Text style={styles.cardValue}>{dueDateFormatted}</Text>
                </>
              )}

              <Hr style={styles.cardDivider} />

              <Text style={styles.cardLabel}>{t.total}</Text>
              <Text style={styles.totalValue}>{totalFormatted}</Text>
            </Section>

            {shopEmail && (
              <Section style={styles.etransferBox}>
                <Text style={styles.etransferText}>{t.etransferNotice(shopEmail)}</Text>
              </Section>
            )}

            <Text style={styles.bodyText}>{t.contactPrompt}</Text>

            <Section style={styles.signature}>
              {signatureLogo && (
                <Img
                  src={signatureLogo}
                  alt={shopName}
                  width={140}
                  height={56}
                  style={styles.signatureLogo}
                />
              )}
              <Text style={styles.signatureShop}>{shopName}</Text>
              {shopAddress && <Text style={styles.signatureDetail}>{shopAddress}</Text>}
              {shopPhone && <Text style={styles.signatureDetail}>{shopPhone}</Text>}
              {shopEmail && <Text style={styles.signatureDetail}>{shopEmail}</Text>}
            </Section>
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
            <Text style={styles.poweredBy}>{t.poweredBy}</Text>
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
    padding: "28px 40px",
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: "18px",
    fontWeight: "700",
    margin: "0",
    lineHeight: "1.4",
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
  attachmentNote: {
    fontSize: "13px",
    color: "#64748b",
    margin: "0 0 24px 0",
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
    textTransform: "uppercase" as const,
  },
  cardValue: {
    fontSize: "15px",
    fontWeight: "600",
    color: "#0f172a",
    margin: "0",
  },
  totalValue: {
    fontSize: "22px",
    fontWeight: "700",
    color: "#2563eb",
    margin: "0",
  },
  cardDivider: {
    borderColor: "#e2e8f0",
    margin: "16px 0",
  },
  etransferBox: {
    backgroundColor: "#fffbeb",
    border: "1px solid #fcd34d",
    borderRadius: "8px",
    padding: "14px 20px",
    margin: "0 0 24px 0",
  },
  etransferText: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#92400e",
    lineHeight: "1.6",
    margin: "0",
  },
  signature: {
    borderTop: "1px solid #e2e8f0",
    paddingTop: "24px",
    marginTop: "8px",
  },
  signatureLogo: {
    display: "block",
    marginBottom: "12px",
    objectFit: "contain" as const,
  },
  signatureShop: {
    fontSize: "15px",
    fontWeight: "700",
    color: "#0f172a",
    margin: "0 0 6px 0",
  },
  signatureDetail: {
    fontSize: "13px",
    color: "#64748b",
    margin: "2px 0",
    lineHeight: "1.5",
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
    color: "#2563eb",
    fontWeight: "600",
    textDecoration: "underline",
  },
  footerText: {
    fontSize: "11px",
    color: "#94a3b8",
    lineHeight: "1.6",
    margin: "0 0 8px 0",
    textAlign: "center" as const,
  },
  poweredBy: {
    fontSize: "10px",
    color: "#cbd5e1",
    margin: "0",
    textAlign: "center" as const,
  },
};
