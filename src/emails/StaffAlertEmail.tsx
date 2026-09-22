import { Link, Text } from "@react-email/components";
import React from "react";
import { PlatformEmailLayout, platformEmailContentStyles as s } from "@/emails/layout/PlatformEmailLayout";
import type { PlatformEmailLanguage } from "@/lib/platform/locale";

export interface StaffAlertEmailProps {
  shopName: string;
  heading: string;
  intro: string;
  details: { label: string; value: string }[];
  ctaUrl: string;
  ctaLabel: string;
  language?: PlatformEmailLanguage;
}

const FOOTER: Record<PlatformEmailLanguage, (shop: string) => string> = {
  EN: (shop) => `Internal GarageOS alert for ${shop}. It was not sent to your client.`,
  FR: (shop) => `Alerte interne GarageOS pour ${shop}. Elle n'a pas été envoyée à votre client.`,
};

/** Alerta interna al equipo del taller (nueva cita web, cancelación del cliente, cotización decidida). */
export function StaffAlertEmail({ shopName, heading, intro, details, ctaUrl, ctaLabel, language }: StaffAlertEmailProps) {
  const lang: PlatformEmailLanguage = language === "FR" ? "FR" : "EN";

  return (
    <PlatformEmailLayout
      lang={lang.toLowerCase()}
      previewText={`${heading} — ${shopName}`}
      headerSubtitle={heading}
      footerText={FOOTER[lang](shopName)}
    >
      <Text style={s.bodyText}>{intro}</Text>
      <div style={s.card}>
        {details.map((d, i) => (
          <React.Fragment key={d.label}>
            <Text style={i === 0 ? s.cardLabel : { ...s.cardLabel, marginTop: "12px" }}>{d.label}</Text>
            <Text style={s.cardValue}>{d.value}</Text>
          </React.Fragment>
        ))}
      </div>
      <Text style={s.bodyText}>
        <Link href={ctaUrl} style={{ color: "#2a78d6", fontWeight: 600 }}>
          {ctaLabel}
        </Link>
      </Text>
    </PlatformEmailLayout>
  );
}
