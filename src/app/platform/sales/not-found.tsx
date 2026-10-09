import Link from "next/link";
import { PLATFORM } from "@/lib/routes";

export default function SalesNotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Not found · Introuvable</h1>
      <p className="mt-2 text-sm text-slate-600">This record does not exist or is not assigned to you. · Cet enregistrement n’existe pas ou ne vous est pas assigné.</p>
      <Link href={PLATFORM.sales} className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">← GarageOS</Link>
    </div>
  );
}
