import { ADMIN } from "@/lib/routes";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CampaignForm } from "@/components/campaigns/CampaignForm";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { CAMPAIGNS_DICT } from "@/lib/admin-locale/campaigns";

export default async function NewCampaignPage() {
  const locale = await getAdminLocale();
  const t = CAMPAIGNS_DICT[locale];

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href={ADMIN.campaigns}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        {t.newPage.backLink}
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.newPage.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.newPage.subtitle}</p>
      </div>

      <CampaignForm />
    </div>
  );
}
