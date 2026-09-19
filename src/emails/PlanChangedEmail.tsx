import { Hr, Text } from "@react-email/components";
import React from "react";
import { PlatformEmailLayout, platformEmailContentStyles as s } from "@/emails/layout/PlatformEmailLayout";
import { PLAN_LABELS, type Plan } from "@/config/entitlements";

export interface PlanChangedEmailProps {
  shopName: string;
  previousPlan: Plan;
  newPlan: Plan;
  reason: string;
}

export function PlanChangedEmail({ shopName, previousPlan, newPlan, reason }: PlanChangedEmailProps) {
  return (
    <PlatformEmailLayout previewText={`Tu plan cambió a ${PLAN_LABELS[newPlan]}`} headerSubtitle="Cambio de plan">
      <Text style={s.bodyText}>Hola {shopName},</Text>
      <Text style={s.bodyText}>
        Tu plan en GarageOS cambió de <strong>{PLAN_LABELS[previousPlan]}</strong> a{" "}
        <strong>{PLAN_LABELS[newPlan]}</strong>.
      </Text>
      <div style={s.card}>
        <Text style={s.cardLabel}>Motivo</Text>
        <Text style={s.cardValue}>{reason}</Text>
      </div>
      <Hr style={{ borderColor: "#e2e8f0", margin: "16px 0" }} />
      <Text style={s.bodyText}>
        Si tienes dudas sobre este cambio, responde a este correo y te ayudamos.
      </Text>
    </PlatformEmailLayout>
  );
}
