import { Text } from "@react-email/components";
import React from "react";
import { PlatformEmailLayout, platformEmailContentStyles as s } from "@/emails/layout/PlatformEmailLayout";
import type { PlatformEmailLanguage } from "@/lib/platform/locale";

export interface SupportReplyEmailProps {
  shopName: string;
  replyPreview: string;
  language?: PlatformEmailLanguage;
}

const STRINGS: Record<PlatformEmailLanguage, {
  htmlLang: string;
  headerSubtitle: string;
  preview: string;
  greeting: (name: string) => string;
  intro: string;
  outro: string;
  footer: string;
}> = {
  EN: {
    htmlLang: "en",
    headerSubtitle: "Support",
    preview: "New reply from GarageOS",
    greeting: (name) => `Hi ${name},`,
    intro: "You have a new reply from our support team:",
    outro: "Reply from your dashboard, under Help / Support.",
    footer: "This email was sent by GarageOS about your platform account.",
  },
  FR: {
    htmlLang: "fr",
    headerSubtitle: "Soutien",
    preview: "Nouvelle réponse de GarageOS",
    greeting: (name) => `Bonjour ${name},`,
    intro: "Vous avez une nouvelle réponse de notre équipe de soutien :",
    outro: "Répondez depuis votre tableau de bord, sous Aide / Soutien.",
    footer: "Ce courriel a été envoyé par GarageOS au sujet de votre compte de plateforme.",
  },
};

export function SupportReplyEmail({ shopName, replyPreview, language }: SupportReplyEmailProps) {
  const t = STRINGS[language === "FR" ? "FR" : "EN"];

  return (
    <PlatformEmailLayout lang={t.htmlLang} previewText={t.preview} headerSubtitle={t.headerSubtitle} footerText={t.footer}>
      <Text style={s.bodyText}>{t.greeting(shopName)}</Text>
      <Text style={s.bodyText}>{t.intro}</Text>
      <div style={s.card}>
        <Text style={s.cardValue}>{replyPreview}</Text>
      </div>
      <Text style={s.bodyText}>{t.outro}</Text>
    </PlatformEmailLayout>
  );
}
