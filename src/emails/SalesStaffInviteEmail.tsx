import React from "react";
import { Text, Link } from "@react-email/components";
import { PlatformEmailLayout, platformEmailContentStyles as s } from "@/emails/layout/PlatformEmailLayout";

export function SalesStaffInviteEmail({ name, inviteUrl, french }: { name: string; inviteUrl: string; french: boolean }) {
  const title = french ? "Votre accès à l’espace ventes GarageOS" : "Your GarageOS Sales Workspace access";
  return <PlatformEmailLayout lang={french ? "fr" : "en"} previewText={title} headerSubtitle={title}
    footerText={french ? "GarageOS · Accès équipe des ventes" : "GarageOS · Sales team access"}>
    <Text style={s.bodyText}>{french ? "Bonjour" : "Hi"} {name},</Text>
    <Text style={s.bodyText}>{french ? "Un accès à l’espace ventes de GarageOS a été créé pour vous. Choisissez votre mot de passe pour activer votre compte."
      : "A GarageOS Sales Workspace account has been created for you. Choose your password to activate it."}</Text>
    <Link href={inviteUrl} style={{ display: "inline-block", backgroundColor: "#1769ff", color: "white", padding: "12px 20px", borderRadius: 8 }}>
      {french ? "Activer mon compte" : "Activate my account"}</Link>
    <Text style={s.bodyText}>{french ? "Ce lien est à usage unique et expire dans 7 jours. Si vous ne reconnaissez pas cette demande, ignorez ce courriel."
      : "This single-use link expires in 7 days. If you do not recognize this request, ignore this email."}</Text>
  </PlatformEmailLayout>;
}
