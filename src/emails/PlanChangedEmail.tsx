import { Hr, Text } from "@react-email/components";
import React from "react";
import { PlatformEmailLayout, platformEmailContentStyles as s } from "@/emails/layout/PlatformEmailLayout";
import { PLAN_LABELS, type Plan } from "@/config/entitlements";
import type { PlatformEmailLanguage } from "@/lib/platform/locale";

export interface PlanChangedEmailProps {
  shopName: string;
  previousPlan: Plan;
  newPlan: Plan;
  reason: string;
  language?: PlatformEmailLanguage;
}

const STRINGS: Record<PlatformEmailLanguage, {
  htmlLang: string;
  headerSubtitle: string;
  preview: (plan: string) => string;
  greeting: (name: string) => string;
  changed: (from: string, to: string) => React.ReactNode;
  reasonLabel: string;
  questions: string;
  footer: string;
}> = {
  EN: {
    htmlLang: "en",
    headerSubtitle: "Plan change",
    preview: (plan) => `Your plan changed to ${plan}`,
    greeting: (name) => `Hi ${name},`,
    changed: (from, to) => (
      <>
        Your GarageOS plan changed from <strong>{from}</strong> to <strong>{to}</strong>.
      </>
    ),
    reasonLabel: "Reason",
    questions: "If you have questions about this change, just reply to this email and we'll help you out.",
    footer: "This email was sent by GarageOS about your platform account.",
  },
  FR: {
    htmlLang: "fr",
    headerSubtitle: "Changement de forfait",
    preview: (plan) => `Votre forfait a changé pour ${plan}`,
    greeting: (name) => `Bonjour ${name},`,
    changed: (from, to) => (
      <>
        Votre forfait GarageOS est passé de <strong>{from}</strong> à <strong>{to}</strong>.
      </>
    ),
    reasonLabel: "Motif",
    questions: "Si vous avez des questions sur ce changement, répondez simplement à ce courriel — on est là pour vous aider.",
    footer: "Ce courriel a été envoyé par GarageOS au sujet de votre compte de plateforme.",
  },
};

export function PlanChangedEmail({ shopName, previousPlan, newPlan, reason, language }: PlanChangedEmailProps) {
  const t = STRINGS[language === "FR" ? "FR" : "EN"];

  return (
    <PlatformEmailLayout
      lang={t.htmlLang}
      previewText={t.preview(PLAN_LABELS[newPlan])}
      headerSubtitle={t.headerSubtitle}
      footerText={t.footer}
    >
      <Text style={s.bodyText}>{t.greeting(shopName)}</Text>
      <Text style={s.bodyText}>{t.changed(PLAN_LABELS[previousPlan], PLAN_LABELS[newPlan])}</Text>
      <div style={s.card}>
        <Text style={s.cardLabel}>{t.reasonLabel}</Text>
        <Text style={s.cardValue}>{reason}</Text>
      </div>
      <Hr style={{ borderColor: "#e2e8f0", margin: "16px 0" }} />
      <Text style={s.bodyText}>{t.questions}</Text>
    </PlatformEmailLayout>
  );
}
