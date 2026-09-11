import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ADMIN, PLATFORM } from "@/lib/routes";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) redirect(ADMIN.login);
  return session;
}

export async function requireSuperAdmin() {
  const session = await requireSession();
  if (session.user.role !== "SUPER_ADMIN") {
    redirect(ADMIN.dashboard);
  }
  return session;
}

export async function requireOwner() {
  const session = await requireSession();
  if (session.user.role !== "OWNER") {
    throw new Error("Solo el dueño del taller puede realizar esta acción");
  }
  if (!session.user.shopId) redirect(ADMIN.login);
  return session;
}

export async function requireShopSession() {
  const session = await requireSession();
  if (session.user.role === "SUPER_ADMIN") {
    redirect(PLATFORM.home);
  }
  if (!session.user.shopId) redirect(ADMIN.login);
  return session;
}
