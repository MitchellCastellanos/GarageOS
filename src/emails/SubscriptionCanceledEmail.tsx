import { Text } from "@react-email/components";
import React from "react";
import { PlatformEmailLayout, platformEmailContentStyles as s } from "@/emails/layout/PlatformEmailLayout";

export interface SubscriptionCanceledEmailProps {
  shopName: string;
  reason: string;
  initiatedBySuperAdmin: boolean;
  effectiveAtFormatted: string;
}

export function SubscriptionCanceledEmail({
  shopName,
  reason,
  initiatedBySuperAdmin,
  effectiveAtFormatted,
}: SubscriptionCanceledEmailProps) {
  return (
    <PlatformEmailLayout previewText="Tu suscripción a GarageOS fue cancelada" headerSubtitle="Cancelación de suscripción">
      <Text style={s.bodyText}>Hola {shopName},</Text>
      <Text style={s.bodyText}>
        {initiatedBySuperAdmin
          ? "Tu suscripción a GarageOS fue cancelada por nuestro equipo."
          : "Confirmamos la cancelación de tu suscripción a GarageOS."}{" "}
        Seguirá activa hasta <strong>{effectiveAtFormatted}</strong>.
      </Text>
      <div style={s.card}>
        <Text style={s.cardLabel}>Motivo</Text>
        <Text style={s.cardValue}>{reason}</Text>
      </div>
      <Text style={s.bodyText}>
        Si esto fue un error o quieres reactivar tu cuenta, responde a este correo — con gusto te ayudamos.
      </Text>
    </PlatformEmailLayout>
  );
}
