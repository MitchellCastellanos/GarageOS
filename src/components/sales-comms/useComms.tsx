"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { commsCopy, commsError } from "@/lib/admin-locale/sales-comms";

/* eslint-disable @typescript-eslint/no-explicit-any -- server-action results are validated by the caller's onOk handler */
/** Runs a sales-comms server action: localized errors, refresh on success. Authorization failures show the generic message. */
export function useComms(locale: "en" | "fr") {
  const t = commsCopy(locale);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  function run(fn: () => Promise<any>, onOk?: (r: any) => void, okMessage?: string, refresh = true) {
    setError(null); setNotice(null);
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) { setError(commsError(t, r.error)); return; }
        if (okMessage) setNotice(okMessage);
        onOk?.(r);
        if (refresh) router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        setError(t.errors[msg] ?? t.errors.unexpected);
      }
    });
  }
  return { t, router, pending, error, notice, run, setError, setNotice };
}

export function Msg({ error, notice }: { error: string | null; notice?: string | null }) {
  if (!error && !notice) return null;
  return error
    ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
    : <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>;
}
