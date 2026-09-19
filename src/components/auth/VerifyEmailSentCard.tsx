"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { MailCheck, Loader2 } from "lucide-react";
import { resendVerificationEmailPublic } from "@/actions/users";
import { ADMIN } from "@/lib/routes";

export function VerifyEmailSentCard({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

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
      <h1 className="text-xl font-bold text-slate-900 mb-2">Confirma tu correo</h1>
      <p className="text-slate-500 text-sm mb-1">
        Te mandamos un link de confirmación a{email ? <> <strong className="text-slate-700">{email}</strong></> : " tu correo"}.
      </p>
      <p className="text-slate-500 text-sm mb-6">
        Como dueño del taller, necesitamos confirmar que este correo funciona antes de dejarte entrar — ahí llegan avisos importantes de tu cuenta (facturación, cambios de plan).
      </p>

      {email && (
        <button
          type="button"
          disabled={pending || sent}
          onClick={handleResend}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors mb-3"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {sent ? "Correo reenviado" : "Reenviar correo"}
        </button>
      )}

      <Link href={ADMIN.login} className="text-sm text-blue-600 hover:underline">
        Ya confirmé, ir a iniciar sesión
      </Link>
    </div>
  );
}
