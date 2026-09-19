import { Text } from "@react-email/components";
import React from "react";
import { PlatformEmailLayout, platformEmailContentStyles as s } from "@/emails/layout/PlatformEmailLayout";

export interface SupportReplyEmailProps {
  shopName: string;
  replyPreview: string;
}

export function SupportReplyEmail({ shopName, replyPreview }: SupportReplyEmailProps) {
  return (
    <PlatformEmailLayout previewText="Nueva respuesta de GarageOS" headerSubtitle="Soporte">
      <Text style={s.bodyText}>Hola {shopName},</Text>
      <Text style={s.bodyText}>Tienes una respuesta nueva de nuestro equipo de soporte:</Text>
      <div style={s.card}>
        <Text style={s.cardValue}>{replyPreview}</Text>
      </div>
      <Text style={s.bodyText}>Responde desde tu panel, en Ayuda / Soporte.</Text>
    </PlatformEmailLayout>
  );
}
