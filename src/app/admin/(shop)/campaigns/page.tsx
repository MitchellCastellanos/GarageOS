import { ADMIN, adminPath } from "@/lib/routes";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { listCampaigns } from "@/actions/campaigns";
import { formatDate } from "@/lib/utils";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SCHEDULED: "bg-amber-100 text-amber-800",
  SENDING: "bg-blue-100 text-blue-700",
  SENT: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  SCHEDULED: "Programada",
  SENDING: "Enviando",
  SENT: "Enviada",
  CANCELLED: "Cancelada",
};

export default async function CampaignsPage() {
  const campaigns = await listCampaigns();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Campañas</h1>
          <p className="text-slate-500 text-sm mt-1">
            {campaigns.length} campaña{campaigns.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href={`${ADMIN.campaigns}/new`}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva campaña
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Megaphone className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No hay campañas todavía</p>
          <Link
            href={`${ADMIN.campaigns}/new`}
            className="mt-4 inline-flex items-center gap-2 text-blue-600 hover:underline text-sm"
          >
            <Plus className="w-4 h-4" />
            Crear primera campaña
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {campaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={adminPath(`/campaigns/${campaign.id}`)}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-slate-900 text-sm">{campaign.name}</p>
                  <p className="text-slate-500 text-sm">{campaign.subject}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{formatDate(campaign.createdAt)}</span>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[campaign.status] ?? "bg-slate-100 text-slate-500"}`}
                  >
                    {STATUS_LABEL[campaign.status] ?? campaign.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
