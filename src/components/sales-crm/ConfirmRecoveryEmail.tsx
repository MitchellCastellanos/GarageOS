"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { confirmRecoveryEmail } from "@/actions/sales-identity";
import { ADMIN } from "@/lib/routes";
import { identityCopy } from "@/lib/admin-locale/sales-identity";
import { btnPrimary } from "@/components/sales-crm/ui";

/** Single-use confirmation from the NEW mailbox. The secret lives in the URL fragment and is stripped from the address bar. */
export function ConfirmRecoveryEmail({ staffId, locale }: { staffId: string; locale: "en" | "fr" }) {
  const c = identityCopy(locale).verify;
  const tokenRef = useRef<string | null>(null);
  const [state, setState] = useState<"idle" | "done" | "invalid">("idle");
  const [pending, start] = useTransition();
  useEffect(() => {
    const m = /(?:^#|&)token=([a-f0-9]{64})/.exec(window.location.hash);
    tokenRef.current = m ? m[1] : null;
    if (m) window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);
  return (
    <div className="space-y-4 rounded-xl border bg-white p-6">
      <h1 className="text-xl font-semibold text-slate-900">{c.title}</h1>
      <p className="text-sm text-slate-600">{c.help}</p>
      {state === "done" && <><p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{c.done}</p><Link className={btnPrimary} href={ADMIN.login}>{c.signIn}</Link></>}
      {state === "invalid" && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{c.invalid}</p>}
      {state === "idle" && (
        <button className={`${btnPrimary} w-full`} disabled={pending} onClick={() => start(async () => {
          const t = tokenRef.current;
          if (!t) return setState("invalid");
          try { const r = await confirmRecoveryEmail(staffId, t); setState(r.ok ? "done" : "invalid"); } catch { setState("invalid"); }
        })}>{c.submit}</button>
      )}
    </div>
  );
}
