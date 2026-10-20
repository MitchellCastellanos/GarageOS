"use client";

import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import { timezoneForProvince } from "@/domain/sales-crm/phone-eligibility";
import type { WorkspaceProfile } from "@/lib/voice/workspace-types";
import { Badge, btnPrimary, btnSecondary } from "@/components/sales-crm/ui";
import { fill, type Locale } from "./shared";

export type NextMeta = { source: "CALLBACK" | "RANDOM"; province: string | null; provincePool: number; outsideHours?: boolean } | null;
export type NextEmpty = { reason: string; nextWindow: { province: string; opensAt: string } | null } | null;

/** "{PROVINCE} opens at …" rendered in that province's own time zone, straight from the server's ISO instant. */
export function windowTime(opensAt: string, province: string, locale: Locale): string {
  const zone = timezoneForProvince(province);
  try {
    return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: zone ?? undefined, timeZoneName: "short" }).format(new Date(opensAt));
  } catch {
    return new Date(opensAt).toISOString();
  }
}

/** Prospect navigation inside the softphone: Next prospect (loads only, never dials) and Previous / Next viewed. Pure props → markup. */
export function NextProspect({ c, locale, profile, meta, empty, loading, disabledReason, onNext, shownCount, onBack, onForward }: {
  c: CallingCopy; locale: Locale; profile: WorkspaceProfile | null; meta: NextMeta; empty: NextEmpty; loading: boolean; disabledReason: string | null; onNext: () => void; shownCount: number;
  onBack: (() => void) | null; onForward: (() => void) | null;
}) {
  const n = c.ws.next;
  const blocked = !!disabledReason || loading;
  return (
    <section aria-labelledby="next-title" className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
      <h3 id="next-title" className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.ws.phoneUi.nav}</h3>
      <span title={disabledReason ?? undefined} className="block">
        <button type="button" className={`${btnPrimary} w-full`} disabled={blocked} onClick={onNext} aria-describedby={disabledReason ? "next-blocked" : "next-hint"}>
          {loading ? n.loading : `${n.button} →`}
        </button>
      </span>
      <div className="grid grid-cols-2 gap-2" title={n.historyHint}>
        <button type="button" className={`${btnSecondary} px-2`} disabled={!onBack || blocked} onClick={() => onBack?.()}>{n.previous}</button>
        <button type="button" className={`${btnSecondary} px-2`} disabled={!onForward || blocked} onClick={() => onForward?.()}>{n.forward}</button>
      </div>
      {disabledReason ? <p id="next-blocked" className="text-xs text-amber-800">{disabledReason}</p> : <p id="next-hint" className="text-xs text-slate-500">{n.hint}</p>}
      {profile && meta && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-700">
          <Badge tone={meta.source === "CALLBACK" ? "bg-violet-100 text-violet-800" : "bg-slate-200 text-slate-700"}>{n.source[meta.source] ?? meta.source}</Badge>
          {(meta.outsideHours || !profile.window.open) && <Badge tone="bg-amber-100 text-amber-800">{c.ws.phone.outOfHours.badge}</Badge>}
          {meta.province && <span>{n.province}: <b>{meta.province}</b></span>}
          {profile.window.localTime && <span>· {fill(c.ws.profile.window.localTime, { time: profile.window.localTime })}</span>}
          <span>· {fill(n.pool, { n: meta.provincePool })}</span>
        </div>
      )}
      {empty && (
        <div role="status" className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800">
          <p className="font-semibold">{n.none}</p>
          {n.reasons[empty.reason] && <p>{n.reasons[empty.reason]}</p>}
          {empty.nextWindow && <p>{fill(n.nextWindow, { province: empty.nextWindow.province, time: windowTime(empty.nextWindow.opensAt, empty.nextWindow.province, locale) })}</p>}
        </div>
      )}
      {shownCount > 0 && <p className="text-xs text-slate-500">{fill(n.shown, { n: shownCount })}</p>}
    </section>
  );
}
