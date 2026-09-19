import { Text } from "@react-email/components";
import React from "react";
import { PlatformEmailLayout, platformEmailContentStyles as s } from "@/emails/layout/PlatformEmailLayout";

export interface SupportMessageReceivedEmailProps {
  shopName: string;
  messagePreview: string;
}

export function SupportMessageReceivedEmail({ shopName, messagePreview }: SupportMessageReceivedEmailProps) {
  return (
    <PlatformEmailLayout previewText="Recibimos tu mensaje" headerSubtitle="Soporte">
      <Text style={s.bodyText}>Hola {shopName},</Text>
      <Text style={s.bodyText}>Recibimos tu mensaje y un miembro de nuestro equipo te va a responder pronto.</Text>
      <div style={s.card}>
        <Text style={s.cardLabel}>Tu mensaje</Text>
        <Text style={s.cardValue}>{messagePreview}</Text>
      </div>
      <Text style={s.bodyText}>Puedes ver la conversación y responder desde tu panel, en Ayuda / Soporte.</Text>
    </PlatformEmailLayout>
  );
}
