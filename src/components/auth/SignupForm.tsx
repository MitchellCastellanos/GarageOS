"use client";

import Link from "next/link";
import Image from "next/image";
import { Mail, User, Building2 } from "lucide-react";
import { ADMIN } from "@/lib/routes";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";
import { PasswordField } from "@/components/auth/PasswordField";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

interface SignupFormProps {
  error?: string;
}

export function SignupForm({ error }: SignupFormProps) {
  const { locale, t } = useMarketingLocale();
  const { signup, login } = t.auth;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
      <div className="text-center mb-3">
        <Image
          src="/brand/logo-stacked.png"
          alt="GarageOS"
          width={480}
          height={320}
          className="h-9 w-auto mx-auto mb-2"
          priority
        />
        <h1 className="text-xl font-bold text-slate-900">{signup.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{signup.subtitle}</p>
      </div>

      <form action="/api/auth/signup" method="POST" className="space-y-2">
        <input type="hidden" name="locale" value={locale} />

        <div>
          <label htmlFor="shopName" className="block text-sm font-medium text-slate-700 mb-1">
            {signup.shopNameLabel}
          </label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="shopName"
              name="shopName"
              type="text"
              autoComplete="organization"
              required
              className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={signup.shopNamePlaceholder}
            />
          </div>
        </div>

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
            {signup.yourNameLabel}
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={signup.yourNamePlaceholder}
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
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
              className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={login.emailPlaceholder}
            />
          </div>
        </div>

        <PasswordField
          label={login.passwordLabel}
          autoComplete="new-password"
          placeholder={signup.passwordPlaceholder}
          minLength={8}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors"
        >
          {signup.createAccount}
        </button>
      </form>

      <div className="flex items-center gap-3 my-2.5">
        <div className="h-px bg-slate-200 flex-1" />
        <span className="text-xs text-slate-400">{login.or}</span>
        <div className="h-px bg-slate-200 flex-1" />
      </div>

      <GoogleSignInButton callbackUrl={ADMIN.dashboard} label={signup.signUpWithGoogle} />

      <p className="text-center text-xs text-slate-400 mt-2.5">
        {signup.termsPrefix}{" "}
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
