"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crmCopy, crmError } from "@/lib/admin-locale/sales-crm";
import type { CrmResult } from "@/lib/sales-crm/result";

/** Runs a CRM server action, surfaces a localized error, refreshes the server data on success. Authorization failures show the generic message. */
export function useCrmAction(locale: "en" | "fr") {
  const t = crmCopy(locale);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  function run<T extends object>(fn: () => Promise<CrmResult<T>>, onOk?: (r: { ok: true } & T) => void, okMessage?: string) {
    setError(null); setNotice(null);
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) { setError(crmError(t, r.error)); return; }
        if (okMessage) setNotice(okMessage);
        onOk?.(r);
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        setError(t.errors[msg] ?? t.errors.unexpected);
      }
    });
  }
  return { t, pending, error, notice, run, setError };
}

export function FormMessage({ error, notice }: { error: string | null; notice?: string | null }) {
  if (!error && !notice) return null;
  return error
    ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
    : <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>;
}
