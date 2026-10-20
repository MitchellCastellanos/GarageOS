"use client";

import type { ReactNode } from "react";
import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import { crmCopy } from "@/lib/admin-locale/sales-crm";
import type { WorkspaceProfile } from "@/lib/voice/workspace-types";
import { Badge, StageBadge } from "@/components/sales-crm/ui";
import { AlertIcon } from "./icons";
import { fill, type Locale } from "./shared";

/** Compact one-glance summary of the loaded prospect plus a one-line lock/warning area. Pure props → markup. */
export function ProspectHeader({ c, locale, profile, warning }: { c: CallingCopy; locale: Locale; profile: WorkspaceProfile | null; warning: ReactNode }) {
  const h = c.ws.header;
  const p = c.ws.profile;
  const crm = crmCopy(locale);
  const dm = profile?.contacts.find((x) => x.isDecisionMaker) ?? null;
  const hasEmail = !!profile?.contacts.some((x) => !!x.email);
  const basis = !!profile?.contacts.some((x) => x.emailStatus === "valid");
  const yes = "bg-emerald-100 text-emerald-800", no = "bg-slate-100 text-slate-600";
  return (
    <section aria-label={h.region} className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
      {!profile ? <p className="text-sm text-slate-600">{h.none}</p> : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold leading-tight text-slate-900">{profile.name}</h2>
            <p className="truncate text-xs text-slate-600">{[profile.city, profile.province].filter(Boolean).join(", ") || p.notRecorded}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge tone={profile.window.open ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{profile.window.open ? "● " : "○ "}{profile.window.open ? p.window.open : p.window.closed}</Badge>
            {profile.window.localTime && <span className="text-slate-700">{fill(p.window.localTime, { time: profile.window.localTime })}</span>}
            <Badge tone="bg-blue-50 text-blue-800">{crm.languages[profile.language] ?? profile.language}</Badge>
            <Badge tone={profile.repairFit === "VERIFIED_REPAIR" ? yes : profile.repairFit === "EXCLUDED" ? "bg-red-100 text-red-800" : no}>{profile.repairFit ? p.repairFits[profile.repairFit] : `${p.repairFit}: ${p.notRecorded}`}</Badge>
            {profile.stage ? <StageBadge stage={profile.stage} t={crm} /> : <Badge tone={no}>{p.noStage}</Badge>}
          </div>
          <ul aria-label={p.contacts} className="flex flex-wrap items-center gap-1.5 text-xs">
            <li><Badge tone={dm ? yes : no}>{dm ? `✓ ${h.dmKnown}${dm.title ? ` (${dm.title})` : ""}` : `– ${h.dmUnknown}`}</Badge></li>
            <li><Badge tone={hasEmail ? yes : no}>{hasEmail ? `✓ ${h.emailKnown}` : `– ${h.emailUnknown}`}</Badge></li>
            <li><Badge tone={basis ? yes : no}>{basis ? `✓ ${h.basisValid}` : `– ${h.basisNone}`}</Badge></li>
            {profile.doNotContact && <li><Badge tone="bg-red-100 text-red-800">⛔ {p.contactDnc}</Badge></li>}
          </ul>
        </div>
      )}
      {warning && <div className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-amber-900"><AlertIcon className="mt-0.5 size-3.5" /><div className="min-w-0">{warning}</div></div>}
    </section>
  );
}
