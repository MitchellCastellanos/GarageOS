"use client";

import Link from "next/link";
import { useState } from "react";
import { createTestRecipient } from "@/actions/sales-platform-settings";
import { identityCopy } from "@/lib/admin-locale/sales-identity";
import { PLATFORM } from "@/lib/routes";
import { btnPrimary, cardCls, inputCls, labelCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export function TestRecipientPanel({ locale }: { locale: "en" | "fr" }) {
  const c = identityCopy(locale).tester;
  const { pending, error, notice, run } = useCrmAction(locale);
  const [prospectId, setProspectId] = useState<string | null>(null);
  return (
    <section className={cardCls} aria-labelledby="tr-h">
      <h2 id="tr-h" className="mb-1 font-semibold text-slate-900">{c.title}</h2>
      <p className="mb-3 text-sm text-slate-600">{c.help}</p>
      <form className="grid gap-3 sm:max-w-md" action={(f) => run(() => createTestRecipient(String(f.get("email") ?? "")), (r) => setProspectId((r as unknown as { prospectId: string }).prospectId), c.ready)}>
        <label className={labelCls}>{c.to}<input className={inputCls} type="email" name="email" required maxLength={254} disabled={pending} /></label>
        <FormMessage error={error} notice={notice ?? null} />
        <div className="flex flex-wrap items-center gap-3"><button className={btnPrimary} disabled={pending}>{c.prepare}</button>
          {prospectId && <Link className="text-sm text-blue-700" href={PLATFORM.salesProspect(prospectId)}>{c.open}</Link>}</div>
      </form>
    </section>
  );
}
