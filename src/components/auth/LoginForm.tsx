"use client";

import Link from "next/link";
import Image from "next/image";
import { Mail } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { PasswordField } from "@/components/auth/PasswordField";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

interface LoginFormProps {
  error?: string;
  destination: string;
}

export function LoginForm({ error, destination }: LoginFormProps) {
  const { locale, t } = useMarketingLocale();
  const { login } = t.auth;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
      <div className="text-center mb-5">
        <Image
          src="/brand/logo-stacked.png"
          alt="GarageOS"
          width={480}
          height={320}
          className="h-12 w-auto mx-auto mb-3"
          priority
        />
        <h1 className="text-2xl font-bold text-slate-900">{login.welcomeBack}</h1>
        <p className="text-slate-500 text-sm mt-1">{login.subtitle}</p>
      </div>

      <form action="/api/auth/login" method="POST" className="space-y-3">
        <input type="hidden" name="callbackUrl" value={destination} />
        <input type="hidden" name="locale" value={locale} />

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
            {login.emailLabel}
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={login.emailPlaceholder}
            />
          </div>
        </div>

        <PasswordField label={login.passwordLabel} />

        <div className="flex justify-end -mt-2">
          <Link href="#" className="text-sm text-blue-600 hover:underline">
            {login.forgotPassword}
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors"
        >
          {login.signIn}
        </button>
      </form>

      <div className="flex items-center gap-3 my-4">
        <div className="h-px bg-slate-200 flex-1" />
        <span className="text-xs text-slate-400">{login.or}</span>
        <div className="h-px bg-slate-200 flex-1" />
      </div>

      <GoogleSignInButton callbackUrl={destination} label={login.continueWithGoogle} />

      <p className="text-center text-xs text-slate-400 mt-4">
        {login.termsPrefix}{" "}
        <Link href="#" className="text-slate-500 hover:underline">
          {login.termsLink}
        </Link>{" "}
        {login.and}{" "}
        <Link href="#" className="text-slate-500 hover:underline">
          {login.privacyLink}
        </Link>
        .
      </p>
    </div>
  );
}
