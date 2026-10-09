import { db } from "@/lib/db";
import { loadCrmPage } from "@/lib/sales-crm/page";
import { identityCopy } from "@/lib/admin-locale/sales-identity";
import { PageHeader, PermissionDenied } from "@/components/sales-crm/ui";
import { AccountPanel } from "@/components/sales-crm/AccountPanel";

export default async function SalesAccountPage() {
  const { actor, t, locale } = await loadCrmPage("read_assigned_prospects");
  if (!actor) return <PermissionDenied t={t} />;
  const [staff, user] = await Promise.all([
    actor.staffId ? db.platformSalesStaff.findUnique({ where: { id: actor.staffId }, select: { recoveryEmail: true, recoveryEmailVerifiedAt: true, pendingRecoveryEmail: true, salesMode: true } }) : null,
    db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { email: true } }),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={identityCopy(locale).account.title} />
      <AccountPanel locale={locale} login={user.email} recoveryEmail={staff?.recoveryEmail ?? null} verified={!!staff?.recoveryEmailVerifiedAt} pendingEmail={staff?.pendingRecoveryEmail ?? null} mode={staff?.salesMode ?? null} />
    </div>
  );
}
