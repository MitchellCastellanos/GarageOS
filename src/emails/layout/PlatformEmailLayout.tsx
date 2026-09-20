// Layout para correos que GarageOS le manda a un taller sobre su propia
// cuenta (cambio de plan, cancelación) — a diferencia de ShopEmailLayout,
// el remitente/marca visible es GarageOS, no el taller. Ver
// docs/super-admin-todo.md: esta es la relación comercial GarageOS↔taller,
// nunca la del taller con sus propios clientes.

import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";
import React from "react";
import { APP_NAME } from "@/config/app";

export interface PlatformEmailLayoutProps {
  /** Código de idioma para el atributo lang del <html> (ej. "en", "fr") — ver resolveShopEmailLanguage. */
  lang?: string;
  previewText: string;
  headerSubtitle: string;
  footerText: string;
  children: React.ReactNode;
}

const HEADER_COLOR = "#0f172a";

export function PlatformEmailLayout({ lang = "en", previewText, headerSubtitle, footerText, children }: PlatformEmailLayoutProps) {
  return (
    <Html lang={lang}>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Heading style={styles.appName}>{APP_NAME}</Heading>
            <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
          </Section>
          <Section style={styles.content}>{children}</Section>
          <Section style={styles.footer}>
            <Text style={styles.footerText}>{footerText}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const platformEmailContentStyles = {
  bodyText: { fontSize: "14px", color: "#334155", lineHeight: "1.6", margin: "0 0 16px 0" },
  card: {
    backgroundColor: "#f8fafc",
    borderRadius: "8px",
    border: "1px solid #e2e8f0",
    padding: "18px 22px",
    margin: "0 0 20px 0",
  },
  cardLabel: {
    fontSize: "10px",
    fontWeight: "700" as const,
    color: "#94a3b8",
    letterSpacing: "0.8px",
    margin: "0 0 4px 0",
    textTransform: "uppercase" as const,
  },
  cardValue: { fontSize: "15px", fontWeight: "600" as const, color: "#0f172a", margin: "0" },
};

const styles = {
  body: {
    backgroundColor: "#f1f5f9",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    margin: "0",
    padding: "20px 0",
  },
  container: { backgroundColor: "#ffffff", borderRadius: "12px", maxWidth: "560px", margin: "0 auto", overflow: "hidden" },
  header: { backgroundColor: HEADER_COLOR, padding: "28px 40px" },
  appName: { color: "#ffffff", fontSize: "20px", fontWeight: "700", margin: "0 0 4px 0" },
  headerSubtitle: { color: "#cbd5e1", fontSize: "14px", margin: "0" },
  content: { padding: "32px 40px" },
  footer: { backgroundColor: "#f8fafc", borderTop: "1px solid #e2e8f0", padding: "16px 40px" },
  footerText: { fontSize: "11px", color: "#94a3b8", lineHeight: "1.6", margin: "0", textAlign: "center" as const },
};
