import Link from "next/link";
import { notFound } from "next/navigation";
import Decimal from "decimal.js";
import { getPortalInvoice, resolvePortalAccess, getPortalShop } from "@/lib/portal";
import { effectiveTaxSnapshot } from "@/domain/fiscal";
import { PORTAL_STRINGS, formatPortalDate, formatPortalMoney, resolvePortalLang } from "@/lib/portal-i18n";
import { PortalShell, PortalSection, PortalEmpty, StatusPill, portalButtonClass, portalLinkClass } from "@/components/portal/PortalShell";
import { PortalLinkExpired } from "@/components/portal/PortalLinkExpired";

export const dynamic = "force-dynamic";

export default async function PortalInvoicePage({ params }: { params: Promise<{ token: string; invoiceId: string }> }) {
  const { token, invoiceId } = await params;
  const resolved = await resolvePortalAccess(token);
  if (!resolved.ok) {
    if (resolved.reason === "INVALID" || resolved.reason === "RATE_LIMITED") notFound();
    return <PortalLinkExpired shopName={resolved.shopName} shopSlug={resolved.shopSlug} />;
  }
  const { access } = resolved;
  const [shop, invoice] = await Promise.all([getPortalShop(access), getPortalInvoice(access, invoiceId)]);
  if (!shop || !invoice) notFound();

  const lang = resolvePortalLang(invoice.client.language);
  const t = PORTAL_STRINGS[lang];
  const tz = shop.timezone;
  const money = (v: Decimal.Value) => formatPortalMoney(new Decimal(v).toFixed(2), lang);
  // Impuestos: SIEMPRE del snapshot emitido (Block 9), nunca de la configuración actual del taller.
  const taxes = effectiveTaxSnapshot(invoice).lines;
  const refunded = invoice.refunds.reduce((sum, r) => sum.plus(r.amount.toString()), new Decimal(0));

  return (
    <PortalShell shop={shop} lang={lang} title={t.invoice.title(invoice.invoiceNumber)} subtitle={`${t.invoice.issued} ${formatPortalDate(invoice.issuedAt, lang, tz)}`}>
      <Link href={`/portal/${token}`} className={portalLinkClass}>← {t.back}</Link>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-1">
          <StatusPill tone={invoice.status === "PAID" ? "green" : invoice.status === "OVERDUE" ? "red" : "amber"}>{t.invoiceStatus[invoice.status] ?? invoice.status}</StatusPill>
          <p className="text-2xl font-bold">{money(invoice.total.toString())}</p>
          <p className="text-sm text-slate-500">{invoice.status === "PAID" && invoice.paidAt ? t.paidOn(formatPortalDate(invoice.paidAt, lang, tz)) : invoice.dueAt ? t.dueOn(formatPortalDate(invoice.dueAt, lang, tz)) : ""}</p>
        </div>
        <a href={`/portal/${token}/invoices/${invoice.id}/pdf`} className={portalButtonClass}>{t.downloadPdf}</a>
      </div>

      {invoice.vehicles.map((iv) => (
        <PortalSection key={iv.id} id={`iv-${iv.id}`} title={`${iv.vehicle.year} ${iv.vehicle.make} ${iv.vehicle.model}`}>
          <ul className="divide-y divide-slate-100">
            {iv.lineItems.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">{l.description}</p>
                  <p className="text-xs text-slate-500">{t.invoice.qty} {Number(l.quantity)} × {money(l.unitPrice.toString())}</p>
                </div>
                <p className="font-semibold">{money(l.lineTotal.toString())}</p>
              </li>
            ))}
          </ul>
        </PortalSection>
      ))}

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm sm:p-5">
        <div className="flex justify-between text-slate-600"><span>{t.invoice.subtotal}</span><span>{money(invoice.subtotal.toString())}</span></div>
        {taxes.map((tax) => (
          <div key={tax.name} className="flex justify-between text-slate-600"><span>{tax.name}</span><span>{money(tax.amount)}</span></div>
        ))}
        <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold"><span>{t.invoice.total}</span><span>{money(invoice.total.toString())}</span></div>
        {refunded.gt(0) && <div className="flex justify-between text-slate-600"><span>{t.invoice.refunded}</span><span>−{money(refunded)}</span></div>}
      </section>

      <PortalSection id="iv-payments" title={t.invoice.payments}>
        {invoice.paymentEntries.length === 0 ? <PortalEmpty>{t.invoice.noPayments}</PortalEmpty> : (
          <ul className="divide-y divide-slate-100">
            {invoice.paymentEntries.map((p) => (
              <li key={p.id} className="flex justify-between px-4 py-3 text-sm sm:px-5">
                <span>{t.invoice.method[p.method] ?? p.method}</span><span className="font-medium">{money(p.amount.toString())}</span>
              </li>
            ))}
          </ul>
        )}
      </PortalSection>
    </PortalShell>
  );
}
