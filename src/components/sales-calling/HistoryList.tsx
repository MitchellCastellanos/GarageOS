"use client";

import type { CallingCopy } from "@/lib/admin-locale/sales-calling";
import { crmCopy } from "@/lib/admin-locale/sales-crm";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import type { WorkspaceProfile } from "@/lib/voice/workspace-types";
import { Badge } from "@/components/sales-crm/ui";
import { fill, fmtDateTime, type Locale } from "./shared";

export type HistoryKind = "CALL" | "EMAIL" | "MEETING" | "TASK" | "DEMO" | "ACTIVITY";
export interface HistoryItem { id: string; kind: HistoryKind; at: string; title: string; detail: string | null }

/** One chronological list (newest first) built ONLY from the loaded profile: calls, emails, meetings, open follow-ups and CRM activities (DEMO activities shown as demos). */
export function buildHistory(p: WorkspaceProfile, c: CallingCopy, locale: Locale): HistoryItem[] {
  const crm = crmCopy(locale), comms = commsCopy(locale), pr = c.ws.profile;
  const outcomes = c.disposition.outcomes as Record<string, string>;
  const items: HistoryItem[] = [
    ...p.calls.map((x) => ({ id: `call-${x.id}`, kind: "CALL" as const, at: x.requestedAt, title: x.disposition ? outcomes[x.disposition] ?? x.disposition : `${pr.callStates[x.state] ?? x.state} · ${pr.noOutcome}`, detail: x.durationSec ? fill(pr.seconds, { n: x.durationSec }) : null })),
    ...p.emails.map((x) => ({ id: `email-${x.id}`, kind: "EMAIL" as const, at: x.at, title: x.subject ?? comms.inbox.noSubject, detail: [pr.emailKinds[x.kind] ?? x.kind, x.status ? comms.status[x.status] ?? x.status : null].filter(Boolean).join(" · ") })),
    ...p.meetings.map((x) => ({ id: `meeting-${x.id}`, kind: "MEETING" as const, at: x.startsAt, title: `${comms.calendar.types[x.type] ?? x.type} · ${comms.calendar.statuses[x.status] ?? x.status}`, detail: x.outcome ? comms.calendar.outcomes[x.outcome] ?? x.outcome : null })),
    ...p.tasks.map((x) => ({ id: `task-${x.id}`, kind: "TASK" as const, at: x.dueAt, title: x.title, detail: `${crm.taskTypes[x.type] ?? x.type} · ${c.ws.history.due}` })),
    ...p.activities.map((a) => ({
      id: `act-${a.id}`, kind: (a.type === "DEMO" ? "DEMO" : "ACTIVITY") as HistoryKind, at: a.occurredAt,
      title: [crm.activityTypes[a.type] ?? a.type, a.outcome ? crm.outcomes[a.outcome] ?? a.outcome : null, a.subject].filter(Boolean).join(" · "), detail: a.body,
    })),
  ];
  return items.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
}

const TONE: Record<HistoryKind, string> = { CALL: "bg-emerald-100 text-emerald-800", EMAIL: "bg-sky-100 text-sky-800", MEETING: "bg-violet-100 text-violet-800", TASK: "bg-amber-100 text-amber-800", DEMO: "bg-indigo-100 text-indigo-800", ACTIVITY: "bg-slate-100 text-slate-700" };

export function HistoryList({ c, locale, timezone, profile, limit }: { c: CallingCopy; locale: Locale; timezone: string; profile: WorkspaceProfile | null; limit?: number }) {
  const items = profile ? buildHistory(profile, c, locale) : [];
  const list = limit ? items.slice(0, limit) : items;
  if (list.length === 0) return <p className="text-sm text-slate-500">{c.ws.history.empty}</p>;
  return (
    <ol className="divide-y divide-slate-100">
      {list.map((i) => (
        <li key={i.id} className="flex min-w-0 gap-2 py-1.5 text-sm">
          <Badge tone={TONE[i.kind]}>{c.ws.history.kinds[i.kind]}</Badge>
          <div className="min-w-0 flex-1">
            <p className="break-words text-slate-900">{i.title}</p>
            <p className="break-words text-xs text-slate-500">{fmtDateTime(i.at, locale, timezone)}{i.detail ? ` · ${i.detail}` : ""}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
