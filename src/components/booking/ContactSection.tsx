"use client";

import { useState, useTransition } from "react";
import { Loader2, CheckCircle2, Mail } from "lucide-react";
import { useSiteLocale } from "@/components/booking/LocaleProvider";

interface ContactSectionProps {
  slug: string;
  shopName: string;
}

const STRINGS = {
  fr: {
    title: "Une question ? Écrivez-nous",
    subtitle: "Nous vous répondrons directement par courriel.",
    name: "Nom",
    email: "Courriel",
    phone: "Téléphone (optionnel)",
    message: "Votre message",
    submit: "Envoyer",
    sent: "Message envoyé — nous vous répondrons bientôt.",
    error: "Erreur à l'envoi — réessayez plus tard.",
  },
  en: {
    title: "Have a question? Contact us",
    subtitle: "We'll reply directly to your email.",
    name: "Name",
    email: "Email",
    phone: "Phone (optional)",
    message: "Your message",
    submit: "Send",
    sent: "Message sent — we'll get back to you soon.",
    error: "Something went wrong — please try again later.",
  },
  es: {
    title: "¿Tienes una pregunta? Escríbenos",
    subtitle: "Te responderemos directo a tu correo.",
    name: "Nombre",
    email: "Correo",
    phone: "Teléfono (opcional)",
    message: "Tu mensaje",
    submit: "Enviar",
    sent: "Mensaje enviado — te responderemos pronto.",
    error: "Error al enviar — intenta de nuevo más tarde.",
  },
} as const;

export function ContactSection({ slug, shopName }: ContactSectionProps) {
  const { locale } = useSiteLocale();
  const t = STRINGS[locale];
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      message: formData.get("message"),
    };

    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/book/${slug}/contact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("request failed");
        setSent(true);
        e.currentTarget.reset();
      } catch {
        setError(t.error);
      }
    });
  }

  if (sent) {
    return (
      <section className="max-w-xl mx-auto px-4 py-16 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
        <p className="text-slate-700">{t.sent}</p>
      </section>
    );
  }

  return (
    <section id="contact" className="max-w-xl mx-auto px-4 py-16">
      <div className="text-center mb-8">
        <Mail className="w-8 h-8 text-brand-red mx-auto mb-3" />
        <h2 className="bp-heading text-2xl text-slate-900">{t.title}</h2>
        <p className="text-slate-500 mt-1">
          {t.subtitle} — {shopName}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          name="name"
          required
          placeholder={t.name}
          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm"
        />
        <input
          name="email"
          type="email"
          placeholder={t.email}
          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm"
        />
        <input
          name="phone"
          placeholder={t.phone}
          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm"
        />
        <textarea
          name="message"
          required
          rows={4}
          placeholder={t.message}
          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 bg-brand-red hover:bg-brand-red-dark disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {t.submit}
        </button>
      </form>
    </section>
  );
}
