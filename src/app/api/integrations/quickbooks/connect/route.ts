import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/access";
import { can } from "@/lib/subscription";
import { ADMIN } from "@/lib/routes";
import { getAppUrl } from "@/config/app";
import { startQuickBooksOAuth } from "@/lib/quickbooks/connection";
import { getQboConfig } from "@/lib/quickbooks/client";
import { isEncryptionConfigured } from "@/lib/integrations-crypto";

const back = (code: string) => NextResponse.redirect(`${getAppUrl()}${ADMIN.settings}?tab=integrations&qbo=${code}`);

/** Inicia OAuth: solo el dueño, con plan Pro+ vigente y la integración configurada en el servidor. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.shopId) return NextResponse.redirect(`${getAppUrl()}${ADMIN.login}`);
  if (!(await getEffectivePermissions(session as never)).has("settings.manage")) return back("forbidden");
  if (!getQboConfig() || !isEncryptionConfigured()) return back("not_configured");
  if (!(await can(session.user.shopId, "quickbooks.sync"))) return back("upgrade");
  const url = await startQuickBooksOAuth(session.user.shopId, session.user.id);
  return NextResponse.redirect(url);
}
