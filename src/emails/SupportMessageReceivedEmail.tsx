import { Text } from "@react-email/components";
import React from "react";
import { PlatformEmailLayout, platformEmailContentStyles as s } from "@/emails/layout/PlatformEmailLayout";
import type { PlatformEmailLanguage } from "@/lib/platform/locale";

export interface SupportMessageReceivedEmailProps {
  shopName: string;
  messagePreview: string;
  language?: PlatformEmailLanguage;
}

const STRINGS: Record<PlatformEmailLanguage, {
  htmlLang: string;
  headerSubtitle: string;
  preview: string;
  greeting: (name: string) => string;
  intro: string;
  messageLabel: string;
  outro: string;
  footer: string;
}> = {
  EN: {
    htmlLang: "en",
    headerSubtitle: "Support",
    preview: "We received your message",
    greeting: (name) => `Hi ${name},`,
    intro: "We received your message and someone from our team will get back to you shortly.",
    messageLabel: "Your message",
    outro: "You can view the conversation and reply from your dashboard, under Help / Support.",
    footer: "This email was sent by GarageOS about your platform account.",
  },
  FR: {
    htmlLang: "fr",
    headerSubtitle: "Soutien",
    preview: "Nous avons reçu votre message",
    greeting: (name) => `Bonjour ${name},`,
    intro: "Nous avons reçu votre message et un membre de notre équipe vous répondra sous peu.",
    messageLabel: "Votre message",
    outro: "Vous pouvez voir la conversation et répondre depuis votre tableau de bord, sous Aide / Soutien.",
    footer: "Ce courriel a été envoyé par GarageOS au sujet de votre compte de plateforme.",
  },
};

export function SupportMessageReceivedEmail({ shopName, messagePreview, language }: SupportMessageReceivedEmailProps) {
  const t = STRINGS[language === "FR" ? "FR" : "EN"];

  return (
    <PlatformEmailLayout lang={t.htmlLang} previewText={t.preview} headerSubtitle={t.headerSubtitle} footerText={t.footer}>
      <Text style={s.bodyText}>{t.greeting(shopName)}</Text>
      <Text style={s.bodyText}>{t.intro}</Text>
      <div style={s.card}>
        <Text style={s.cardLabel}>{t.messageLabel}</Text>
        <Text style={s.cardValue}>{messagePreview}</Text>
      </div>
      <Text style={s.bodyText}>{t.outro}</Text>
    </PlatformEmailLayout>
  );
}
