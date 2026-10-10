import Link from "next/link";
import { db } from "@/lib/db";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { commsCopy } from "@/lib/admin-locale/sales-comms";
import { PLATFORM } from "@/lib/routes";
import { EmptyState, PageHeader, PermissionDenied, cardCls } from "@/components/sales-crm/ui";
import { loadSellerCalendar } from "@/lib/sales-comms/meetings";
import { AvailabilityForm, BookingLinkPanel, ExceptionForm, RemoveException } from "@/components/sales-comms/AvailabilityForm";

export default async function AvailabilityPage() {
  const { actor, t: crm, locale } = await loadCrmPage("manage_calendar");
  if (!actor) return <PermissionDenied t={crm} />;
  const t = commsCopy(locale);
  const c = t.calendar;
  if (!actor.staffId) return <div className="mx-auto max-w-2xl"><EmptyState title={t.errors.NO_STAFF_PROFILE} /></div>;
  const cal = await loadSellerCalendar(actor.staffId);
  const exceptions = await db.crmAvailabilityException.findMany({ where: { staffId: actor.staffId, endsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" }, take: 50 });
  const fmt = (d: Date) => new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: cal.timezone }).format(d);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={PLATFORM.salesCalendar} className="inline-flex min-h-11 items-center text-sm text-blue-700">← {c.title}</Link>
      <PageHeader title={c.availabilityTitle} />
      <section className={cardCls}><AvailabilityForm locale={locale} initial={{ timezone: cal.timezone, weekly: cal.weekly, buffer: cal.bufferMinutes, durations: cal.durations, types: cal.meetingTypes, joinUrl: cal.joinUrl ?? "", bookingEnabled: cal.bookingEnabled }} /></section>
      <section className={cardCls} aria-labelledby="link-h"><h2 id="link-h" className="mb-2 font-semibold text-slate-900">{c.yourLink}</h2><BookingLinkPanel locale={locale} /></section>
      <section className={cardCls} aria-labelledby="ex-h">
        <h2 id="ex-h" className="mb-3 font-semibold text-slate-900">{c.daysOff}</h2>
        <ExceptionForm locale={locale} timezone={cal.timezone} />
        {exceptions.length > 0 && <ul className="mt-4 space-y-2">{exceptions.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{x.kind === "OFF" ? c.off : c.extra}: {fmt(x.startsAt)} → {fmt(x.endsAt)}{x.reason ? ` · ${x.reason}` : ""}</span><RemoveException locale={locale} id={x.id} /></li>)}</ul>}
      </section>
      <section className={`${cardCls} text-sm text-slate-600`}><h2 className="font-semibold text-slate-900">{c.syncTitle}</h2><p className="mt-1">{c.syncBody}</p></section>
    </div>
  );
}
