import { Hr, Img, Section, Text } from "@react-email/components";
import React from "react";
import { getInvoiceStrings, type InvoiceLanguage } from "@/lib/invoice-i18n";
import { getDefaultEmailLogoUrl } from "@/lib/app-url";
import { ShopEmailLayout } from "@/emails/layout/ShopEmailLayout";

export interface QuoteEmailProps {
  clientName: string;
  shopName: string;
  shopPhone?: string | null;
  shopEmail?: string | null;
  shopAddress?: string | null;
  shopLogoUrl?: string | null;
  quoteNumber: string;
  totalFormatted: string;
  vehicleDescription: string;
  validUntilFormatted?: string | null;
  language: InvoiceLanguage | string;
  isResend?: boolean;
  /** Link público de reservas del taller — se omite si el taller no tiene sitio de reservas. */
  bookingUrl?: string | null;
}

function quoteSubject(num: string, shop: string, lang: InvoiceLanguage | string, isResend: boolean) {
  const l = (lang ?? "ES") as InvoiceLanguage;
  if (l === "EN") {
    return isResend ? `Resend: Quote ${num} — ${shop}` : `Quote ${num} — ${shop}`;
  }
  if (l === "FR") {
    return isResend ? `Renvoi : Soumission ${num} — ${shop}` : `Soumission ${num} — ${shop}`;
  }
  return isResend ? `Reenvío: Cotización ${num} — ${shop}` : `Cotización ${num} — ${shop}`;
}

export function QuoteEmail({
  clientName,
  shopName,
  shopPhone,
  shopEmail,
  shopAddress,
  shopLogoUrl,
  quoteNumber,
  totalFormatted,
  vehicleDescription,
  validUntilFormatted,
  language,
  isResend = false,
  bookingUrl,
}: QuoteEmailProps) {
  const t = getInvoiceStrings(language).mail;
  const previewText = quoteSubject(quoteNumber, shopName, language, isResend);
  const signatureLogo = shopLogoUrl?.split("?")[0] || getDefaultEmailLogoUrl();

  const bodyText =
    language === "EN"
      ? isResend
        ? "We are resending the attached quote in case you did not receive it or need another copy."
        : "Please find attached our quote for services on your vehicle. Contact us if you have any questions."
      : language === "FR"
        ? isResend
          ? "Nous vous renvoyons la soumission ci-jointe au cas où vous ne l'auriez pas reçue."
          : "Veuillez trouver ci-joint notre soumission pour les services sur votre véhicule. Contactez-nous pour toute question."
        : isResend
          ? "Te reenviamos la cotización adjunta por si no la recibiste o necesitas una copia."
          : "Adjuntamos nuestra cotización por los servicios en tu vehículo. Si tienes alguna pregunta, contáctanos.";

  const attachmentNote =
    language === "EN"
      ? "The PDF quote is attached to this email."
      : language === "FR"
        ? "La soumission PDF est jointe à ce courriel."
        : "La cotización en PDF va adjunta a este correo.";

  const contactPrompt =
    language === "EN"
      ? "For questions about this quote:"
      : language === "FR"
        ? "Pour toute question concernant cette soumission :"
        : "Para consultas sobre esta cotización:";

  return (
    <ShopEmailLayout
      lang={(language as string).toLowerCase()}
      previewText={previewText}
      shopName={shopName}
      headerSubtitle={quoteSubject(quoteNumber, shopName, language, isResend)}
      footerText={t.footer(shopName)}
      poweredByText={t.poweredBy}
      bookingUrl={bookingUrl}
      bookingLabel={t.bookOnlineLabel}
    >
      <Text style={styles.greeting}>{t.greeting(clientName)}</Text>
      <Text style={styles.bodyText}>{bodyText}</Text>
      <Text style={styles.attachmentNote}>{attachmentNote}</Text>

      <Section style={styles.card}>
        <Text style={styles.cardLabel}>{getInvoiceStrings(language).quoteNo.toUpperCase()}</Text>
        <Text style={styles.cardValue}>{quoteNumber}</Text>

        <Hr style={styles.cardDivider} />

        <Text style={styles.cardLabel}>{t.vehicle}</Text>
        <Text style={styles.cardValue}>{vehicleDescription}</Text>

        {validUntilFormatted && (
          <>
            <Hr style={styles.cardDivider} />
            <Text style={styles.cardLabel}>{getInvoiceStrings(language).validUntil}</Text>
            <Text style={styles.cardValue}>{validUntilFormatted}</Text>
          </>
        )}

        <Hr style={styles.cardDivider} />

        <Text style={styles.cardLabel}>{t.total}</Text>
        <Text style={styles.totalValue}>{totalFormatted}</Text>
      </Section>

      <Text style={styles.bodyText}>{contactPrompt}</Text>

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
    </ShopEmailLayout>
  );
}

const styles = {
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
};
