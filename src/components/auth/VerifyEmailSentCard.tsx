"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { MailCheck, Loader2 } from "lucide-react";
import { resendVerificationEmailPublic } from "@/actions/users";
import { ADMIN } from "@/lib/routes";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";

const COPY = {
  en: {
    title: "Confirm your email",
    sentBefore: "We sent a confirmation link to",
    sentFallback: "your email",
    why: "As the shop owner, we need to confirm this email works before letting you in — important account notices (billing, plan changes) go there.",
    resend: "Resend email",
    resent: "Email resent",
    signIn: "I already confirmed, go to sign in",
  },
  fr: {
    title: "Confirmez votre courriel",
    sentBefore: "Nous avons envoyé un lien de confirmation à",
    sentFallback: "votre courriel",
    why: "En tant que propriétaire de l'atelier, nous devons confirmer que ce courriel fonctionne avant de vous laisser entrer — les avis importants de votre compte (facturation, changements de forfait) y sont envoyés.",
    resend: "Renvoyer le courriel",
    resent: "Courriel renvoyé",
    signIn: "J'ai déjà confirmé, me connecter",
  },
} as const;

export function VerifyEmailSentCard({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const { locale } = useMarketingLocale();
  const c = COPY[locale];

  function handleResend() {
    startTransition(async () => {
      await resendVerificationEmailPublic(email);
      setSent(true);
    });
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 text-center">
      <Image
        src="/brand/logo-stacked.png"
        alt="GarageOS"
        width={480}
        height={320}
        className="h-12 w-auto mx-auto mb-4"
        priority
      />
      <MailCheck className="w-10 h-10 text-blue-600 mx-auto mb-3" />
      <h1 className="text-xl font-bold text-slate-900 mb-2">{c.title}</h1>
      <p className="text-slate-500 text-sm mb-1">
        {c.sentBefore}{email ? <> <strong className="text-slate-700">{email}</strong></> : ` ${c.sentFallback}`}.
      </p>
      <p className="text-slate-500 text-sm mb-6">
        {c.why}
      </p>

      {email && (
        <button
          type="button"
          disabled={pending || sent}
          onClick={handleResend}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors mb-3"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {sent ? c.resent : c.resend}
        </button>
      )}

      <Link href={ADMIN.login} className="text-sm text-blue-600 hover:underline">
        {c.signIn}
      </Link>
    </div>
  );
}
