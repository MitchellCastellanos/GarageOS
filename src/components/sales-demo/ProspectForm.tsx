"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProspectDemo } from "@/actions/sales-demo";
import { salesDemoCopy } from "@/lib/admin-locale/sales-demo";
import type { AdminLocale } from "@/lib/admin-locale";
import { PLATFORM } from "@/lib/routes";

export function ProspectForm({ locale, defaults = {}, opportunityId }: { locale: AdminLocale; defaults?: Partial<Record<"name" | "address" | "phone" | "email" | "contactName" | "contactEmail" | "contactPhone" | "preferredLanguage", string>>; opportunityId?: string }) {
  const t = salesDemoCopy(locale);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const fields = [
    ["name", t.name, "text", 100, "organization"], ["address", t.address, "text", 255, "street-address"],
    ["phone", t.phone, "tel", 30, "tel"], ["email", t.email, "email", 254, "email"],
    ["contactName", t.contactName, "text", 100, "name"], ["contactEmail", t.contactEmail, "email", 254, "email"],
    ["contactPhone", t.contactPhone, "tel", 30, "tel"],
  ] as const;
  return <form className="grid min-w-0 gap-5 rounded-xl border bg-white p-4 sm:grid-cols-2 sm:p-6" action={(form) => {
    setError(false);
    startTransition(async () => {
      try {
        const result = await createProspectDemo(form);
        if (result.demoId) router.push(PLATFORM.salesDemo(result.demoId)); else setError(true);
      } catch { setError(true); }
    });
  }}>
    {fields.map(([name, label, type, max, autocomplete]) => <label key={name} className="grid min-w-0 gap-2 text-sm font-medium">
      <span>{label}{name === "name" ? " *" : ""}</span>
      <input className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base" name={name} type={type}
        required={name === "name"} maxLength={max} autoComplete={autocomplete} defaultValue={defaults[name] ?? ""} disabled={pending} />
    </label>)}
    <label className="grid gap-2 text-sm font-medium">{t.language}
      <select name="preferredLanguage" defaultValue={defaults.preferredLanguage ?? (locale === "fr" ? "FR" : "EN")} className="min-h-11 rounded-lg border px-3 text-base" disabled={pending}>
        <option value="FR">Français</option><option value="EN">English</option>
      </select>
    </label>
    {opportunityId && <input type="hidden" name="opportunityId" value={opportunityId} />}
    {error && <p role="alert" className="text-red-700 sm:col-span-2">{t.error}</p>}
    <button disabled={pending} className="min-h-11 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-50 sm:col-span-2">
      {pending ? t.preparing : t.create}
    </button>
  </form>;
}
