import Link from "next/link";
import { db } from "@/lib/db";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { PLATFORM } from "@/lib/routes";
import { Badge, EmptyState, PageHeader, PermissionDenied, btnPrimary, btnSecondary, cardCls } from "@/components/sales-crm/ui";
import { composeProspects, meetingsBetween } from "@/lib/sales-comms/queries";
import { addShopDays, formatShopDate, getShopDayOfWeek, parseShopDateTime } from "@/lib/shop-timezone";
import { loadSellerCalendar } from "@/lib/sales-comms/meetings";
import { MeetingActions, NewMeetingForm } from "@/components/sales-comms/MeetingActions";
import { InboxRealtime } from "@/components/sales-comms/InboxRealtime";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const VIEWS = ["day", "week", "month"] as const;
type View = (typeof VIEWS)[number];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { actor, t: crm, locale } = await loadCrmPage("manage_calendar");
  if (!actor) return <PermissionDenied t={crm} />;
  const t = commsCopy(locale);
  const c = t.calendar;
  const sp = await searchParams;
  const staffRow = actor.staffId ? await db.platformSalesStaff.findUnique({ where: { id: actor.staffId }, select: { timezone: true } }) : null;
  const tz = staffRow?.timezone ?? "America/Toronto";
  const view: View = (VIEWS as readonly string[]).includes(one(sp.view)) ? (one(sp.view) as View) : "week";
  const today = formatShopDate(new Date(), tz);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.date)) ? one(sp.date) : today;

  // Visible local-date window [from, to) for the view, in the viewer's timezone.
  const dow = getShopDayOfWeek(date, tz);
  let from = date, days = 1;
  if (view === "week") { from = addShopDays(date, -((dow + 6) % 7), tz); days = 7; }
  if (view === "month") {
    const first = `${date.slice(0, 7)}-01`;
    const fdow = getShopDayOfWeek(first, tz);
    from = addShopDays(first, -((fdow + 6) % 7), tz);
    const next = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 1)); // first of next month (UTC math on a date-only value)
    const nextStr = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
    let n = 0; let d = from; while (d < nextStr || n % 7 !== 0) { d = addShopDays(d, 1, tz); n++; }
    days = n;
  }
  const start = parseShopDateTime(from, "00:00", tz);
  const end = parseShopDateTime(addShopDays(from, days, tz), "00:00", tz);
  const mine = one(sp.seller) !== "all" && !!actor.staffId;
  const [meetings, prospects] = await Promise.all([meetingsBetween(actor, start, end, mine ? actor.staffId : null), composeProspects(actor)]);
  const cal = actor.staffId ? await loadSellerCalendar(actor.staffId) : null;

  const step = view === "month" ? 28 : view === "week" ? 7 : 1;
  const nav = (d: string, v: View = view) => `${PLATFORM.salesCalendar}?view=${v}&date=${d}${mine ? "" : "&seller=all"}`;
  const prev = view === "month" ? `${new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7)}-01` : addShopDays(date, -step, tz);
  const nextD = view === "month" ? `${new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 1)).toISOString().slice(0, 7)}-01` : addShopDays(date, step, tz);
  const fmtTime = (d: Date) => new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", { timeStyle: "short", timeZone: tz }).format(d);
  const fmtDay = (ds: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", { ...opts, timeZone: tz }).format(parseShopDateTime(ds, "12:00", tz));
  const byDay = new Map<string, typeof meetings>();
  for (const m of meetings) { const k = formatShopDate(m.startsAt, tz); byDay.set(k, [...(byDay.get(k) ?? []), m]); }
  const dayList = Array.from({ length: days }, (_, i) => addShopDays(from, i, tz));
  const now = new Date();
  const tone = (s: string) => (s === "CANCELLED" ? "bg-slate-200 text-slate-600" : s === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : s === "NO_SHOW" ? "bg-rose-100 text-rose-800" : "bg-blue-100 text-blue-800");

  const card = (m: (typeof meetings)[number], compact = false) => (
    <li key={m.id} className={`${cardCls} ${m.status === "CANCELLED" ? "opacity-60" : ""} ${compact ? "p-3 text-sm" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-slate-900">{fmtTime(m.startsAt)}–{fmtTime(m.endsAt)} · {m.attendeeName}</p>
        <Badge tone={tone(m.status)}>{c.statuses[m.status]}</Badge>
      </div>
      <p className="break-words text-sm text-slate-600">{c.types[m.type]} · {m.durationMinutes} {c.minutes}{!mine ? ` · ${m.staff.displayName ?? m.staff.user.name}` : ""}</p>
      <p className="break-words text-xs text-slate-500">{m.prospectId ? <Link className="text-blue-700 hover:underline" href={PLATFORM.salesProspect(m.prospectId)}>{c.openProspect}</Link> : c.unlinked} · {m.attendeeEmail}{m.outcome ? ` · ${c.outcomes[m.outcome]}` : ""}</p>
      {m.locationDetail && <p className="break-all text-xs text-slate-500">{m.locationDetail}</p>}
      {!compact && <div className="mt-2"><MeetingActions locale={locale} id={m.id} status={m.status} started={m.startsAt <= now} linked={!!m.prospectId} timezone={m.staffTimezone} prospects={prospects.map((p) => ({ id: p.id, name: p.name }))} /></div>}
    </li>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title={c.title} subtitle={c.subtitle} actions={<><Link className={btnSecondary} href={PLATFORM.salesAvailability}>{c.availability}</Link></>} />
      <InboxRealtime userId={actor.userId} locale={locale} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Link className={btnSecondary} href={nav(prev)} aria-label={c.prev}>←</Link>
          <Link className={btnSecondary} href={nav(today)}>{c.today}</Link>
          <Link className={btnSecondary} href={nav(nextD)} aria-label={c.next}>→</Link>
        </div>
        <h2 className="text-lg font-semibold capitalize text-slate-900">{view === "month" ? fmtDay(date, { month: "long", year: "numeric" }) : view === "week" ? `${fmtDay(from, { month: "short", day: "numeric" })} – ${fmtDay(addShopDays(from, 6, tz), { month: "short", day: "numeric", year: "numeric" })}` : fmtDay(date, { dateStyle: "full" })}</h2>
        <nav className="flex gap-2" aria-label={c.title}>{VIEWS.map((v) => <Link key={v} href={nav(date, v)} className={v === view ? btnPrimary : btnSecondary} aria-current={v === view ? "page" : undefined}>{c[v]}</Link>)}</nav>
      </div>
      <p className="text-xs text-slate-500">{c.yourTimezone} {tz}.{(actor.all || actor.kind === "SALES_MANAGER") && actor.staffId ? <> <Link className="text-blue-700 underline" href={mine ? `${nav(date)}&seller=all` : nav(date).replace("&seller=all", "")}>{mine ? c.upcomingTeam : c.seller + ": " + t.common.mine}</Link></> : null}</p>

      {meetings.length === 0 && <EmptyState title={c.noMeetings} />}
      {view === "day" && meetings.length > 0 && <ul className="space-y-3">{meetings.map((m) => card(m))}</ul>}
      {view === "week" && meetings.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-7">
          {dayList.map((d) => (
            <section key={d} aria-label={fmtDay(d, { dateStyle: "full" })} className={`min-w-0 rounded-xl border p-2 ${d === today ? "border-blue-300 bg-blue-50/40" : "border-slate-200 bg-slate-50"}`}>
              <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">{fmtDay(d, { weekday: "short", day: "numeric" })}</h3>
              <ul className="space-y-2">{(byDay.get(d) ?? []).map((m) => card(m, true))}</ul>
            </section>
          ))}
        </div>
      )}
      {view === "month" && (
        <div role="grid" aria-label={fmtDay(date, { month: "long", year: "numeric" })} className="grid grid-cols-7 gap-1 text-xs max-sm:hidden">
          {dayList.map((d) => {
            const list = byDay.get(d) ?? [];
            return (
              <Link role="gridcell" key={d} href={nav(d, "day")} className={`min-h-20 min-w-0 rounded-lg border p-1.5 ${d === today ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"} ${d.slice(0, 7) !== date.slice(0, 7) ? "opacity-50" : ""}`}>
                <span className="font-semibold text-slate-700">{Number(d.slice(8))}</span>
                {list.slice(0, 2).map((m) => <span key={m.id} className="mt-0.5 block truncate rounded bg-blue-100 px-1 text-blue-900">{fmtTime(m.startsAt)} {m.attendeeName}</span>)}
                {list.length > 2 && <span className="block text-slate-500">+{list.length - 2}</span>}
              </Link>
            );
          })}
        </div>
      )}
      {view === "month" && meetings.length > 0 && <ul className="space-y-2 sm:hidden">{meetings.map((m) => <li key={m.id}><Link href={nav(formatShopDate(m.startsAt, tz), "day")} className={`${cardCls} block text-sm`}><b>{fmtDay(formatShopDate(m.startsAt, tz), { day: "numeric", month: "short" })} {fmtTime(m.startsAt)}</b> · {m.attendeeName}</Link></li>)}</ul>}

      <details className={cardCls} open={!!one(sp.new)}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-slate-900">{c.newMeeting}</summary>
        <div className="pt-3">
          <NewMeetingForm locale={locale} timezone={tz} durations={cal?.durations ?? [30, 45, 60]} types={cal?.meetingTypes ?? ["VIDEO", "PHONE", "ON_SITE"]} defaultProspect={one(sp.prospect)}
            prospects={prospects.map((p) => ({ id: p.id, name: p.name, contacts: p.contacts.map((x) => ({ id: x.id, name: x.name, email: x.email, language: x.preferredLanguage === "FR" || x.preferredLanguage === "EN" ? x.preferredLanguage : null })) }))} />
        </div>
      </details>
      <p className="text-xs text-slate-500">{c.reminders} {c.syncTitle}: {c.syncBody}</p>
    </div>
  );
}
