"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resendMyVerificationEmail } from "@/actions/users";
import { Loader2, MailWarning } from "lucide-react";

export function EmailVerificationBanner({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  function handleResend() {
    startTransition(async () => {
      const result = await resendMyVerificationEmail();
      if (result?.success) {
        setSent(true);
        toast.success("Te reenviamos el correo de confirmación");
      } else {
        toast.error(result?.error ?? "No se pudo reenviar el correo");
      }
    });
  }

  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-2 sm:gap-3 bg-amber-50 border-b border-amber-200 px-3 sm:px-4 py-2 text-sm text-amber-900">
      <span className="flex items-center gap-2 min-w-0">
        <MailWarning className="w-4 h-4 shrink-0 text-amber-600" />
        <span className="truncate">
          Confirma tu correo <strong>{email}</strong> para poder usarlo en recuperación de contraseña y notificaciones.
        </span>
      </span>
      <button
        type="button"
        disabled={pending || sent}
        onClick={handleResend}
        className="flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1 text-white hover:bg-amber-700 disabled:opacity-60 shrink-0"
      >
        {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {sent ? "Correo enviado" : "Reenviar correo"}
      </button>
    </div>
  );
}
