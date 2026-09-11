import { getCashDrawerEntries } from "@/actions/cash-drawer";
import { CashDrawerClient } from "@/components/caja/CashDrawerClient";

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function CajaPage({ searchParams }: PageProps) {
  const { date } = await searchParams;
  const { entries, summary, date: selectedDate } = await getCashDrawerEntries(date);

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
        <h1 className="text-2xl font-bold text-slate-900">Caja</h1>
        <p className="text-slate-500 text-sm mt-1">
          Seguimiento interno de efectivo en el taller — saldo de apertura, cobros, gastos y ajustes
        </p>
      </div>

      <CashDrawerClient
        entries={serializedEntries}
        summary={summary}
        date={selectedDate}
      />
    </div>
  );
}
