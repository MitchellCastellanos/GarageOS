import { Text, Link } from "@react-email/components";
import React from "react";
import { PlatformEmailLayout, platformEmailContentStyles as s } from "@/emails/layout/PlatformEmailLayout";

export interface InternalSupportAlertEmailProps {
  shopName: string;
  messagePreview: string;
  adminUrl: string;
}

export function InternalSupportAlertEmail({ shopName, messagePreview, adminUrl }: InternalSupportAlertEmailProps) {
  return (
    <PlatformEmailLayout
      lang="es"
      previewText={`Mensaje nuevo de ${shopName}`}
      headerSubtitle="Nuevo mensaje de soporte"
      footerText="Este correo es una alerta interna de GarageOS."
    >
      <Text style={s.bodyText}>
        <strong>{shopName}</strong> mandó un mensaje y espera respuesta:
      </Text>
      <div style={s.card}>
        <Text style={s.cardValue}>{messagePreview}</Text>
      </div>
      <Text style={s.bodyText}>
        <Link href={adminUrl} style={{ color: "#2a78d6", fontWeight: 600 }}>
          Responder en /platform/messages
        </Link>
      </Text>
    </PlatformEmailLayout>
  );
}
