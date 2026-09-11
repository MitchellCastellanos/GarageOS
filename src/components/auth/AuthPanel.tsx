"use client";

import Link from "next/link";
import { ADMIN } from "@/lib/routes";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { LanguageToggle } from "@/components/marketing/LanguageToggle";

interface AuthPanelProps {
  variant: "login" | "signup";
  children: React.ReactNode;
}

// Lado derecho (claro) de /admin/login y /admin/signup: barra superior con
// el selector de idioma + el link cruzado entre las dos pantallas, y la
// tarjeta del formulario.
export function AuthPanel({ variant, children }: AuthPanelProps) {
  const { t } = useMarketingLocale();

  const topBarText = variant === "login" ? t.auth.login.newToGarageOS : t.auth.signup.alreadyHaveAccount;
  const topBarLinkLabel = variant === "login" ? t.auth.login.createAccount : t.auth.signup.signIn;
  const topBarLinkHref = variant === "login" ? ADMIN.signup : ADMIN.login;

  return (
    <div className="flex-1 relative overflow-hidden bg-slate-50 flex flex-col min-h-screen">
      <div className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-brand-blue/10 blur-3xl" />
      <div className="pointer-events-none absolute top-0 right-0 w-64 h-64 rounded-full bg-brand-blue/5 blur-2xl" />

      <div className="relative flex items-center justify-end gap-4 px-6 py-4 sm:px-10">
        <LanguageToggle />
        <p className="text-sm text-slate-500">
          {topBarText}{" "}
          <Link
            href={topBarLinkHref}
            className="inline-block ml-1 font-semibold text-brand-blue bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-1.5 transition-colors"
          >
            {topBarLinkLabel}
          </Link>
        </p>
      </div>

      <div className="relative flex-1 flex items-center justify-center px-6 py-2 min-h-0">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
