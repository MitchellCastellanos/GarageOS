"use server";

import { ADMIN, PLATFORM, adminPath } from "@/lib/routes";

import { signOut } from "@/lib/auth";

export async function logoutAction() {
  await signOut({ redirectTo: ADMIN.login });
}
