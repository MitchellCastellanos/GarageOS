import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ADMIN } from "@/lib/routes";
import { getReminderRules } from "@/actions/reminder-rules";
import { getShopId } from "@/lib/shop-context";
import { canView } from "@/lib/subscription";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { REMINDER_RULES_DICT } from "@/lib/admin-locale/reminder-rules";
import { RuleManager } from "@/components/reminders/RuleManager";
import { UpgradeCTA } from "@/components/billing/UpgradeCTA";

export default async function ReminderRulesPage() {
  const t = REMINDER_RULES_DICT[await getAdminLocale()];
  const shopId = await getShopId();
  const entitled = await canView(shopId, "reminders.automation");
  const rules = entitled ? await getReminderRules() : [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={ADMIN.reminders} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-2">
          <ArrowLeft className="w-4 h-4" />
          {t.back}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.subtitle}</p>
      </div>
      {entitled ? (
        <RuleManager rules={rules.map((r) => ({ id: r.id, name: r.name, keyword: r.keyword, intervalMonths: r.intervalMonths, intervalKm: r.intervalKm, leadDays: r.leadDays, isActive: r.isActive }))} />
      ) : (
        <UpgradeCTA requiredPlan="PRO" title={t.locked.title} description={t.locked.description} ctaLabel={t.locked.cta} />
      )}
    </div>
  );
}
