import { getCashDrawerEntries } from "@/actions/cash-drawer";
import { CashDrawerClient } from "@/components/caja/CashDrawerClient";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { CAJA_DICT } from "@/lib/admin-locale/caja";

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function CajaPage({ searchParams }: PageProps) {
  const { date } = await searchParams;
  const { entries, summary, date: selectedDate } = await getCashDrawerEntries(date);
  const locale = await getAdminLocale();
  const t = CAJA_DICT[locale].cashDrawerPage;

  const serializedEntries = entries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    amount: Number(entry.amount),
    description: entry.description,
    occurredAt: entry.occurredAt.toISOString(),
    linkedInvoice: entry.linkedInvoice,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.subtitle}</p>
      </div>

      <CashDrawerClient
        entries={serializedEntries}
        summary={summary}
        date={selectedDate}
      />
    </div>
  );
}
