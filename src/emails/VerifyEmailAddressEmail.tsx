import { Text, Link } from "@react-email/components";
import React from "react";
import { PlatformEmailLayout, platformEmailContentStyles as s } from "@/emails/layout/PlatformEmailLayout";
import type { PlatformEmailLanguage } from "@/lib/platform/locale";

export interface VerifyEmailAddressEmailProps {
  name: string;
  verifyUrl: string;
  language?: PlatformEmailLanguage;
}

const STRINGS: Record<PlatformEmailLanguage, {
  htmlLang: string;
  headerSubtitle: string;
  preview: string;
  greeting: (name: string) => string;
  intro: string;
  cta: string;
  expiry: string;
  footer: string;
}> = {
  EN: {
    htmlLang: "en",
    headerSubtitle: "Confirm your email",
    preview: "Confirm your email for GarageOS",
    greeting: (name) => `Hi ${name},`,
    intro:
      "Please confirm that this is your email so we can use it for login, password recovery, and important notifications for your account.",
    cta: "Confirm my email",
    expiry: "This link expires in 24 hours. If you don't recognize this account, you can ignore this email.",
    footer: "This email was sent by GarageOS about your platform account.",
  },
  FR: {
    htmlLang: "fr",
    headerSubtitle: "Confirmez votre courriel",
    preview: "Confirmez votre courriel pour GarageOS",
    greeting: (name) => `Bonjour ${name},`,
    intro:
      "Confirmez que ce courriel est bien le vôtre pour pouvoir l'utiliser pour la connexion, la récupération de mot de passe et les notifications importantes de votre compte.",
    cta: "Confirmer mon courriel",
    expiry: "Ce lien expire dans 24 heures. Si vous ne reconnaissez pas ce compte, vous pouvez ignorer ce courriel.",
    footer: "Ce courriel a été envoyé par GarageOS au sujet de votre compte de plateforme.",
  },
};

export function VerifyEmailAddressEmail({ name, verifyUrl, language }: VerifyEmailAddressEmailProps) {
  const t = STRINGS[language === "FR" ? "FR" : "EN"];

  return (
    <PlatformEmailLayout lang={t.htmlLang} previewText={t.preview} headerSubtitle={t.headerSubtitle} footerText={t.footer}>
      <Text style={s.bodyText}>{t.greeting(name)}</Text>
      <Text style={s.bodyText}>{t.intro}</Text>
      <Text style={s.bodyText}>
        <Link
          href={verifyUrl}
          style={{
            display: "inline-block",
            backgroundColor: "#0f172a",
            color: "#ffffff",
            fontWeight: 600,
            padding: "10px 20px",
            borderRadius: "8px",
            textDecoration: "none",
          }}
        >
          {t.cta}
        </Link>
      </Text>
      <Text style={{ ...s.bodyText, fontSize: "12px", color: "#94a3b8" }}>{t.expiry}</Text>
    </PlatformEmailLayout>
  );
}
