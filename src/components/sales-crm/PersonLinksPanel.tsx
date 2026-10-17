"use client";

import { setPersonKey } from "@/actions/sales-person";
import { identityCopy } from "@/lib/admin-locale/sales-identity";
import { Badge, btnSecondary, cardCls, inputCls } from "@/components/sales-crm/ui";
import { FormMessage, useCrmAction } from "@/components/sales-crm/useCrmAction";

export interface PersonRow { id: string; name: string; email: string; superAdmin: boolean; staffRole: string | null; personKey: string | null }

/** Super Admin: accounts that belong to the same human share a key, so CASL review can never be "independent" of oneself through a second login. */
export function PersonLinksPanel({ locale, rows }: { locale: "en" | "fr"; rows: PersonRow[] }) {
  const c = identityCopy(locale).people;
  const { pending, error, notice, run } = useCrmAction(locale);
  return (
    <section className={`${cardCls} space-y-3`} aria-label={c.title}>
      <h2 className="font-semibold text-slate-900">{c.title}</h2>
      <p className="text-sm text-slate-600">{c.help}</p>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium text-slate-900">{r.name}</span>{r.superAdmin && <Badge tone="bg-violet-100 text-violet-800">{c.superAdmin}</Badge>}<span className="break-all text-xs text-slate-500">{r.email}</span></div>
            <form className="mt-2 flex flex-wrap items-end gap-2" action={(f) => run(() => setPersonKey(r.id, String(f.get("key") ?? "").trim() || null), undefined, c.saved)}>
              <label className="grid gap-1 text-sm text-slate-700">{c.key}<input className={inputCls} name="key" defaultValue={r.personKey ?? ""} maxLength={64} disabled={pending} placeholder="e.g. mitchell" /></label>
              <button className={btnSecondary} disabled={pending}>{c.save}</button>
            </form>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">{c.keyHelp}</p>
      <FormMessage error={error} notice={notice ?? null} />
    </section>
  );
}
