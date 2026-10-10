import { formatDate } from "@/components/sales-crm/ui";
import { VIDEO_CRM_COPY } from "@/lib/admin-locale/sales-video";
import type { videoSummaryForProspect } from "@/lib/sales-video";

/** Compact per-prospect video summary. The caller has already passed the prospect scope check, so ownership rules are inherited. */
export function VideoEngagement({ locale, rows, className }: { locale: "en" | "fr"; rows: Awaited<ReturnType<typeof videoSummaryForProspect>>; className: string }) {
  const c = VIDEO_CRM_COPY[locale];
  return (
    <section className={className} aria-labelledby="video-h">
      <h2 id="video-h" className="mb-3 font-semibold text-slate-900">{c.title}</h2>
      {rows.length === 0 ? <p className="text-sm text-slate-500">{c.empty}</p> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-900">{c.languages[r.language]} · {c.kinds[r.kind]}</p>
              <p className="text-slate-700">{c.progress[r.progress]}{r.cta ? ` · ${c.demoAsked}` : ""}</p>
              <p className="text-xs text-slate-500">{c.sent} {formatDate(r.createdAt, locale, false)}{r.lastEventAt ? ` · ${c.lastActivity} ${formatDate(r.lastEventAt, locale, true)}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500">{c.hint}</p>
    </section>
  );
}
