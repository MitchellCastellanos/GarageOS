import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ADMIN, PLATFORM } from "@/lib/routes";
import { isActiveSalesStaffUser } from "@/lib/sales-crm/staff-status";

export default async function AdminRootPage() {
  const session = await auth();
  if (!session) redirect(ADMIN.login);
  if (session.user.role === "SUPER_ADMIN") redirect(PLATFORM.home);
  if (!session.user.shopId && (await isActiveSalesStaffUser(session.user.id))) redirect(PLATFORM.sales);
  redirect(ADMIN.dashboard);
}
