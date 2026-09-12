import { notFound } from "next/navigation";
import { ADMIN } from "@/lib/routes";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCampaignDetail } from "@/actions/campaigns";
import { formatDate } from "@/lib/utils";
import { CampaignActions } from "@/components/campaigns/CampaignActions";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  SCHEDULED: "Programada",
  SENDING: "Enviando",
  SENT: "Enviada",
  CANCELLED: "Cancelada",
};

const RECIPIENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendientes",
  SENT: "Enviados",
  DELIVERED: "Entregados",
  FAILED: "Fallidos",
  BOUNCED: "Rebotados",
  SKIPPED_SUPPRESSED: "Omitidos (suprimidos)",
  SKIPPED_NO_CONSENT: "Omitidos (sin consentimiento)",
};

export default async function CampaignDetailPage({ params }: PageProps) {
  const { id } = await params;
  const detail = await getCampaignDetail(id);
  if (!detail) notFound();

  const { campaign, counts } = detail;
  const total = counts.reduce((sum, c) => sum + c._count._all, 0);

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href={ADMIN.campaigns}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Campañas
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{campaign.name}</h1>
        <p className="text-slate-500 text-sm mt-1">
          {STATUS_LABEL[campaign.status] ?? campaign.status} · Creada {formatDate(campaign.createdAt)}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase mb-1">Asunto</p>
          <p className="text-sm text-slate-900">{campaign.subject}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase mb-1">Mensaje</p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{campaign.bodyHtml}</p>
        </div>
      </div>

      {total > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Audiencia ({total})</h2>
          <div className="grid grid-cols-2 gap-3">
            {counts.map((c) => (
              <div key={c.status} className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{RECIPIENT_STATUS_LABEL[c.status] ?? c.status}</span>
                <span className="font-semibold text-slate-900">{c._count._all}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <CampaignActions campaignId={campaign.id} status={campaign.status} />
    </div>
  );
}
