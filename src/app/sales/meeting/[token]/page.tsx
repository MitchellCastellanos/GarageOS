import { headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { loadManagedMeeting } from "@/lib/sales-comms/public-booking";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { ManageClient } from "@/components/sales-comms/ManageClient";
import { PublicShell, publicMeta } from "@/components/sales-comms/PublicShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "GarageOS", ...publicMeta };

export default async function ManageMeetingPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { token } = await params;
  const { lang } = await searchParams;
  const h = await headers();
  const r = await loadManagedMeeting(token, clientIpFromHeaders(h));
  if (!r.ok) {
    const t = commsCopy(lang === "fr" ? "fr" : "en").pub;
    return <PublicShell><div role="alert" className="space-y-2 text-center"><h1 className="text-lg font-semibold text-slate-900">{r.error === "RATE_LIMITED" ? t.rateLimited : t.notFoundTitle}</h1>{r.error !== "RATE_LIMITED" && <p className="text-sm text-slate-600">{t.notFoundBody}</p>}</div></PublicShell>;
  }
  const m = r.meeting;
  const language: "EN" | "FR" = lang === "fr" ? "FR" : lang === "en" ? "EN" : m.language;
  const t = commsCopy(language === "FR" ? "fr" : "en").pub;
  const when = new Intl.DateTimeFormat(language === "FR" ? "fr-CA" : "en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: m.timezone, timeZoneName: "short" }).format(new Date(m.startsAt));
  return (
    <PublicShell>
      <div lang={language.toLowerCase()} className="space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">{t.manageTitle}</h1>
        <dl className="space-y-2 text-sm">
          <div><dt className="text-slate-500">{t.manageWhen}</dt><dd className="font-medium text-slate-900">{when}</dd></div>
          <div><dt className="text-slate-500">{t.manageWith}</dt><dd className="font-medium text-slate-900">{m.sellerName}</dd></div>
          <div><dt className="text-slate-500">{t.manageType}</dt><dd className="font-medium text-slate-900">{t.types[m.type]} · {m.durationMinutes} {t.minutes}</dd></div>
          {m.locationDetail && m.status === "SCHEDULED" && <div><dt className="text-slate-500">{m.type === "ON_SITE" ? t.address : t.link}</dt><dd className="break-all text-slate-900">{m.locationDetail}</dd></div>}
          <div><dt className="text-slate-500">{t.status}</dt><dd className="font-medium text-slate-900">{t.statuses[m.status] ?? m.status}</dd></div>
        </dl>
        {m.status === "SCHEDULED" && <a className="inline-flex min-h-11 items-center text-sm text-blue-700 underline" href={`/api/sales/meeting/${token}/ics`}>{t.addToCalendar}</a>}
        <ManageClient token={token} lang={language} canModify={m.canModify} status={m.status} />
      </div>
    </PublicShell>
  );
}
