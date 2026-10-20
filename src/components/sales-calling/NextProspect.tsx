"use client";

import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import { timezoneForProvince } from "@/domain/sales-crm/phone-eligibility";
import type { WorkspaceProfile } from "@/lib/voice/workspace-types";
import { Badge, btnPrimary } from "@/components/sales-crm/ui";
import { fill, type Locale } from "./shared";

export type NextMeta = { source: "CALLBACK" | "RANDOM"; province: string | null; provincePool: number } | null;
export type NextEmpty = { reason: string; nextWindow: { province: string; opensAt: string } | null } | null;

/** "{PROVINCE} opens at …" rendered in that province's own time zone, straight from the server's ISO instant. */
function windowTime(opensAt: string, province: string, locale: Locale): string {
  const zone = timezoneForProvince(province);
  try {
    return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: zone ?? undefined, timeZoneName: "short" }).format(new Date(opensAt));
  } catch {
    return new Date(opensAt).toISOString();
  }
}

export function NextProspect({ c, locale, profile, meta, empty, loading, disabledReason, onNext, shownCount }: {
  c: CallingCopy; locale: Locale; profile: WorkspaceProfile | null; meta: NextMeta; empty: NextEmpty; loading: boolean; disabledReason: string | null; onNext: () => void; shownCount: number;
}) {
  const n = c.ws.next;
  return (
    <section aria-labelledby="next-title" className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="next-title" className="text-base font-semibold text-slate-900">{n.title}</h2>
          <p className="text-xs text-slate-500">{n.hint}</p>
        </div>
        <span title={disabledReason ?? undefined} className="block w-full sm:w-auto">
          <button type="button" className={`${btnPrimary} w-full sm:w-auto`} disabled={!!disabledReason || loading} onClick={onNext} aria-describedby={disabledReason ? "next-blocked" : undefined}>
            {loading ? n.loading : `${n.button} →`}
          </button>
        </span>
      </div>
      {disabledReason && <p id="next-blocked" className="text-sm text-amber-800">{disabledReason}</p>}
      {profile && meta && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <Badge tone={meta.source === "CALLBACK" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"}>{n.source[meta.source] ?? meta.source}</Badge>
          {meta.province && <span>{n.province}: <b>{meta.province}</b></span>}
          {profile.window.localTime && <span>· {fill(c.ws.profile.window.localTime, { time: profile.window.localTime })}</span>}
          <span>· {fill(n.pool, { n: meta.provincePool })}</span>
        </div>
      )}
      {empty && (
        <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
          <p className="font-medium">{n.none}</p>
          {n.reasons[empty.reason] && <p>{n.reasons[empty.reason]}</p>}
          {empty.nextWindow && <p>{fill(n.nextWindow, { province: empty.nextWindow.province, time: windowTime(empty.nextWindow.opensAt, empty.nextWindow.province, locale) })}</p>}
        </div>
      )}
      {shownCount > 0 && <p className="text-xs text-slate-500">{fill(n.shown, { n: shownCount })}</p>}
    </section>
  );
}
