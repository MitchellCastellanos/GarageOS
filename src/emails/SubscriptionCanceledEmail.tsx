import { Text } from "@react-email/components";
import React from "react";
import { PlatformEmailLayout, platformEmailContentStyles as s } from "@/emails/layout/PlatformEmailLayout";
import type { PlatformEmailLanguage } from "@/lib/platform/locale";

export interface SubscriptionCanceledEmailProps {
  shopName: string;
  reason: string;
  initiatedBySuperAdmin: boolean;
  effectiveAtFormatted: string;
  language?: PlatformEmailLanguage;
}

const STRINGS: Record<PlatformEmailLanguage, {
  htmlLang: string;
  headerSubtitle: string;
  preview: string;
  greeting: (name: string) => string;
  intro: (byUs: boolean) => string;
  activeUntil: (date: string) => React.ReactNode;
  reasonLabel: string;
  reactivate: string;
  footer: string;
}> = {
  EN: {
    htmlLang: "en",
    headerSubtitle: "Subscription cancellation",
    preview: "Your GarageOS subscription was cancelled",
    greeting: (name) => `Hi ${name},`,
    intro: (byUs) => (byUs ? "Your GarageOS subscription was cancelled by our team." : "We've confirmed the cancellation of your GarageOS subscription."),
    activeUntil: (date) => (
      <>
        {" "}It will stay active until <strong>{date}</strong>.
      </>
    ),
    reasonLabel: "Reason",
    reactivate: "If this was a mistake or you'd like to reactivate your account, just reply to this email — we're happy to help.",
    footer: "This email was sent by GarageOS about your platform account.",
  },
  FR: {
    htmlLang: "fr",
    headerSubtitle: "Annulation d'abonnement",
    preview: "Votre abonnement GarageOS a été annulé",
    greeting: (name) => `Bonjour ${name},`,
    intro: (byUs) => (byUs ? "Votre abonnement GarageOS a été annulé par notre équipe." : "Nous confirmons l'annulation de votre abonnement GarageOS."),
    activeUntil: (date) => (
      <>
        {" "}Il restera actif jusqu'au <strong>{date}</strong>.
      </>
    ),
    reasonLabel: "Motif",
    reactivate: "Si c'est une erreur ou que vous souhaitez réactiver votre compte, répondez simplement à ce courriel — on est là pour vous aider.",
    footer: "Ce courriel a été envoyé par GarageOS au sujet de votre compte de plateforme.",
  },
};

export function SubscriptionCanceledEmail({
  shopName,
  reason,
  initiatedBySuperAdmin,
  effectiveAtFormatted,
  language,
}: SubscriptionCanceledEmailProps) {
  const t = STRINGS[language === "FR" ? "FR" : "EN"];

  return (
    <PlatformEmailLayout lang={t.htmlLang} previewText={t.preview} headerSubtitle={t.headerSubtitle} footerText={t.footer}>
      <Text style={s.bodyText}>{t.greeting(shopName)}</Text>
      <Text style={s.bodyText}>
        {t.intro(initiatedBySuperAdmin)}
        {t.activeUntil(effectiveAtFormatted)}
      </Text>
      <div style={s.card}>
        <Text style={s.cardLabel}>{t.reasonLabel}</Text>
        <Text style={s.cardValue}>{reason}</Text>
      </div>
      <Text style={s.bodyText}>{t.reactivate}</Text>
    </PlatformEmailLayout>
  );
}
