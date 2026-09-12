import type { DnsRecordRow } from "@/lib/domains/types";

export interface DomainInfo {
  domain: string;
  status: "PENDING" | "VERIFIED" | "FAILED";
  dnsRecords: DnsRecordRow[];
  verifiedAt: Date | string | null;
}

const STATUS_STYLES: Record<DomainInfo["status"], string> = {
  VERIFIED: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-800",
  FAILED: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<DomainInfo["status"], string> = {
  VERIFIED: "Verificado",
  PENDING: "Pendiente",
  FAILED: "Falló",
};

export function StatusBadge({ status }: { status: DomainInfo["status"] }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function DnsRecordsTable({ records }: { records: DnsRecordRow[] }) {
  if (records.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">Tipo</th>
            <th className="px-3 py-2 font-semibold">Nombre</th>
            <th className="px-3 py-2 font-semibold">Valor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((r, i) => (
            <tr key={i}>
              <td className="px-3 py-2 font-mono text-slate-700">{r.type}</td>
              <td className="px-3 py-2 font-mono text-slate-700 break-all">{r.name}</td>
              <td className="px-3 py-2 font-mono text-slate-700 break-all">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

