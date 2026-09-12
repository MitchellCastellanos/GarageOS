import { Text } from "@react-email/components";
import { ShopEmailLayout } from "@/emails/layout/ShopEmailLayout";

export interface PlainMessageEmailProps {
  shopName: string;
  bodyText: string;
  headerSubtitle?: string;
  signatureName?: string | null;
  signatureTitle?: string | null;
  footerText: string;
  poweredByText?: string;
  showPoweredBy?: boolean;
  lang?: string;
}

/**
 * Template compartido para correo humano de texto libre (Inbox, Contact Us) — el
 * cuerpo lo escribe una persona, no un template de producto; el branding/firma/pie
 * viene de ShopEmailLayout igual que en los correos transaccionales.
 */
export function PlainMessageEmail({
  shopName,
  bodyText,
  headerSubtitle = "Mensaje",
  signatureName,
  signatureTitle,
  footerText,
  poweredByText,
  showPoweredBy = true,
  lang = "es",
}: PlainMessageEmailProps) {
  return (
    <ShopEmailLayout
      lang={lang}
      previewText={bodyText.slice(0, 120)}
      shopName={shopName}
      headerSubtitle={headerSubtitle}
      footerText={footerText}
      poweredByText={poweredByText}
      showPoweredBy={showPoweredBy}
    >
      {bodyText.split("\n").map((line, i) => (
        <Text key={i} style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#334155" }}>
          {line || " "}
        </Text>
      ))}
      {(signatureName || signatureTitle) && (
        <Text style={{ marginTop: "24px", fontSize: "14px", color: "#0f172a" }}>
          {signatureName}
          {signatureName && signatureTitle ? <br /> : null}
          {signatureTitle}
        </Text>
      )}
    </ShopEmailLayout>
  );
}
