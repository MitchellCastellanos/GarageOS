import React from "react";
import { Text, Link } from "@react-email/components";
import { PlatformEmailLayout, platformEmailContentStyles as s } from "@/emails/layout/PlatformEmailLayout";

export type StaffEmailKind = "invite" | "reset" | "verify-recovery" | "recovery-changed";

const btn = { display: "inline-block", backgroundColor: "#1769ff", color: "white", padding: "12px 20px", borderRadius: 8 } as const;

/** Account-security email for platform sales staff. Always sent to the PRIVATE recovery address, never to prospects. */
export function SalesStaffInviteEmail({ name, inviteUrl, french, kind = "invite", corporateEmail }: { name: string; inviteUrl: string; french: boolean; kind?: StaffEmailKind; corporateEmail?: string }) {
  const fr = french;
  const copy = {
    invite: {
      title: fr ? "Votre accès à l’espace ventes GarageOS" : "Your GarageOS Sales Workspace access",
      body: fr ? "Un compte de l’espace ventes de GarageOS a été créé pour vous. Choisissez votre mot de passe pour l’activer et confirmer ce courriel de récupération."
        : "A GarageOS Sales Workspace account has been created for you. Choose your password to activate it and confirm this recovery email.",
      cta: fr ? "Activer mon compte" : "Activate my account", note: fr ? "Ce lien est à usage unique et expire dans 7 jours." : "This single-use link expires in 7 days.",
    },
    reset: {
      title: fr ? "Réinitialisation de votre mot de passe GarageOS" : "Reset your GarageOS password",
      body: fr ? "Une réinitialisation du mot de passe a été demandée pour votre compte ventes. Choisissez un nouveau mot de passe."
        : "A password reset was requested for your Sales account. Choose a new password.",
      cta: fr ? "Choisir un nouveau mot de passe" : "Choose a new password", note: fr ? "Ce lien est à usage unique et expire dans 7 jours." : "This single-use link expires in 7 days.",
    },
    "verify-recovery": {
      title: fr ? "Confirmez votre courriel de récupération" : "Confirm your recovery email",
      body: fr ? "Confirmez que cette adresse personnelle peut servir à récupérer votre compte ventes GarageOS."
        : "Confirm that this personal address can be used to recover your GarageOS Sales account.",
      cta: fr ? "Confirmer l’adresse" : "Confirm this address", note: fr ? "Ce lien est à usage unique et expire dans 24 heures." : "This single-use link expires in 24 hours.",
    },
    "recovery-changed": {
      title: fr ? "Votre courriel de récupération a changé" : "Your recovery email was changed",
      body: fr ? "Le courriel de récupération de votre compte ventes GarageOS vient d’être remplacé. Si ce n’était pas vous, contactez un administrateur immédiatement."
        : "The recovery email on your GarageOS Sales account was just replaced. If this was not you, contact an administrator immediately.",
      cta: "", note: "",
    },
  }[kind];
  return <PlatformEmailLayout lang={fr ? "fr" : "en"} previewText={copy.title} headerSubtitle={copy.title}
    footerText={fr ? "GarageOS · Accès équipe des ventes" : "GarageOS · Sales team access"}>
    <Text style={s.bodyText}>{fr ? "Bonjour" : "Hi"} {name},</Text>
    <Text style={s.bodyText}>{copy.body}</Text>
    {corporateEmail ? <Text style={s.bodyText}>{fr ? "Identifiant de connexion :" : "Your sign-in:"} <strong>{corporateEmail}</strong></Text> : null}
    {copy.cta ? <Link href={inviteUrl} style={btn}>{copy.cta}</Link> : null}
    <Text style={s.bodyText}>{copy.note} {fr ? "Si vous ne reconnaissez pas cette demande, ignorez ce courriel." : "If you do not recognize this request, ignore this email."}</Text>
  </PlatformEmailLayout>;
}
