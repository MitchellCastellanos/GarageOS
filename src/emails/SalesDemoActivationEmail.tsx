import React from "react";
import { Text, Link } from "@react-email/components";
import { PlatformEmailLayout, platformEmailContentStyles as s } from "@/emails/layout/PlatformEmailLayout";

export function SalesDemoActivationEmail({ name, shopName, activationUrl, french }: { name: string; shopName: string; activationUrl: string; french: boolean }) {
  const title = french ? "Votre GarageOS est prêt" : "Your GarageOS is ready";
  return <PlatformEmailLayout lang={french ? "fr" : "en"} previewText={title} headerSubtitle={title}
    footerText={french ? "GarageOS · Activation de votre compte" : "GarageOS · Account activation"}>
    <Text style={s.bodyText}>{french ? "Bonjour" : "Hi"} {name},</Text>
    <Text style={s.bodyText}>{french ? `Votre atelier ${shopName} est déjà préparé. Activez votre compte propriétaire, puis terminez le paiement sécurisé dans Stripe.` :
      `Your shop ${shopName} has already been prepared. Activate your owner account, then complete secure payment in Stripe.`}</Text>
    <Link href={activationUrl} style={{ display: "inline-block", backgroundColor: "#1769ff", color: "white", padding: "12px 20px", borderRadius: 8 }}>
      {french ? "Activer mon compte GarageOS" : "Activate my GarageOS account"}</Link>
    <Text style={s.bodyText}>{french ? "Ce lien est à usage unique et expire dans 24 heures (ou à l’expiration de la démo). Si vous ne reconnaissez pas cette demande, ignorez ce courriel." :
      "This single-use link expires in 24 hours (or when the demo expires). If you do not recognize this request, ignore this email."}</Text>
  </PlatformEmailLayout>;
}
