import { notFound } from "next/navigation";
import { getQuoteForApproval } from "@/lib/quote-approval";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatClientName } from "@/lib/client-name";
import { QuoteApprovalForm } from "@/components/quotes/QuoteApprovalForm";
import { getQuoteApprovalStrings, type QuoteApprovalLanguage } from "@/lib/quote-approval-i18n";

function resolveLanguage(language: string | null | undefined): QuoteApprovalLanguage {
  return language === "FR" ? "FR" : "EN";
}

export default async function PublicQuoteApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const quote = await getQuoteForApproval(token);
  if (!quote) notFound();

  const language = resolveLanguage(quote.language);
  const t = getQuoteApprovalStrings(language);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="rounded-2xl bg-slate-900 px-6 py-7 text-white shadow-sm sm:px-8">
          <p className="text-sm font-medium text-blue-200">{quote.shop.name}</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{t.title(quote.quoteNumber)}</h1>
          <p className="mt-2 text-sm text-slate-300">{t.intro}</p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.client}</p>
              <p className="mt-1 font-semibold text-slate-900">{formatClientName(quote.client)}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.validUntil}</p>
              <p className="mt-1 font-semibold text-slate-900">
                {quote.validUntil ? formatDate(quote.validUntil) : t.noExpiry}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-5">
            {quote.vehicles.map((vehicle) => (
              <div key={vehicle.id}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h2 className="font-semibold text-slate-900">
                    {vehicle.vehicle.year} {vehicle.vehicle.make} {vehicle.vehicle.model}
                  </h2>
                  <span className="text-xs text-slate-500">{vehicle.vehicle.licensePlate}</span>
                </div>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                  {vehicle.lineItems.map((item) => (
                    <div key={item.id} className="flex justify-between gap-4 px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium text-slate-800">{item.description}</p>
                        <p className="text-xs text-slate-400">{Number(item.quantity)} × {formatCurrency(Number(item.unitPrice))}</p>
                      </div>
                      <p className="font-semibold text-slate-900">{formatCurrency(Number(item.lineTotal))}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {quote.notes && (
            <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Notas</p>
              <p className="whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}

          <div className="mt-6 space-y-2 border-t border-slate-200 pt-5 text-sm">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatCurrency(Number(quote.subtotal))}</span></div>
            <div className="flex justify-between text-slate-600"><span>Impuestos</span><span>{formatCurrency(Number(quote.taxAmount))}</span></div>
            <div className="flex justify-between pt-2 text-lg font-bold text-slate-900"><span>Total CAD</span><span className="text-blue-600">{formatCurrency(Number(quote.total))}</span></div>
          </div>
        </section>

        <QuoteApprovalForm token={token} shopName={quote.shop.name} />
        <p className="text-center text-xs text-slate-400">Este enlace es privado y solo puede utilizarse una vez.</p>
      </div>
    </main>
  );
}

export function generateMetadata() {
  return { title: "Revisar cotización | GarageOS" };
}
