import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ADMIN, PLATFORM } from "@/lib/routes";

export default async function AdminRootPage() {
  const session = await auth();
  if (!session) redirect(ADMIN.login);
  if (session.user.role === "SUPER_ADMIN") redirect(PLATFORM.home);
  redirect(ADMIN.dashboard);
}
