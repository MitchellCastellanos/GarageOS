import { ADMIN } from "@/lib/routes";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAdminLocale } from "@/lib/get-admin-locale";
import { getShopSettings } from "@/actions/settings";
import { getShopDomains } from "@/actions/domains";
import { getCommunicationSettings } from "@/actions/communications-settings";
import { MailboxesCard } from "@/components/settings/MailboxesCard";
import { EmailDomainCard } from "@/components/settings/EmailDomainCard";
import { CommunicationRoutesCard } from "@/components/settings/CommunicationRoutesCard";
import { NOTIFICATIONS_DICT } from "@/lib/admin-locale/notifications";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect(ADMIN.login);
  if (session.user.role !== "OWNER") redirect(ADMIN.dashboard);

  const locale = await getAdminLocale();
  const t = NOTIFICATIONS_DICT[locale];
  const shop = await getShopSettings();
  if (!shop) redirect(ADMIN.dashboard);
  const domains = await getShopDomains();
  const communications = await getCommunicationSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.page.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.page.subtitle}</p>
      </div>
      <div className="space-y-6 max-w-2xl">
        <MailboxesCard shop={shop} />
        <EmailDomainCard email={domains.email} />
        {/* La tarjeta mantiene estado local; un guardado de buzones debe renovarlo. */}
        <CommunicationRoutesCard key={JSON.stringify(communications)} data={communications} />
      </div>
    </div>
  );
}
