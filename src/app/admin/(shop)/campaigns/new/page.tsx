import { ADMIN } from "@/lib/routes";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CampaignForm } from "@/components/campaigns/CampaignForm";

export default function NewCampaignPage() {
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
        <h1 className="text-2xl font-bold text-slate-900">Nueva campaña</h1>
        <p className="text-slate-500 text-sm mt-1">
          Se guarda como borrador — revisa la audiencia y envía una prueba antes de programarla.
        </p>
      </div>

      <CampaignForm />
    </div>
  );
}
