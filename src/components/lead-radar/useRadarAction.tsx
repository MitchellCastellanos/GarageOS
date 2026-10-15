"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { radarCopy, radarError } from "@/lib/admin-locale/lead-radar";
import type { CrmResult } from "@/lib/sales-crm/result";

/** Like useCrmAction, but error codes are translated with the Lead Radar dictionary. */
export function useRadarAction(locale: "en" | "fr") {
  const c = radarCopy(locale);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  function run<T extends object>(fn: () => Promise<CrmResult<T>>, onOk?: (r: { ok: true } & T) => void, okMessage?: string) {
    setError(null); setNotice(null);
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) { setError(radarError(locale, r.error)); return; }
        if (okMessage) setNotice(okMessage);
        onOk?.(r);
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        setError(msg === "SALES_FORBIDDEN" ? radarError(locale, "unexpected") : radarError(locale, msg));
      }
    });
  }
  return { c, pending, error, notice, run, setError, setNotice };
}
