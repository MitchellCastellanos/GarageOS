import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";
import { ClientForm } from "@/components/clients/ClientForm";
import { createClient } from "@/actions/clients";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { CLIENTS_DICT } from "@/lib/admin-locale/clients";

export default async function NewClientPage() {
  const locale = await getAdminLocale();
  const t = CLIENTS_DICT[locale];

  return (
    <div className="max-w-2xl">
      {/* Breadcrumb */}
      <Link
        href={ADMIN.clients}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        {t.list.title}
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">{t.list.newClient}</h1>
      <p className="text-slate-500 text-sm mb-6">{t.new.subtitle}</p>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <ClientForm onSubmit={createClient} />
      </div>
    </div>
  );
}
