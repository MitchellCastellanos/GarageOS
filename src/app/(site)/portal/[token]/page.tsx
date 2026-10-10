import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Car, FileText, ClipboardCheck, Wrench, Bell, Receipt } from "lucide-react";
import {
  getPortalClient, getPortalOverview, getPortalShop, resolvePortalAccess,
} from "@/lib/portal";
import { openEstimateForApproval } from "@/actions/portal";
import { canCustomerDecideQuote } from "@/domain/portal";
import { formatClientName } from "@/lib/client-name";
import {
  PORTAL_STRINGS, formatPortalDate, formatPortalDateTime, formatPortalMoney, resolvePortalLang,
} from "@/lib/portal-i18n";
import { PortalShell, PortalSection, PortalEmpty, StatusPill, portalButtonClass, portalLinkClass } from "@/components/portal/PortalShell";
import { PortalLinkExpired } from "@/components/portal/PortalLinkExpired";

export const dynamic = "force-dynamic";

export default async function PortalHomePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolvePortalAccess(token);
  if (!resolved.ok) {
    if (resolved.reason === "INVALID" || resolved.reason === "RATE_LIMITED") notFound();
    return <PortalLinkExpired shopName={resolved.shopName} shopSlug={resolved.shopSlug} />;
  }
  const { access } = resolved;
  const [shop, client, data] = await Promise.all([getPortalShop(access), getPortalClient(access), getPortalOverview(access)]);
  if (!shop || !client) notFound();

  const lang = resolvePortalLang(client.language);
  const t = PORTAL_STRINGS[lang];
  const tz = shop.timezone;
  const bookingUrl = shop.bookingEnabled && shop.slug ? `/book/${shop.slug}` : null;
  const vehicleLabel = (v: { year: number; make: string; model: string }) => `${v.year} ${v.make} ${v.model}`;
  const now = new Date();

  return (
    <PortalShell shop={shop} lang={lang} title={t.greeting(formatClientName(client))} subtitle={t.intro}>
      {bookingUrl && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="min-w-0">
            <p className="font-semibold">{t.book}</p>
            <p className="text-sm text-slate-500">{t.bookHint}</p>
          </div>
          <Link href={bookingUrl} className={`${portalButtonClass} flex-shrink-0`}>{t.book}</Link>
        </div>
      )}

      {data.activeWork.length > 0 && (
        <PortalSection id="p-inshop" title={t.sections.inShop}>
          <ul className="divide-y divide-slate-100">
            {data.activeWork.map((w) => (
              <li key={w.id} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium"><Wrench className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden /><span className="truncate">{vehicleLabel(w.vehicle)}</span></p>
                  <p className="mt-0.5 text-sm text-slate-500">{t.orderNumber(w.orderNumber)} · {w.concern}</p>
                </div>
                <StatusPill tone={w.jobStatus === "READY_FOR_PICKUP" ? "green" : w.jobStatus === "WAITING_APPROVAL" ? "amber" : "blue"}>{t.jobStatus[w.jobStatus] ?? w.jobStatus}</StatusPill>
              </li>
            ))}
          </ul>
        </PortalSection>
      )}

      <PortalSection id="p-appts" title={t.sections.appointments}>
        {data.upcomingAppointments.length === 0 && data.recentAppointments.length === 0 ? (
          <PortalEmpty>{t.empty.appointments}</PortalEmpty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {[...data.upcomingAppointments.map((a) => ({ a, upcoming: true })), ...data.recentAppointments.map((a) => ({ a, upcoming: false }))].map(({ a, upcoming }) => (
              <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium"><CalendarDays className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden /><span className="truncate">{a.title}</span></p>
                  <p className="mt-0.5 text-sm text-slate-500">{formatPortalDateTime(a.startsAt, lang, tz)}{a.vehicle ? ` · ${vehicleLabel(a.vehicle)}` : ""}</p>
                  {upcoming && a.manageToken && shop.slug && (
                    <Link href={`/book/${shop.slug}/manage/${a.manageToken}`} className={`${portalLinkClass} mt-1 inline-block`}>{t.manageAppointment}</Link>
                  )}
                </div>
                <StatusPill tone={upcoming ? "blue" : "slate"}>{upcoming ? t.upcoming : t.recent}</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </PortalSection>

      <PortalSection id="p-estimates" title={t.sections.estimates}>
        {data.quotes.length === 0 ? <PortalEmpty>{t.empty.estimates}</PortalEmpty> : (
          <ul className="divide-y divide-slate-100">
            {data.quotes.map((q) => {
              const decidable = canCustomerDecideQuote(q, now);
              return (
                <li key={q.id} className="space-y-2 px-4 py-3 sm:px-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden />{q.quoteNumber}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{formatPortalDate(q.issuedAt, lang, tz)} · {formatPortalMoney(q.total.toString(), lang)}{q.validUntil && q.status === "SENT" ? ` · ${t.expires(formatPortalDate(q.validUntil, lang, tz))}` : ""}</p>
                    </div>
                    <StatusPill tone={q.status === "SENT" ? "amber" : q.status === "ACCEPTED" || q.status === "CONVERTED" ? "green" : "slate"}>{t.estimateStatus[q.status] ?? q.status}</StatusPill>
                  </div>
                  {decidable && (
                    <form action={async () => { "use server"; await openEstimateForApproval(token, q.id); }}>
                      <button type="submit" className={`${portalButtonClass} w-full sm:w-auto`}>{t.reviewEstimate}</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PortalSection>

      <PortalSection id="p-invoices" title={t.sections.invoices}>
        {data.invoices.length === 0 ? <PortalEmpty>{t.empty.invoices}</PortalEmpty> : (
          <ul className="divide-y divide-slate-100">
            {data.invoices.map((i) => (
              <li key={i.id}>
                <Link href={`/portal/${token}/invoices/${i.id}`} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium"><Receipt className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden />{i.invoiceNumber}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{i.status === "PAID" && i.paidAt ? t.paidOn(formatPortalDate(i.paidAt, lang, tz)) : i.dueAt ? t.dueOn(formatPortalDate(i.dueAt, lang, tz)) : formatPortalDate(i.issuedAt, lang, tz)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-semibold">{formatPortalMoney(i.total.toString(), lang)}</span>
                    <StatusPill tone={i.status === "PAID" ? "green" : i.status === "OVERDUE" ? "red" : "amber"}>{t.invoiceStatus[i.status] ?? i.status}</StatusPill>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PortalSection>

      <PortalSection id="p-vehicles" title={t.sections.vehicles}>
        {data.vehicles.length === 0 ? <PortalEmpty>{t.empty.vehicles}</PortalEmpty> : (
          <ul className="divide-y divide-slate-100">
            {data.vehicles.map((v) => (
              <li key={v.id}>
                <Link href={`/portal/${token}/vehicles/${v.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium"><Car className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden /><span className="truncate">{vehicleLabel(v)}</span></p>
                    <p className="mt-0.5 text-sm text-slate-500">{v.licensePlate}{v.color ? ` · ${v.color}` : ""}</p>
                  </div>
                  <span className={portalLinkClass}>{t.viewHistory}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PortalSection>

      {data.inspections.length > 0 && (
        <PortalSection id="p-dvi" title={t.sections.inspections}>
          <ul className="divide-y divide-slate-100">
            {data.inspections.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <p className="flex min-w-0 items-center gap-2 font-medium"><ClipboardCheck className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden /><span className="truncate">{vehicleLabel(i.vehicle)} · {formatPortalDate(i.createdAt, lang, tz)}</span></p>
                <Link href={`/inspection/${i.shareToken}`} className={portalLinkClass}>{t.viewReport}</Link>
              </li>
            ))}
          </ul>
        </PortalSection>
      )}

      {data.reminders.length > 0 && (
        <PortalSection id="p-reminders" title={t.sections.reminders}>
          <ul className="divide-y divide-slate-100">
            {data.reminders.map((r) => (
              <li key={r.id} className="px-4 py-3 sm:px-5">
                <p className="flex items-center gap-2 font-medium"><Bell className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden />{r.serviceType}</p>
                <p className="mt-0.5 text-sm text-slate-500">{vehicleLabel(r.vehicle)} · {t.dueService(r.dueDate ? formatPortalDate(r.dueDate, lang, tz) : null, r.dueMileage)}</p>
              </li>
            ))}
          </ul>
        </PortalSection>
      )}

      {(shop.phone || shop.email) && (
        <p className="text-center text-sm text-slate-600">
          {t.callShop}: {shop.phone && <a className={portalLinkClass} href={`tel:${shop.phone}`}>{shop.phone}</a>}
          {shop.phone && shop.email ? " · " : ""}
          {shop.email && <a className={portalLinkClass} href={`mailto:${shop.email}`}>{shop.email}</a>}
        </p>
      )}
      <p className="text-center text-xs text-slate-400">{t.privacy}</p>
    </PortalShell>
  );
}
