import type { AdminLocale } from "@/lib/admin-locale";

export interface EmailVerificationBannerDictionary {
  messageBefore: string;
  messageAfter: string;
  resend: string;
  resent: string;
  toastResent: string;
  toastError: string;
}

export const EMAIL_VERIFICATION_BANNER_DICT: Record<AdminLocale, EmailVerificationBannerDictionary> = {
  es: {
    messageBefore: "Confirma tu correo ",
    messageAfter: " para poder usarlo en recuperación de contraseña y notificaciones.",
    resend: "Reenviar correo",
    resent: "Correo enviado",
    toastResent: "Te reenviamos el correo de confirmación",
    toastError: "No se pudo reenviar el correo",
  },
  en: {
    messageBefore: "Confirm your email ",
    messageAfter: " so you can use it for password recovery and notifications.",
    resend: "Resend email",
    resent: "Email sent",
    toastResent: "We resent the confirmation email",
    toastError: "Couldn't resend the email",
  },
  fr: {
    messageBefore: "Confirmez votre courriel ",
    messageAfter: " pour pouvoir l'utiliser pour la récupération de mot de passe et les notifications.",
    resend: "Renvoyer le courriel",
    resent: "Courriel envoyé",
    toastResent: "Nous avons renvoyé le courriel de confirmation",
    toastError: "Impossible de renvoyer le courriel",
  },
};
