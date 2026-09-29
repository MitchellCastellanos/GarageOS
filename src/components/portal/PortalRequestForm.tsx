"use client";

import { useState, useTransition } from "react";
import { requestPortalLink } from "@/actions/portal";
import { PORTAL_STRINGS, type PortalLang } from "@/lib/portal-i18n";
import { portalButtonClass } from "@/components/portal/PortalShell";

export function PortalRequestForm({ slug, lang }: { slug: string; lang: PortalLang }) {
  const t = PORTAL_STRINGS[lang].request;
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  if (sent) {
    return (
      <div role="status" className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-bold">{t.sent}</h1>
        <p className="text-sm text-slate-600">{t.sentBody}</p>
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await requestPortalLink(slug, email);
          setSent(true);
        });
      }}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h1 className="text-xl font-bold">{t.title}</h1>
      <p className="text-sm text-slate-600">{t.intro}</p>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        <span>{t.email}</span>
        <input
          type="email"
          required
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="block min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </label>
      <button type="submit" disabled={pending} className={`${portalButtonClass} w-full disabled:opacity-60`}>{t.submit}</button>
    </form>
  );
}
