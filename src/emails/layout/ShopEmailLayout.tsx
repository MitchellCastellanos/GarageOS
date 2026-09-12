// Layout compartido para todos los emails transaccionales de GarageOS —
// centraliza header/footer/"Powered by GarageOS" (ver docs/communications-platform.md
// §5). Cada template aporta solo su contenido único como children; el encabezado
// (nombre del taller + subtítulo) y el pie (link de reservas, aviso legal/firma del
// taller, atribución de plataforma) quedan consistentes entre todos.

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import React from "react";

export interface ShopEmailLayoutProps {
  /** Código de idioma para el atributo lang del <html> (ej. "es", "en", "fr"). */
  lang: string;
  previewText: string;
  shopName: string;
  headerSubtitle: React.ReactNode;
  footerText: string;
  /** "Powered by GarageOS" — visible por defecto; se apaga solo para correos internos (no al cliente). */
  showPoweredBy?: boolean;
  poweredByText?: string;
  bookingUrl?: string | null;
  bookingLabel?: string;
  /** Solo para campañas (doc §12.1/§12.3) — el layout lo renderiza siempre que se pase, así el cuerpo de una campaña nunca puede quitarlo. */
  unsubscribeUrl?: string | null;
  children: React.ReactNode;
}

const DEFAULT_POWERED_BY = "Enviado con GarageOS";
/** Color de encabezado único — antes cada template usaba el suyo (teal, azul, navy). */
const HEADER_COLOR = "#1d4ed8";

export function ShopEmailLayout({
  lang,
  previewText,
  shopName,
  headerSubtitle,
  footerText,
  showPoweredBy = true,
  poweredByText = DEFAULT_POWERED_BY,
  bookingUrl,
  bookingLabel,
  unsubscribeUrl,
  children,
}: ShopEmailLayoutProps) {
  return (
    <Html lang={lang}>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Heading style={styles.shopName}>{shopName}</Heading>
            <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
          </Section>

          <Section style={styles.content}>{children}</Section>

          <Section style={styles.footer}>
            {bookingUrl && (
              <Text style={styles.bookingText}>
                {bookingLabel}{" "}
                <Link href={bookingUrl} style={styles.bookingLink}>
                  {bookingUrl}
                </Link>
              </Text>
            )}
            <Text style={styles.footerText}>{footerText}</Text>
            {unsubscribeUrl && (
              <Text style={styles.footerText}>
                <Link href={unsubscribeUrl} style={styles.bookingLink}>
                  Darme de baja de estos correos
                </Link>
              </Text>
            )}
            {showPoweredBy && <Text style={styles.poweredBy}>{poweredByText}</Text>}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const emailContentStyles = {
  greeting: {
    fontSize: "18px",
    fontWeight: "600" as const,
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
    backgroundColor: "#f8fafc",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    padding: "20px 24px",
    margin: "0 0 24px 0",
  },
  cardLabel: {
    fontSize: "10px",
    fontWeight: "700" as const,
    color: "#94a3b8",
    letterSpacing: "0.8px",
    margin: "0 0 4px 0",
    textTransform: "uppercase" as const,
  },
  cardValue: {
    fontSize: "15px",
    fontWeight: "600" as const,
    color: "#0f172a",
    margin: "0",
  },
  cardDivider: {
    borderColor: "#e2e8f0",
    margin: "16px 0",
  },
};

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
    backgroundColor: HEADER_COLOR,
    padding: "28px 40px",
  },
  shopName: {
    color: "#ffffff",
    fontSize: "20px",
    fontWeight: "700",
    margin: "0 0 4px 0",
  },
  headerSubtitle: {
    color: "#bfdbfe",
    fontSize: "14px",
    margin: "0",
  },
  content: {
    padding: "32px 40px",
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
    color: HEADER_COLOR,
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
