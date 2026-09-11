"use client";

import { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import { useMarketingLocale } from "@/components/marketing/MarketingLocaleProvider";

const ARIA_LABEL = {
  en: { show: "Show password", hide: "Hide password" },
  fr: { show: "Afficher le mot de passe", hide: "Masquer le mot de passe" },
};

interface PasswordFieldProps {
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
}

export function PasswordField({
  id = "password",
  name = "password",
  label = "Password",
  placeholder = "••••••••",
  autoComplete = "current-password",
  minLength,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const { locale } = useMarketingLocale();

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          aria-label={visible ? ARIA_LABEL[locale].hide : ARIA_LABEL[locale].show}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
